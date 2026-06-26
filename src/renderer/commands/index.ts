import { commandSchemas, type CommandName } from '@shared/commands'
import { clipDuration, type Clip, type Track } from '@shared/schema'
import { useEditor, activeSequence } from '../state/store'

/**
 * Implementations of every editor command. The UI, the in-app agent, and the
 * MCP bridge all dispatch through `runCommand`, so a single code path keeps
 * human and AI edits identical and undoable. Each handler receives args already
 * validated against the command's zod schema.
 */

type Handlers = {
  [K in CommandName]: (args: import('@shared/commands').CommandArgs<K>) => unknown
}

function findClip(): (clipId: string) => { track: Track; clip: Clip } | null {
  return (clipId) => {
    const seq = activeSequence(useEditor.getState().project)
    if (!seq) return null
    for (const track of seq.tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) return { track, clip }
    }
    return null
  }
}

const handlers: Handlers = {
  import_media: async ({ filePath }) => {
    const probe = await window.api.probeMedia(filePath)
    const id = crypto.randomUUID()
    const name = filePath.split(/[\\/]/).pop() ?? 'media'
    useEditor.getState().commit((p) => {
      p.mediaPool.push({ id, name, ...probe.media })
    })
    return { mediaId: id, name }
  },

  create_sequence: (args) => {
    const id = crypto.randomUUID()
    useEditor.getState().commit((p) => {
      p.sequences.push({ id, ...args, tracks: [] })
      p.activeSequenceId = id
    })
    return { sequenceId: id }
  },

  add_track: ({ type, name }) => {
    const id = crypto.randomUUID()
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      if (!seq) throw new Error('No active sequence')
      seq.tracks.push({
        id,
        type,
        name: name ?? `${type === 'video' ? 'Video' : 'Audio'} ${seq.tracks.length + 1}`,
        muted: false,
        clips: []
      })
    })
    return { trackId: id }
  },

  add_clip: ({ trackId, mediaId, start, inPoint, outPoint }) => {
    const id = crypto.randomUUID()
    useEditor.getState().commit((p) => {
      const media = p.mediaPool.find((m) => m.id === mediaId)
      if (!media) throw new Error(`Media ${mediaId} not found`)
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      const track = seq?.tracks.find((t) => t.id === trackId)
      if (!track) throw new Error(`Track ${trackId} not found`)
      track.clips.push({
        id,
        mediaId,
        start,
        inPoint,
        outPoint: outPoint ?? media.duration,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: []
      })
    })
    return { clipId: id }
  },

  split_clip: ({ clipId, at }) => {
    const newId = crypto.randomUUID()
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      for (const track of seq?.tracks ?? []) {
        const clip = track.clips.find((c) => c.id === clipId)
        if (!clip) continue
        const localOffset = at - clip.start
        if (localOffset <= 0 || localOffset >= clipDuration(clip)) {
          throw new Error('Split point is outside the clip')
        }
        const cutSource = clip.inPoint + localOffset
        track.clips.push({
          ...structuredClone(clip),
          id: newId,
          start: at,
          inPoint: cutSource
        })
        clip.outPoint = cutSource
        return
      }
      throw new Error(`Clip ${clipId} not found`)
    })
    return { newClipId: newId }
  },

  trim_clip: ({ clipId, inPoint, outPoint }) => {
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      for (const track of seq?.tracks ?? []) {
        const clip = track.clips.find((c) => c.id === clipId)
        if (!clip) continue
        if (inPoint !== undefined) clip.inPoint = inPoint
        if (outPoint !== undefined) clip.outPoint = outPoint
        return
      }
      throw new Error(`Clip ${clipId} not found`)
    })
    return { ok: true }
  },

  move_clip: ({ clipId, start, trackId }) => {
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      if (!seq) throw new Error('No active sequence')
      let found: Clip | null = null
      for (const track of seq.tracks) {
        const idx = track.clips.findIndex((c) => c.id === clipId)
        if (idx >= 0) {
          found = track.clips[idx]
          if (trackId && trackId !== track.id) track.clips.splice(idx, 1)
          break
        }
      }
      if (!found) throw new Error(`Clip ${clipId} not found`)
      found.start = start
      if (trackId) {
        const dest = seq.tracks.find((t) => t.id === trackId)
        if (!dest) throw new Error(`Track ${trackId} not found`)
        if (!dest.clips.includes(found)) dest.clips.push(found)
      }
    })
    return { ok: true }
  },

  set_property: ({ clipId, transform }) => {
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      for (const track of seq?.tracks ?? []) {
        const clip = track.clips.find((c) => c.id === clipId)
        if (clip) {
          if (transform) Object.assign(clip.transform, transform)
          return
        }
      }
      throw new Error(`Clip ${clipId} not found`)
    })
    return { ok: true }
  },

  delete_clip: ({ clipId }) => {
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      for (const track of seq?.tracks ?? []) {
        const idx = track.clips.findIndex((c) => c.id === clipId)
        if (idx >= 0) {
          track.clips.splice(idx, 1)
          return
        }
      }
      throw new Error(`Clip ${clipId} not found`)
    })
    return { ok: true }
  },

  get_timeline_state: () => useEditor.getState().project,

  export: async ({ outPath }) => {
    const { project } = useEditor.getState()
    if (!project.activeSequenceId) throw new Error('No active sequence to export')
    await window.api.exportSequence(project, project.activeSequenceId, outPath)
    return { outPath }
  }
}

/** Validate + dispatch a command by name. Throws on invalid args or handler error. */
export async function runCommand(name: CommandName, rawArgs: unknown): Promise<unknown> {
  const schema = commandSchemas[name]
  const args = schema.parse(rawArgs ?? {})
  return await (handlers[name] as (a: unknown) => unknown)(args)
}

export { findClip }
