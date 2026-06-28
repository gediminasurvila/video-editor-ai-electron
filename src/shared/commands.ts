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
  insert_clips: z.object({
    clips: z
      .array(
        z.object({
          trackId: z.string(),
          mediaId: z.string(),
          at: z.number().min(0).describe('Timeline position where the clip is inserted (seconds)'),
          inPoint: z.number().min(0).default(0),
          outPoint: z.number().min(0).optional()
        })
      )
      .min(1)
      .describe(
        'Ripple-insert one or more clips at given positions, pushing all existing clips that start at or after the insertion point to the right.'
      )
  }),
  split_clip: z.object({
    clipId: z.string(),
    at: z.number().min(0).describe('Timeline position in seconds where the clip is cut')
  }),
  trim_clip: z.object({
    clipId: z.string(),
    inPoint: z.number().min(0).optional(),
    outPoint: z.number().min(0).optional(),
    ripple: z
      .boolean()
      .default(false)
      .describe('When true, shift all clips to the right of the edit point to close the gap')
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
      .optional(),
    speed: z.number().positive().optional().describe('Playback rate: 1 = normal, 2 = 2× speed'),
    volume: z.number().min(0).max(4).optional().describe('Audio volume: 1 = unchanged'),
    fadeIn: z.number().min(0).optional(),
    fadeOut: z.number().min(0).optional()
  }),
  delete_clip: z.object({
    clipId: z.string(),
    ripple: z
      .boolean()
      .default(false)
      .describe('When true, shift all clips to the right of the deleted clip left to close the gap')
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
  set_keyframe: z.object({
    clipId: z.string(),
    time: z.number().min(0).describe('Seconds from clip start on the timeline'),
    x: z.number().optional(),
    y: z.number().optional(),
    scale: z.number().positive().optional(),
    rotation: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    volume: z.number().min(0).max(4).optional()
  }),
  delete_keyframe: z.object({
    clipId: z.string(),
    time: z.number().min(0).describe('Exact time of the keyframe to delete')
  }),
  split_clips: z.object({
    splits: z
      .array(z.object({ clipId: z.string(), at: z.number().min(0) }))
      .min(1)
      .describe('Batch of splits: each entry cuts clipId at the given timeline position in seconds')
  }),
  set_project_settings: z.object({
    name: z.string().optional().describe('Project name'),
    width: z.number().int().positive().optional().describe('Sequence width in pixels'),
    height: z.number().int().positive().optional().describe('Sequence height in pixels'),
    fps: z.number().positive().optional().describe('Sequence frame rate')
  }),
  detach_audio: z.object({
    clipId: z.string().describe('The video or audio clip to detach from its linked pair')
  }),
  get_transcript: z.object({
    mediaId: z.string().describe('ID of the media item to get the transcript for'),
    language: z
      .string()
      .optional()
      .describe('BCP-47 language code for the transcription (e.g. "en", "fr", "de"). Omit to auto-detect.')
  }),
  remove_words: z.object({
    mediaId: z.string().describe('The media item whose transcript contains the words to remove'),
    wordIndices: z
      .array(z.number().int().min(0))
      .min(1)
      .describe(
        'Zero-based word indices from get_transcript to cut from the timeline. ' +
          'Contiguous groups are merged into one ripple-delete range.'
      ),
    aggressiveness: z
      .enum(['tight', 'balanced', 'loose'])
      .default('balanced')
      .describe(
        'tight = exact word boundaries, balanced = 40ms padding, loose = 120ms padding to eat surrounding silence'
      )
  }),
  inspect_media: z.object({
    mediaId: z.string().describe('ID of a media item in the pool to probe')
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
  insert_clips: 'Ripple-insert one or more clips, pushing all existing clips that start at or after each insertion point to the right to make room.',
  split_clip: 'Split a clip into two at a timeline position (razor cut).',
  trim_clip: 'Change a clip\'s source in/out points. Pass ripple:true to shift subsequent clips and close the gap.',
  move_clip: 'Move a clip to a new start time and optionally a different track.',
  set_property: 'Set any combination of transform (position, scale, rotation, opacity), playback speed, or audio volume/fades on a clip.',
  delete_clip: 'Remove a clip from the timeline. Pass ripple:true to shift subsequent clips left and close the gap.',
  add_title: 'Add a text/title clip to a video track.',
  set_title: 'Edit a title clip\'s text and style (font size, color, background).',
  set_audio: 'Set a clip\'s volume and audio/video fade-in and fade-out durations.',
  set_transition:
    'Set or remove a cross-dissolve transition into a clip from the previous one (overlaps them).',
  delete_range:
    'Delete every clip (or portion of a clip) between inPoint and outPoint seconds. Pass ripple:true (default) to close the resulting gap.',
  set_keyframe:
    'Add or update an animation keyframe on a clip. Only the properties you supply are stored; missing ones fall back to the clip\'s static values. Use time=0 for the clip start.',
  delete_keyframe: 'Remove a keyframe at the given time from a clip.',
  split_clips: 'Split multiple clips in one operation. Each entry in splits names a clip and the timeline position (seconds) where it should be cut.',
  set_project_settings: 'Update the active sequence resolution/frame-rate or the project name.',
  detach_audio: 'Break the link between a video clip and its paired audio clip, making them fully independent.',
  get_transcript: 'Return the word-level transcript for a media item. Each word has a zero-based index, text, and start/end time relative to the source file. Transcribe the file first if needed.',
  remove_words: 'Cut a set of words (by index from get_transcript) out of the timeline using ripple-delete. Contiguous word runs are merged into one gap-close operation. Use this to remove filler words, silences, or bad takes without computing frame offsets manually.',
  inspect_media: 'Return metadata for a media pool item: resolution, fps, duration, has-audio, file path.',
  get_timeline_state: 'Return the current project state: media pool, sequences, tracks, and clips. IDs are shortened to 8 chars for readability.',
  export: 'Render the active sequence to a video file.'
}

export const commandNames = Object.keys(commandSchemas) as CommandName[]
