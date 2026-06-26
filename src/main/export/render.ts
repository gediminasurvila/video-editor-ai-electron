import { clipDuration, type Project } from '@shared/schema'
import { runFfmpeg } from '../ffmpeg/sidecar'

/**
 * MVP export: concatenate the trimmed clips of the first video track into a
 * single MP4. This produces a correct, playable edit for simple timelines and
 * is replaced by a full compositor-driven render (transforms, multiple tracks,
 * effects) in a later milestone.
 */
export async function exportSequence(
  project: Project,
  sequenceId: string,
  outPath: string,
  onProgress?: (line: string) => void
): Promise<void> {
  const seq = project.sequences.find((s) => s.id === sequenceId)
  if (!seq) throw new Error(`Sequence ${sequenceId} not found`)

  const videoTrack = seq.tracks.find((t) => t.type === 'video')
  const clips = [...(videoTrack?.clips ?? [])].sort((a, b) => a.start - b.start)
  if (clips.length === 0) throw new Error('Nothing to export: no clips on the video track')

  const mediaById = new Map(project.mediaPool.map((m) => [m.id, m]))

  const inputs: string[] = []
  const filters: string[] = []
  clips.forEach((clip, i) => {
    const media = mediaById.get(clip.mediaId)
    if (!media) throw new Error(`Media ${clip.mediaId} missing for clip ${clip.id}`)
    inputs.push('-ss', String(clip.inPoint), '-t', String(clipDuration(clip)), '-i', media.filePath)
    filters.push(
      `[${i}:v]scale=${seq.width}:${seq.height}:force_original_aspect_ratio=decrease,` +
        `pad=${seq.width}:${seq.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`
    )
  })

  const concatInputs = clips.map((_, i) => `[v${i}]`).join('')
  const filterGraph = `${filters.join(';')};${concatInputs}concat=n=${clips.length}:v=1:a=0[outv]`

  await runFfmpeg(
    [
      '-y',
      ...inputs,
      '-filter_complex',
      filterGraph,
      '-map',
      '[outv]',
      '-r',
      String(seq.fps),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      outPath
    ],
    onProgress
  )
}
