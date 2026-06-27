import { create } from 'zustand'
import type { MediaItem } from '@shared/schema'

const COUNT = 12
const HEIGHT = 64

/**
 * Lazily-generated thumbnail filmstrips, keyed by media id. The first frame
 * doubles as the media-bin poster; the full set is laid out across timeline clips.
 */
interface ThumbState {
  strips: Record<string, string[]>
  ensure: (media: MediaItem) => void
}

const loading = new Set<string>()

export const useThumbnails = create<ThumbState>((set, get) => ({
  strips: {},
  ensure: (media) => {
    if (get().strips[media.id] || loading.has(media.id)) return
    // Audio-only items have no frames to show.
    if (media.width === 0 && media.height === 0) return
    loading.add(media.id)
    window.api
      .thumbnails(media.filePath, media.duration, COUNT, HEIGHT)
      .then((strip) => {
        loading.delete(media.id)
        set((s) => ({ strips: { ...s.strips, [media.id]: strip } }))
      })
      .catch(() => loading.delete(media.id))
  }
}))
