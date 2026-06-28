import { commandSchemas, type CommandName } from '@shared/commands'
import { clipDuration, isTitle, type Clip, type Project, type Sequence, type Track } from '@shared/schema'
import { useEditor, activeSequence } from '../state/store'
import { TitleRenderer } from '../engine/TitleRenderer'

/** Render every title clip in a sequence to a PNG data URL for export baking. */
function renderTitlePngs(seq: Sequence): Record<string, string> {
  const renderer = new TitleRenderer()
  const out: Record<string, string> = {}
  for (const track of seq.tracks) {
    for (const clip of track.clips) {
      if (isTitle(clip) && clip.title) {
        const canvas = renderer.get(clip.id, clip.title, seq.width, seq.height)
        out[clip.id] = canvas.toDataURL('image/png')
      }
    }
  }
  return out
}

/** Find a clip in a project draft's active sequence (for use inside `commit`). */
function findClipIn(project: Project, clipId: string): Clip | null {
  const seq = project.sequences.find((s) => s.id === project.activeSequenceId)
  for (const track of seq?.tracks ?? []) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return null
}

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
        kind: 'media',
        mediaId,
        start,
        inPoint,
        outPoint: outPoint ?? media.duration,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        volume: 1,
        fadeIn: 0,
        fadeOut: 0
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

  add_title: ({ text, start, duration, trackId }) => {
    const id = crypto.randomUUID()
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      if (!seq) throw new Error('No active sequence')
      const track = trackId
        ? seq.tracks.find((t) => t.id === trackId)
        : seq.tracks.find((t) => t.type === 'video')
      if (!track) throw new Error('No video track for the title')
      const at =
        start ??
        track.clips.reduce((max, c) => Math.max(max, c.start + clipDuration(c)), 0)
      track.clips.push({
        id,
        kind: 'title',
        mediaId: '',
        title: { text, fontSize: 96, color: '#ffffff', background: 'transparent', align: 'center' },
        start: at,
        inPoint: 0,
        outPoint: duration,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        volume: 1,
        fadeIn: 0,
        fadeOut: 0
      })
    })
    return { clipId: id }
  },

  set_title: ({ clipId, text, fontSize, color, background }) => {
    useEditor.getState().commit((p) => {
      const clip = findClipIn(p, clipId)
      if (!clip) throw new Error(`Clip ${clipId} not found`)
      if (clip.kind !== 'title' || !clip.title) throw new Error('Clip is not a title')
      if (text !== undefined) clip.title.text = text
      if (fontSize !== undefined) clip.title.fontSize = fontSize
      if (color !== undefined) clip.title.color = color
      if (background !== undefined) clip.title.background = background
    })
    return { ok: true }
  },

  set_audio: ({ clipId, volume, fadeIn, fadeOut }) => {
    useEditor.getState().commit((p) => {
      const clip = findClipIn(p, clipId)
      if (!clip) throw new Error(`Clip ${clipId} not found`)
      if (volume !== undefined) clip.volume = volume
      if (fadeIn !== undefined) clip.fadeIn = fadeIn
      if (fadeOut !== undefined) clip.fadeOut = fadeOut
    })
    return { ok: true }
  },

  set_transition: ({ clipId, type, duration }) => {
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      for (const track of seq?.tracks ?? []) {
        const clip = track.clips.find((c) => c.id === clipId)
        if (!clip) continue
        if (type === 'none' || duration <= 0) {
          delete clip.transition
          return
        }
        // Overlap the previous clip by `duration` so they actually cross-dissolve.
        const prev = track.clips
          .filter((c) => c.id !== clipId && c.start < clip.start)
          .sort((a, b) => b.start - a.start)[0]
        if (prev) {
          const prevEnd = prev.start + clipDuration(prev)
          clip.start = Math.max(0, prevEnd - duration)
        }
        clip.transition = { type: 'dissolve', duration }
        return
      }
      throw new Error(`Clip ${clipId} not found`)
    })
    return { ok: true }
  },

  delete_range: ({ inPoint, outPoint, ripple }) => {
    if (outPoint <= inPoint) throw new Error('outPoint must be greater than inPoint')
    const rangeLen = outPoint - inPoint
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      if (!seq) throw new Error('No active sequence')
      for (const track of seq.tracks) {
        const surviving: typeof track.clips = []
        for (const clip of track.clips) {
          const clipEnd = clip.start + clipDuration(clip)
          if (clipEnd <= inPoint) { surviving.push(clip); continue }
          if (clip.start >= outPoint) { surviving.push(clip); continue }
          if (clip.start < inPoint) {
            surviving.push({ ...clip, outPoint: clip.inPoint + (inPoint - clip.start) })
          }
          if (clipEnd > outPoint) {
            const afterOffset = outPoint - clip.start
            surviving.push({
              ...clip,
              id: surviving.some((c) => c.id === clip.id) ? crypto.randomUUID() : clip.id,
              start: outPoint,
              inPoint: clip.inPoint + afterOffset
            })
          }
        }
        track.clips = surviving
      }
      if (ripple) {
        for (const track of seq.tracks) {
          for (const clip of track.clips) {
            if (clip.start >= outPoint) clip.start -= rangeLen
          }
        }
      }
    })
    return { ok: true }
  },

  get_timeline_state: () => useEditor.getState().project,

  export: async ({ outPath }) => {
    const { project } = useEditor.getState()
    if (!project.activeSequenceId) throw new Error('No active sequence to export')
    const seq = project.sequences.find((s) => s.id === project.activeSequenceId)
    const titlePngs = seq ? renderTitlePngs(seq) : {}
    await window.api.exportSequence(project, project.activeSequenceId, outPath, titlePngs)
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
