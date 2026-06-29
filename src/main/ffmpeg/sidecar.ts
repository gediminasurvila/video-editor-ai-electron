import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import type { ProbeResult } from '@shared/ipc'

const execFileAsync = promisify(execFile)

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif'])

/**
 * Resolve the ffmpeg/ffprobe binaries. We bundle them via ffmpeg-static /
 * ffprobe-static so packaged apps are self-contained on every platform. In a
 * packaged (asar) build the path lives in `app.asar.unpacked` (see
 * electron-builder `asarUnpack`). An env override or PATH fallback covers dev
 * setups where the static binary is unavailable.
 */
function binary(name: 'ffmpeg' | 'ffprobe'): string {
  const fromEnv = process.env[name.toUpperCase() + '_PATH']
  if (fromEnv) return fromEnv
  const staticPath = name === 'ffmpeg' ? ffmpegStatic : ffprobeStatic.path
  if (staticPath) return staticPath.replace('app.asar', 'app.asar.unpacked')
  return name
}

interface FfprobeStream {
  codec_type: 'video' | 'audio'
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  duration?: string
}

interface FfprobeOutput {
  streams: FfprobeStream[]
  format: { duration?: string }
}

function parseFps(avg?: string): number {
  if (!avg || avg === '0/0') return 0
  const [num, den] = avg.split('/').map(Number)
  if (!den) return 0
  return num / den
}

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(binary('ffprobe'), [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath
  ])
  const data = JSON.parse(stdout) as FfprobeOutput
  const video = data.streams.find((s) => s.codec_type === 'video')
  const audio = data.streams.find((s) => s.codec_type === 'audio')
  const rawDuration = Number(data.format.duration ?? video?.duration ?? audio?.duration ?? 0)

  // Still images (png/jpg/webp/gif) probe as video streams with N/A duration.
  // Give them a 5-second default so they can be placed on the timeline.
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const isImage = IMAGE_EXTS.has(ext)
  const duration = (Number.isFinite(rawDuration) && rawDuration > 0) ? rawDuration : (isImage ? 5 : 0)

  return {
    media: {
      filePath,
      duration,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      fps: parseFps(video?.avg_frame_rate),
      hasAudio: Boolean(audio) && !isImage,
      codec: video?.codec_name ?? audio?.codec_name
    }
  }
}

/**
 * MVP export: re-encode the active sequence from source media using a simple
 * edit-decision-list approach. A full compositor render path replaces this in a
 * later milestone; for now we render the first video track sequentially with the
 * filter graph so end-to-end export works.
 */
/** Run ffmpeg and collect its stdout as binary (used for piped thumbnails). */
function ffmpegStdout(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary('ffmpeg'), args)
    const chunks: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg exited ${code}`))
    )
  })
}

/**
 * Extract `count` evenly-spaced thumbnail frames as JPEG data URLs — used for the
 * media-bin poster and the timeline filmstrip. Returns one data URL per frame
 * (empty string for any frame that fails to decode).
 */
export async function generateThumbnails(
  filePath: string,
  duration: number,
  count: number,
  height: number
): Promise<string[]> {
  const safeDuration = duration > 0 ? duration : 1
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const t = (safeDuration * (i + 0.5)) / count
    try {
      const buf = await ffmpegStdout([
        '-ss',
        t.toFixed(3),
        '-i',
        filePath,
        '-frames:v',
        '1',
        '-vf',
        `scale=-2:${height}`,
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-'
      ])
      out.push(buf.length ? `data:image/jpeg;base64,${buf.toString('base64')}` : '')
    } catch {
      out.push('')
    }
  }
  return out
}

/** Extract audio from a media file as 16 kHz mono 16-bit PCM WAV (Whisper-optimal format). */
export async function extractAudio(inputPath: string, outPath: string): Promise<void> {
  await execFileAsync(binary('ffmpeg'), [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    outPath
  ])
}

/** filePath → temp MP4 path; avoids re-transcoding across Engine reloads. */
const previewCache = new Map<string, string>()

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

/**
 * Transcode any video/image to an H264 MP4 that WebCodecs can decode.
 * Scales to ≤1280px wide (ultrafast preset). Result is cached in tmpdir.
 */
export async function transcodeForPreview(filePath: string): Promise<Buffer> {
  const cached = previewCache.get(filePath)
  if (cached && await fileExists(cached)) return readFile(cached)

  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const isImage = IMAGE_EXTS.has(ext)
  const out = join(tmpdir(), `video-ai-preview-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`)
  previewCache.set(filePath, out)

  const scaleFilter = "scale='min(1280,iw)':-2,format=yuv420p"
  const args = isImage
    ? ['-y', '-loop', '1', '-i', filePath, '-c:v', 'libx264', '-preset', 'ultrafast',
       '-crf', '18', '-vf', scaleFilter, '-t', '1', '-movflags', '+faststart', '-an', out]
    : ['-y', '-i', filePath, '-c:v', 'libx264', '-preset', 'ultrafast',
       '-crf', '23', '-vf', scaleFilter, '-movflags', '+faststart', '-an', out]

  await execFileAsync(binary('ffmpeg'), args)
  return readFile(out)
}

export async function runFfmpeg(args: string[], onProgress?: (line: string) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile(binary('ffmpeg'), args)
    child.stderr?.on('data', (chunk: Buffer) => onProgress?.(chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))
    )
  })
}
