import { z } from 'zod'

/**
 * The project data model. These zod schemas are the single source of truth for
 * the shape of a project — they validate IPC payloads, the on-disk `.aivp`
 * file, and the arguments of every editor command (and therefore every MCP
 * tool). Keep all timeline coordinates in seconds (floating point); source
 * in/out points are also in seconds relative to the media's own start.
 */

export const TransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().positive().default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1)
})
export type Transform = z.infer<typeof TransformSchema>

export const EffectSchema = z.object({
  id: z.string(),
  type: z.enum(['brightness', 'contrast', 'saturation']),
  amount: z.number().default(0)
})
export type Effect = z.infer<typeof EffectSchema>

/** A text/title overlay clip (no source media). */
export const TitleSchema = z.object({
  text: z.string().default('Title'),
  fontSize: z.number().positive().default(96),
  color: z.string().default('#ffffff'),
  /** Background fill behind the text: a hex color, or 'transparent' to overlay. */
  background: z.string().default('transparent'),
  align: z.enum(['center', 'left', 'right']).default('center')
})
export type Title = z.infer<typeof TitleSchema>

/** A cross-dissolve into this clip from the previous (overlapping) clip. */
export const TransitionSchema = z.object({
  type: z.enum(['dissolve']).default('dissolve'),
  duration: z.number().min(0).default(1)
})
export type Transition = z.infer<typeof TransitionSchema>

/**
 * A single keyframe for animatable clip properties. `time` is seconds from the
 * clip's start on the timeline. Only the properties you want to animate need to
 * be set; the others fall back to the clip's static values.
 */
export const KeyframeSchema = z.object({
  time: z.number().min(0).describe('Seconds from clip start on the timeline'),
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().positive().optional(),
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  volume: z.number().min(0).max(4).optional()
})
export type Keyframe = z.infer<typeof KeyframeSchema>

export const ClipSchema = z.object({
  id: z.string(),
  /** 'media' clips reference the media pool; 'title' clips render text. */
  kind: z.enum(['media', 'title']).default('media'),
  mediaId: z.string().default(''),
  title: TitleSchema.optional(),
  /** ID of the paired clip on the other track (e.g. audio clip linked to a video clip). */
  linkedClipId: z.string().optional(),
  /** Position on the timeline, in seconds. */
  start: z.number().min(0),
  /** In/out points within the source media (or 0..duration for titles), in seconds. */
  inPoint: z.number().min(0),
  outPoint: z.number().min(0),
  transform: TransformSchema.default({}),
  effects: z.array(EffectSchema).default([]),
  /** Audio gain (1 = unchanged). */
  volume: z.number().min(0).max(4).default(1),
  /** Fade in/out durations in seconds (apply to video opacity and audio gain). */
  fadeIn: z.number().min(0).default(0),
  fadeOut: z.number().min(0).default(0),
  transition: TransitionSchema.optional(),
  /** Animation keyframes. Linearly interpolated; fallback to static transform/volume when empty. */
  keyframes: z.array(KeyframeSchema).default([])
})
export type Clip = z.infer<typeof ClipSchema>

/** Linearly interpolate a numeric property between the two nearest keyframes. */
function lerpProp(
  keyframes: Keyframe[],
  time: number,
  prop: keyof Omit<Keyframe, 'time'>,
  fallback: number
): number {
  const kfs = keyframes.filter((k) => prop in k).sort((a, b) => a.time - b.time)
  if (kfs.length === 0) return fallback
  const before = [...kfs].reverse().find((k) => k.time <= time)
  const after = kfs.find((k) => k.time > time)
  if (!before) return after![prop] as number
  if (!after) return before[prop] as number
  const t = (time - before.time) / (after.time - before.time)
  return (before[prop] as number) * (1 - t) + (after[prop] as number) * t
}

/**
 * Resolve the effective Transform for a clip at a given absolute timeline time
 * (in seconds), applying keyframe animation on top of the clip's static values.
 */
export function resolveTransform(clip: Clip, time: number): Transform {
  const kfs = clip.keyframes
  if (kfs.length === 0) return clip.transform
  const local = time - clip.start
  return {
    x: lerpProp(kfs, local, 'x', clip.transform.x),
    y: lerpProp(kfs, local, 'y', clip.transform.y),
    scale: lerpProp(kfs, local, 'scale', clip.transform.scale),
    rotation: lerpProp(kfs, local, 'rotation', clip.transform.rotation),
    opacity: lerpProp(kfs, local, 'opacity', clip.transform.opacity)
  }
}

/** Contain-fit (drawW × drawH) for a frame (mw×mh) inside a canvas (seqW×seqH). */
export function containFit(
  mw: number, mh: number, seqW: number, seqH: number
): { drawW: number; drawH: number } {
  if (mw === 0 || mh === 0) return { drawW: seqW, drawH: seqH }
  const fa = mw / mh
  const sa = seqW / seqH
  return fa > sa ? { drawW: seqW, drawH: seqW / fa } : { drawW: seqH * fa, drawH: seqH }
}

/** Scale that fills (covers) the canvas completely — no letterbox bars. */
export function fillScale(mw: number, mh: number, seqW: number, seqH: number): number {
  const { drawW, drawH } = containFit(mw, mh, seqW, seqH)
  return Math.max(seqW / drawW, seqH / drawH)
}

/** Resolve effective volume for a clip at a given time. */
export function resolveVolume(clip: Clip, time: number): number {
  const kfs = clip.keyframes.filter((k) => 'volume' in k)
  if (kfs.length === 0) return clip.volume
  return lerpProp(kfs, time - clip.start, 'volume', clip.volume)
}

export const TrackSchema = z.object({
  id: z.string(),
  type: z.enum(['video', 'audio']),
  name: z.string(),
  muted: z.boolean().default(false),
  clips: z.array(ClipSchema).default([])
})
export type Track = z.infer<typeof TrackSchema>

export const MediaItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Absolute path on disk. */
  filePath: z.string(),
  duration: z.number().nonnegative(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  fps: z.number().nonnegative(),
  hasAudio: z.boolean(),
  codec: z.string().optional()
})
export type MediaItem = z.infer<typeof MediaItemSchema>

export const SequenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.number().positive().default(30),
  tracks: z.array(TrackSchema).default([])
})
export type Sequence = z.infer<typeof SequenceSchema>

export const ProjectSchema = z.object({
  /** File format version, bumped on breaking changes to this schema. */
  version: z.literal(1),
  id: z.string(),
  name: z.string(),
  mediaPool: z.array(MediaItemSchema).default([]),
  sequences: z.array(SequenceSchema).default([]),
  activeSequenceId: z.string().nullable().default(null)
})
export type Project = z.infer<typeof ProjectSchema>

export function clipDuration(clip: Clip): number {
  return Math.max(0, clip.outPoint - clip.inPoint)
}

export function isTitle(clip: Clip): boolean {
  return clip.kind === 'title'
}

export function sequenceDuration(seq: Sequence): number {
  let end = 0
  for (const track of seq.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.start + clipDuration(clip))
    }
  }
  return end
}
