import { z } from 'zod'

/**
 * The shared command (tool) layer. Every mutation a user, the in-app agent, or
 * an external MCP client can perform is described here exactly once: a name, a
 * human/LLM-facing description, and a zod schema for its arguments. The renderer
 * implements the handlers (see src/renderer/commands), the MCP server turns each
 * entry into an MCP tool, and the in-app agent turns each into a tool-use schema.
 *
 * One definition, three callers — this is what makes the editor "built for AI".
 */

export const commandSchemas = {
  import_media: z.object({
    filePath: z.string().describe('Absolute path to a video or audio file on disk')
  }),
  create_sequence: z.object({
    name: z.string().default('Sequence'),
    width: z.number().int().positive().default(1920),
    height: z.number().int().positive().default(1080),
    fps: z.number().positive().default(30)
  }),
  add_track: z.object({
    type: z.enum(['video', 'audio']),
    name: z.string().optional()
  }),
  add_clip: z.object({
    trackId: z.string(),
    mediaId: z.string(),
    start: z.number().min(0).describe('Timeline position in seconds'),
    inPoint: z.number().min(0).default(0).describe('Source in-point in seconds'),
    outPoint: z
      .number()
      .min(0)
      .optional()
      .describe('Source out-point in seconds; defaults to the media duration')
  }),
  split_clip: z.object({
    clipId: z.string(),
    at: z.number().min(0).describe('Timeline position in seconds where the clip is cut')
  }),
  trim_clip: z.object({
    clipId: z.string(),
    inPoint: z.number().min(0).optional(),
    outPoint: z.number().min(0).optional()
  }),
  move_clip: z.object({
    clipId: z.string(),
    start: z.number().min(0),
    trackId: z.string().optional().describe('Move to a different track')
  }),
  set_property: z.object({
    clipId: z.string(),
    transform: z
      .object({
        x: z.number().optional(),
        y: z.number().optional(),
        scale: z.number().positive().optional(),
        rotation: z.number().optional(),
        opacity: z.number().min(0).max(1).optional()
      })
      .optional()
  }),
  delete_clip: z.object({
    clipId: z.string()
  }),
  add_title: z.object({
    text: z.string().default('Title'),
    start: z.number().min(0).optional().describe('Timeline position in seconds; defaults to the end'),
    duration: z.number().positive().default(3),
    trackId: z.string().optional().describe('Video track id; defaults to the first video track')
  }),
  set_title: z.object({
    clipId: z.string(),
    text: z.string().optional(),
    fontSize: z.number().positive().optional(),
    color: z.string().optional(),
    background: z.string().optional().describe("Hex color or 'transparent'")
  }),
  set_audio: z.object({
    clipId: z.string(),
    volume: z.number().min(0).max(4).optional().describe('1 = unchanged'),
    fadeIn: z.number().min(0).optional().describe('Fade-in seconds'),
    fadeOut: z.number().min(0).optional().describe('Fade-out seconds')
  }),
  set_transition: z.object({
    clipId: z.string(),
    type: z.enum(['dissolve', 'none']).default('dissolve'),
    duration: z.number().min(0).default(1).describe('Cross-dissolve seconds with the previous clip')
  }),
  delete_range: z.object({
    inPoint: z.number().min(0).describe('Range start in seconds'),
    outPoint: z.number().min(0).describe('Range end in seconds'),
    ripple: z
      .boolean()
      .default(true)
      .describe('Shift later clips left after removing the range (default true)')
  }),
  get_timeline_state: z.object({}),
  export: z.object({
    outPath: z.string().describe('Absolute path for the rendered output file'),
    format: z.enum(['mp4']).default('mp4')
  })
} as const

export type CommandName = keyof typeof commandSchemas
export type CommandArgs<K extends CommandName> = z.infer<(typeof commandSchemas)[K]>

export const commandDescriptions: Record<CommandName, string> = {
  import_media: 'Import a media file from disk into the project media pool.',
  create_sequence: 'Create a new sequence (timeline) and make it active.',
  add_track: 'Add a video or audio track to the active sequence.',
  add_clip: 'Place a media item onto a track at a given timeline position.',
  split_clip: 'Split a clip into two at a timeline position (razor cut).',
  trim_clip: 'Change a clip\'s source in/out points.',
  move_clip: 'Move a clip to a new start time and optionally a different track.',
  set_property: 'Set transform properties (position, scale, rotation, opacity) on a clip.',
  delete_clip: 'Remove a clip from the timeline.',
  add_title: 'Add a text/title clip to a video track.',
  set_title: 'Edit a title clip\'s text and style (font size, color, background).',
  set_audio: 'Set a clip\'s volume and audio/video fade-in and fade-out durations.',
  set_transition:
    'Set or remove a cross-dissolve transition into a clip from the previous one (overlaps them).',
  delete_range:
    'Delete every clip (or portion of a clip) between inPoint and outPoint seconds. Pass ripple:true (default) to close the resulting gap.',
  get_timeline_state: 'Return the current project state: media pool, sequences, tracks, and clips.',
  export: 'Render the active sequence to a video file.'
}

export const commandNames = Object.keys(commandSchemas) as CommandName[]
