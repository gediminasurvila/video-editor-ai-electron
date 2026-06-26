import { clipDuration, type MediaItem, type Project, type Sequence } from '@shared/schema'
import { Compositor, type Layer } from './compositor/Compositor'
import { DecodedMedia } from './decode/DecodedMedia'

/**
 * Preview engine: owns the WebGL compositor and a cache of decoded media, and
 * renders the active frame of a sequence at a given time. Media is decoded lazily
 * the first time it's needed; `onMediaReady` lets the UI redraw once a load
 * finishes so a freshly-imported clip appears without user interaction.
 */
export class Engine {
  private compositor: Compositor
  private cache = new Map<string, DecodedMedia>()
  private loading = new Set<string>()

  constructor(
    canvas: HTMLCanvasElement,
    private onMediaReady: () => void
  ) {
    this.compositor = new Compositor(canvas)
  }

  private startLoad(item: MediaItem): void {
    if (this.cache.has(item.id) || this.loading.has(item.id)) return
    // Audio-only items have no decodable video track.
    if (item.width === 0 && item.height === 0) return
    this.loading.add(item.id)
    window.api
      .readMediaBytes(item.filePath)
      .then((bytes) => DecodedMedia.load(bytes))
      .then((decoded) => {
        this.cache.set(item.id, decoded)
        this.loading.delete(item.id)
        this.onMediaReady()
      })
      .catch((err) => {
        this.loading.delete(item.id)
        console.error(`Failed to decode ${item.name}:`, err)
      })
  }

  /** Render the frame visible at `time` (seconds) on the active sequence. */
  render(project: Project, sequence: Sequence, time: number): void {
    if (this.compositor) {
      // Keep the framebuffer matched to the sequence resolution.
      this.compositor.resize(sequence.width, sequence.height)
    }
    const mediaById = new Map(project.mediaPool.map((m) => [m.id, m]))
    const layers: Layer[] = []

    for (const track of sequence.tracks) {
      if (track.type !== 'video') continue
      const clip = track.clips.find(
        (c) => time >= c.start && time < c.start + clipDuration(c)
      )
      if (!clip) continue
      const item = mediaById.get(clip.mediaId)
      if (!item) continue

      const decoded = this.cache.get(item.id)
      if (!decoded) {
        this.startLoad(item)
        continue
      }
      const sourceTime = clip.inPoint + (time - clip.start)
      const frame = decoded.frameAt(sourceTime)
      if (!frame) continue
      layers.push({
        frame,
        frameWidth: decoded.width || item.width,
        frameHeight: decoded.height || item.height,
        transform: clip.transform
      })
    }

    this.compositor.render(layers)
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose()
    this.cache.clear()
    this.compositor.dispose()
  }
}
