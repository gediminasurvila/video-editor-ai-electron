import {
  clipDuration,
  isTitle,
  resolveTransform,
  type Clip,
  type MediaItem,
  type Project,
  type Sequence
} from '@shared/schema'
import { fadeGain, crossfadeAlpha } from '@shared/timing'
import { Compositor, type Layer } from './compositor/Compositor'
import { DecodedMedia } from './decode/DecodedMedia'
import { TitleRenderer } from './TitleRenderer'

/**
 * Preview engine: owns the WebGL compositor and a cache of decoded media, and
 * renders the frame visible at a given time — including title clips, fade in/out
 * ramps, and cross-dissolves between overlapping clips. Media is decoded lazily;
 * `onMediaReady` lets the UI redraw once a load finishes.
 */
export class Engine {
  private compositor: Compositor
  private titles = new TitleRenderer()
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
    if (item.width === 0 && item.height === 0) return
    this.loading.add(item.id)
    window.api
      .transcodeForPreview(item.filePath)
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

  /** Opacity multiplier for a clip at `time` from its fade and cross-dissolve. */
  private alphaFor(clip: Clip, time: number): number {
    const dur = clipDuration(clip)
    const local = time - clip.start
    let a = fadeGain(local, dur, clip.fadeIn, clip.fadeOut)
    if (clip.transition && clip.transition.duration > 0 && local < clip.transition.duration) {
      a *= crossfadeAlpha(local, clip.transition.duration)
    }
    return a
  }

  render(project: Project, sequence: Sequence, time: number): void {
    this.compositor.resize(sequence.width, sequence.height)
    const mediaById = new Map(project.mediaPool.map((m) => [m.id, m]))
    const layers: Layer[] = []

    for (const track of [...sequence.tracks].reverse()) {
      if (track.type !== 'video') continue
      // Clips active at `time`, earliest first so a dissolve draws incoming on top.
      const active = track.clips
        .filter((c) => time >= c.start && time < c.start + clipDuration(c))
        .sort((a, b) => a.start - b.start)

      for (const clip of active) {
        const alpha = this.alphaFor(clip, time)

        const transform = resolveTransform(clip, time)

        if (isTitle(clip) && clip.title) {
          const canvas = this.titles.get(clip.id, clip.title, sequence.width, sequence.height)
          layers.push({
            frame: canvas,
            frameWidth: sequence.width,
            frameHeight: sequence.height,
            transform,
            alpha
          })
          continue
        }

        const item = mediaById.get(clip.mediaId)
        if (!item) continue
        const decoded = this.cache.get(item.id)
        if (!decoded) {
          this.startLoad(item)
          continue
        }
        const frame = decoded.frameAt(clip.inPoint + (time - clip.start))
        if (!frame) continue
        layers.push({
          frame,
          frameWidth: decoded.width || item.width,
          frameHeight: decoded.height || item.height,
          transform,
          alpha
        })
      }
    }

    this.compositor.render(layers)
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose()
    this.cache.clear()
    this.compositor.dispose()
  }
}
