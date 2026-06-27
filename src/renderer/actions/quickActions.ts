import { clipDuration, type MediaItem } from '@shared/schema'
import { useEditor, activeSequence } from '../state/store'
import { runCommand } from '../commands'

/**
 * High-level, "Camtasia-style" actions composed from the editor commands. The
 * goal is zero friction: importing media should produce a ready-to-edit project
 * with the clip already on the timeline — no manual sequence/track setup.
 */

function endOfVideoTrack(trackId: string): number {
  const seq = activeSequence(useEditor.getState().project)
  const track = seq?.tracks.find((t) => t.id === trackId)
  if (!track) return 0
  return track.clips.reduce((max, c) => Math.max(max, c.start + clipDuration(c)), 0)
}

/** Ensure there's an active sequence (sized to `media`) and return a video track id. */
async function ensureVideoTrack(media?: MediaItem): Promise<string> {
  const seq = activeSequence(useEditor.getState().project)
  if (seq) {
    const existing = seq.tracks.find((t) => t.type === 'video')
    if (existing) return existing.id
    const added = (await runCommand('add_track', { type: 'video' })) as { trackId: string }
    return added.trackId
  }
  await runCommand('create_sequence', {
    name: 'My Movie',
    width: media && media.width > 0 ? media.width : 1920,
    height: media && media.height > 0 ? media.height : 1080,
    fps: media && media.fps > 0 ? media.fps : 30
  })
  const video = (await runCommand('add_track', { type: 'video' })) as { trackId: string }
  await runCommand('add_track', { type: 'audio' })
  return video.trackId
}

/** Import files from disk and append each onto the timeline, creating the project as needed. */
export async function importFiles(paths: string[]): Promise<void> {
  for (const filePath of paths) {
    const { mediaId } = (await runCommand('import_media', { filePath })) as { mediaId: string }
    const media = useEditor.getState().project.mediaPool.find((m) => m.id === mediaId)
    const trackId = await ensureVideoTrack(media)
    const start = endOfVideoTrack(trackId)
    const { clipId } = (await runCommand('add_clip', { trackId, mediaId, start })) as {
      clipId: string
    }
    useEditor.getState().select(clipId)
  }
}

/** Open the file picker and import the chosen media. */
export async function importViaDialog(): Promise<void> {
  const paths = await window.api.openMediaDialog()
  if (paths.length) await importFiles(paths)
}

/** Add an already-imported media item to the timeline (double-click / drag from bin). */
export async function addMediaToTimeline(mediaId: string, atTime?: number): Promise<void> {
  const media = useEditor.getState().project.mediaPool.find((m) => m.id === mediaId)
  if (!media) return
  const trackId = await ensureVideoTrack(media)
  const start = atTime ?? endOfVideoTrack(trackId)
  const { clipId } = (await runCommand('add_clip', { trackId, mediaId, start })) as {
    clipId: string
  }
  useEditor.getState().select(clipId)
}
