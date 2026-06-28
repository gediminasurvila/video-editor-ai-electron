import { clipDuration, isTitle, type MediaItem, type Sequence } from '@shared/schema'
import { fadeGain } from '@shared/timing'

/**
 * Real-time preview audio. Decodes each clip's audio to a buffer once, then on
 * play schedules all clips on the Web Audio clock starting at the playhead, with
 * per-clip volume and fade-in/out envelopes. Video and audio run on independent
 * clocks, which is fine for the short clips this editor targets.
 */
export class AudioEngine {
  private ctx = new AudioContext()
  private buffers = new Map<string, AudioBuffer>()
  private loading = new Set<string>()
  private sources: AudioBufferSourceNode[] = []

  constructor(private onReady: () => void) {}

  /** Decode a media item's audio ahead of time so playback starts cleanly. */
  prefetch(media: MediaItem): void {
    if (!media.hasAudio || this.buffers.has(media.id) || this.loading.has(media.id)) return
    this.loading.add(media.id)
    window.api
      .readMediaBytes(media.filePath)
      .then((bytes) => this.ctx.decodeAudioData(bytes.slice(0)))
      .then((buf) => {
        this.buffers.set(media.id, buf)
        this.loading.delete(media.id)
        this.onReady()
      })
      .catch(() => this.loading.delete(media.id))
  }

  /** Start playback of the sequence's audio from `fromTime` (seconds). */
  async play(sequence: Sequence, mediaPool: MediaItem[], fromTime: number): Promise<void> {
    this.stop()
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    const mediaById = new Map(mediaPool.map((m) => [m.id, m]))
    const t0 = this.ctx.currentTime + 0.05

    for (const track of sequence.tracks) {
      if (track.muted) continue
      for (const clip of track.clips) {
        if (isTitle(clip) || clip.volume <= 0) continue
        const media = mediaById.get(clip.mediaId)
        if (!media || !media.hasAudio) continue

        const dur = clipDuration(clip)
        if (clip.start + dur <= fromTime) continue // already passed
        const buf = this.buffers.get(clip.mediaId)
        if (!buf) {
          this.prefetch(media)
          continue
        }

        const localStart = Math.max(0, fromTime - clip.start) // offset within the clip
        const delay = Math.max(0, clip.start - fromTime) // wait before the clip begins
        const sourceOffset = Math.min(clip.inPoint + localStart, buf.duration)
        const playDur = Math.min(dur - localStart, Math.max(0, buf.duration - sourceOffset))
        if (playDur <= 0) continue

        const src = this.ctx.createBufferSource()
        src.buffer = buf
        const gain = this.ctx.createGain()
        src.connect(gain).connect(this.ctx.destination)
        this.scheduleGain(gain, clip, dur, localStart, playDur, t0 + delay)
        src.start(t0 + delay, sourceOffset, playDur)
        this.sources.push(src)
      }
    }
  }

  private scheduleGain(
    gain: GainNode,
    clip: { volume: number; fadeIn: number; fadeOut: number },
    dur: number,
    localStart: number,
    playDur: number,
    when: number
  ): void {
    const at = (local: number): number => clip.volume * fadeGain(local, dur, clip.fadeIn, clip.fadeOut)
    const localEnd = localStart + playDur
    const breakpoints: number[] = []
    if (clip.fadeIn > 0 && clip.fadeIn > localStart && clip.fadeIn < localEnd) breakpoints.push(clip.fadeIn)
    const foStart = dur - clip.fadeOut
    if (clip.fadeOut > 0 && foStart > localStart && foStart < localEnd) breakpoints.push(foStart)
    breakpoints.push(localEnd)
    breakpoints.sort((a, b) => a - b)

    gain.gain.setValueAtTime(at(localStart), when)
    for (const bp of breakpoints) {
      gain.gain.linearRampToValueAtTime(at(bp), when + (bp - localStart))
    }
  }

  stop(): void {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    this.sources = []
  }

  dispose(): void {
    this.stop()
    void this.ctx.close()
  }
}
