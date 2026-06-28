import { clipDuration, type Clip, type MediaItem } from '@shared/schema'
import { useEditor, activeSequence } from '../state/store'
import { runCommand } from '../commands'

/**
 * High-level "Camtasia-style" actions. Importing video auto-creates a paired
 * audio clip on the audio track; both clips share a linkedClipId so moves and
 * trims stay in sync until the user explicitly detaches them.
 */

/** Ensure the active sequence exists, sized to the first media if provided. */
async function ensureSequence(media?: MediaItem): Promise<void> {
  if (activeSequence(useEditor.getState().project)) return
  await runCommand('create_sequence', {
    name: 'My Movie',
    width: media && media.width > 0 ? media.width : 1920,
    height: media && media.height > 0 ? media.height : 1080,
    fps: media && media.fps > 0 ? media.fps : 30
  })
}

/** Ensure both a video and audio track exist; return their IDs. */
async function ensureTracks(): Promise<{ videoTrackId: string; audioTrackId: string }> {
  let seq = activeSequence(useEditor.getState().project)!
  let videoTrackId: string
  const vt = seq.tracks.find((t) => t.type === 'video')
  if (vt) {
    videoTrackId = vt.id
  } else {
    videoTrackId = ((await runCommand('add_track', { type: 'video' })) as { trackId: string }).trackId
  }

  seq = activeSequence(useEditor.getState().project)!
  let audioTrackId: string
  const at = seq.tracks.find((t) => t.type === 'audio')
  if (at) {
    audioTrackId = at.id
  } else {
    audioTrackId = ((await runCommand('add_track', { type: 'audio' })) as { trackId: string }).trackId
  }

  return { videoTrackId, audioTrackId }
}

/** Import files from disk and append each onto the timeline. */
export async function importFiles(paths: string[]): Promise<void> {
  for (const filePath of paths) {
    const { mediaId } = (await runCommand('import_media', { filePath })) as { mediaId: string }
    await addMediaToTimeline(mediaId)
  }
}

export async function importViaDialog(): Promise<void> {
  const paths = await window.api.openMediaDialog()
  if (paths.length) await importFiles(paths)
}

export async function importFolderViaDialog(): Promise<void> {
  const paths = await window.api.openFolderDialog()
  if (paths.length) await importFiles(paths)
}

/**
 * Add an already-imported media item to the timeline. Video files with audio
 * get a linked audio clip on the audio track so they move and trim together.
 * Optionally target a specific track and start time (e.g. from a drag drop).
 */
export async function addMediaToTimeline(
  mediaId: string,
  atTime?: number,
  targetTrackId?: string
): Promise<void> {
  const media = useEditor.getState().project.mediaPool.find((m) => m.id === mediaId)
  if (!media) return

  await ensureSequence(media)
  const { videoTrackId, audioTrackId } = await ensureTracks()

  const isVideo = media.width > 0
  const hasAudio = media.hasAudio

  const primaryClipId = crypto.randomUUID()
  const audioClipId = isVideo && hasAudio ? crypto.randomUUID() : null

  useEditor.getState().commit((p) => {
    const seq = p.sequences.find((s) => s.id === p.activeSequenceId)!
    const primaryTrackId = targetTrackId ?? (isVideo ? videoTrackId : audioTrackId)
    const primaryTrack = seq.tracks.find((t) => t.id === primaryTrackId)
    const linkedTrack = audioClipId ? seq.tracks.find((t) => t.id === audioTrackId) : null
    if (!primaryTrack) return

    const start =
      atTime ?? primaryTrack.clips.reduce((m, c) => Math.max(m, c.start + clipDuration(c)), 0)

    const baseClip: Omit<Clip, 'id' | 'linkedClipId'> = {
      kind: 'media',
      mediaId,
      start,
      inPoint: 0,
      outPoint: media.duration,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      effects: [],
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      keyframes: []
    }

    primaryTrack.clips.push({
      ...baseClip,
      id: primaryClipId,
      linkedClipId: audioClipId ?? undefined
    })

    if (audioClipId && linkedTrack) {
      linkedTrack.clips.push({
        ...baseClip,
        id: audioClipId,
        linkedClipId: primaryClipId
      })
    }
  })

  useEditor.getState().select(primaryClipId)
}
