import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { clipDuration, isTitle, type Clip, type Project } from '@shared/schema'
import { runFfmpeg } from '../ffmpeg/sidecar'

/**
 * Export the active sequence's first video track to an MP4 by normalizing each
 * clip to the sequence frame and concatenating them, baking in:
 *  - title clips (rendered to PNG by the renderer, passed in `titlePngs`)
 *  - per-clip video fade-in/out
 *  - per-clip audio volume + fades (silent track for titles / muted media)
 *
 * Cross-dissolve transitions are shown in the preview but not yet baked here;
 * clips with a transition export as a straight cut.
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
    const filters: string[] = []
    const concatLabels: string[] = []

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const dur = clipDuration(clip)
      const title = isTitle(clip)

      // --- input ---
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

      // --- video chain ---
      let v =
        `[${i}:v]scale=${seq.width}:${seq.height}:force_original_aspect_ratio=decrease,` +
        `pad=${seq.width}:${seq.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${seq.fps},format=yuv420p`
      v += videoFades(clip, dur)
      filters.push(`${v}[v${i}]`)

      // --- audio chain ---
      const hasAudio = !title && mediaById.get(clip.mediaId)?.hasAudio && clip.volume > 0
      if (hasAudio) {
        let a = `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${clip.volume}`
        a += audioFades(clip, dur)
        filters.push(`${a}[a${i}]`)
      } else {
        filters.push(
          `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
        )
      }
      concatLabels.push(`[v${i}][a${i}]`)
    }

    const filterGraph =
      filters.join(';') +
      `;${concatLabels.join('')}concat=n=${clips.length}:v=1:a=1[outv][outa]`

    await runFfmpeg(
      [
        '-y',
        ...inputs,
        '-filter_complex',
        filterGraph,
        '-map',
        '[outv]',
        '-map',
        '[outa]',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
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
  if (clip.fadeOut > 0) f += `,fade=t=out:st=${Math.max(0, dur - clip.fadeOut).toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`
  return f
}

function audioFades(clip: Clip, dur: number): string {
  let f = ''
  if (clip.fadeIn > 0) f += `,afade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`
  if (clip.fadeOut > 0) f += `,afade=t=out:st=${Math.max(0, dur - clip.fadeOut).toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`
  return f
}
