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

export const ClipSchema = z.object({
  id: z.string(),
  mediaId: z.string(),
  /** Position on the timeline, in seconds. */
  start: z.number().min(0),
  /** In/out points within the source media, in seconds. */
  inPoint: z.number().min(0),
  outPoint: z.number().min(0),
  transform: TransformSchema.default({}),
  effects: z.array(EffectSchema).default([])
})
export type Clip = z.infer<typeof ClipSchema>

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

export function sequenceDuration(seq: Sequence): number {
  let end = 0
  for (const track of seq.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.start + clipDuration(clip))
    }
  }
  return end
}
