import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { clipDuration, isTitle, type Clip, type Project } from '@shared/schema'
import { runFfmpeg } from '../ffmpeg/sidecar'

/**
 * Export the active sequence's first video track to an MP4. Each clip is
 * normalized to the sequence frame, then the clips are chained left-to-right:
 * a clip with a cross-dissolve transition is blended into the running stream
 * with xfade/acrossfade (overlapping by the transition duration); otherwise it
 * is concatenated. Per-clip video/audio fades, audio volume, and title clips
 * (rendered to PNG by the renderer) are baked in.
 */
export async function exportSequence(
  project: Project,
  sequenceId: string,
  outPath: string,
  titlePngs: Record<string, string>,
  onProgress?: (line: string) => void
): Promise<void> {
  const seq = project.sequences.find((s) => s.id === sequenceId)
  if (!seq) throw new Error(`Sequence ${sequenceId} not found`)

  const videoTrack = seq.tracks.find((t) => t.type === 'video')
  const clips = [...(videoTrack?.clips ?? [])].sort((a, b) => a.start - b.start)
  if (clips.length === 0) throw new Error('Nothing to export: no clips on the video track')

  const mediaById = new Map(project.mediaPool.map((m) => [m.id, m]))
  const work = await mkdtemp(join(tmpdir(), 'video-ai-export-'))

  try {
    const inputs: string[] = []
    const segs: string[] = [] // per-clip normalized [v{i}] / [a{i}]
    const durations: number[] = []

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const dur = clipDuration(clip)
      durations.push(dur)
      const title = isTitle(clip)

      if (title) {
        const png = titlePngs[clip.id]
        if (!png) throw new Error(`Missing rendered title for clip ${clip.id}`)
        const file = join(work, `title-${i}.png`)
        await writeFile(file, Buffer.from(png.replace(/^data:image\/png;base64,/, ''), 'base64'))
        inputs.push('-loop', '1', '-t', dur.toFixed(3), '-i', file)
      } else {
        const media = mediaById.get(clip.mediaId)
        if (!media) throw new Error(`Media ${clip.mediaId} missing for clip ${clip.id}`)
        inputs.push('-ss', clip.inPoint.toFixed(3), '-t', dur.toFixed(3), '-i', media.filePath)
      }

      let v =
        `[${i}:v]scale=${seq.width}:${seq.height}:force_original_aspect_ratio=decrease,` +
        `pad=${seq.width}:${seq.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${seq.fps},format=yuv420p`
      v += videoFades(clip, dur)
      segs.push(`${v}[v${i}]`)

      const hasAudio = !title && mediaById.get(clip.mediaId)?.hasAudio && clip.volume > 0
      if (hasAudio) {
        let a = `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${clip.volume}`
        a += audioFades(clip, dur)
        segs.push(`${a}[a${i}]`)
      } else {
        segs.push(
          `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
        )
      }
    }

    // Chain clips: xfade/acrossfade for dissolves, concat for cuts.
    const chain: string[] = []
    let curV = 'v0'
    let curA = 'a0'
    let total = durations[0]
    for (let i = 1; i < clips.length; i++) {
      const di = durations[i]
      const raw = clips[i].transition?.duration ?? 0
      // A dissolve overlaps the running stream and this clip by D.
      const d = Math.min(raw, durations[i - 1] * 0.99, di * 0.99)
      if (d > 0.05) {
        const offset = (total - d).toFixed(3)
        chain.push(`[${curV}][v${i}]xfade=transition=fade:duration=${d.toFixed(3)}:offset=${offset}[vx${i}]`)
        chain.push(`[${curA}][a${i}]acrossfade=d=${d.toFixed(3)}[ax${i}]`)
        curV = `vx${i}`
        curA = `ax${i}`
        total += di - d
      } else {
        chain.push(`[${curV}][v${i}]concat=n=2:v=1[vc${i}]`)
        chain.push(`[${curA}][a${i}]concat=n=2:v=0:a=1[ac${i}]`)
        curV = `vc${i}`
        curA = `ac${i}`
        total += di
      }
    }

    const filterGraph = [...segs, ...chain].join(';')

    await runFfmpeg(
      [
        '-y',
        ...inputs,
        '-filter_complex',
        filterGraph,
        '-map',
        `[${curV}]`,
        '-map',
        `[${curA}]`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        outPath
      ],
      onProgress
    )
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

function videoFades(clip: Clip, dur: number): string {
  let f = ''
  if (clip.fadeIn > 0) f += `,fade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`
  if (clip.fadeOut > 0)
    f += `,fade=t=out:st=${Math.max(0, dur - clip.fadeOut).toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`
  return f
}

function audioFades(clip: Clip, dur: number): string {
  let f = ''
  if (clip.fadeIn > 0) f += `,afade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`
  if (clip.fadeOut > 0)
    f += `,afade=t=out:st=${Math.max(0, dur - clip.fadeOut).toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`
  return f
}
