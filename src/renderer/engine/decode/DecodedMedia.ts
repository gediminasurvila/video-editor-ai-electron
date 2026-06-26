import { demuxVideo } from './demux'
import { nearestIndex } from './nearest'

/** Soft cap on decoded frames held in GPU memory (≈60s at 30fps). */
const MAX_FRAMES = 1800

/**
 * A fully-decoded video: every frame of the (capped) source is decoded once via
 * WebCodecs and kept for instant, frame-accurate scrubbing. Lazy windowed
 * decoding is a later optimization; decode-all keeps the preview path simple and
 * correct for the short clips the editor targets today.
 */
export class DecodedMedia {
  private frames: VideoFrame[] = []

  private constructor(
    frames: VideoFrame[],
    readonly width: number,
    readonly height: number
  ) {
    this.frames = frames
  }

  static async load(bytes: ArrayBuffer): Promise<DecodedMedia> {
    const { config, chunks } = await demuxVideo(bytes)

    const frames: VideoFrame[] = []
    const decoder = new VideoDecoder({
      output: (frame) => {
        if (frames.length < MAX_FRAMES) frames.push(frame)
        else frame.close()
      },
      error: (e) => console.error('VideoDecoder error:', e)
    })
    decoder.configure(config)

    for (const chunk of chunks) {
      if (frames.length >= MAX_FRAMES) break
      decoder.decode(chunk)
    }
    await decoder.flush()
    decoder.close()

    frames.sort((a, b) => a.timestamp - b.timestamp)
    return new DecodedMedia(frames, config.codedWidth ?? 0, config.codedHeight ?? 0)
  }

  /** Nearest decoded frame to a source position (seconds), or null if empty. */
  frameAt(sourceSeconds: number): VideoFrame | null {
    const i = nearestIndex(
      this.frames.map((f) => f.timestamp),
      sourceSeconds * 1e6
    )
    return i < 0 ? null : this.frames[i]
  }

  dispose(): void {
    for (const f of this.frames) f.close()
    this.frames = []
  }
}
