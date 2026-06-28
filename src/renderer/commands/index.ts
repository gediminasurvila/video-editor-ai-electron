import { commandSchemas, type CommandName } from '@shared/commands'
import { clipDuration, isTitle, type Clip, type Project, type Sequence, type Track } from '@shared/schema'
import { useEditor, activeSequence } from '../state/store'
import { useTranscripts } from '../state/transcripts'
import { useSettings } from '../state/settings'
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

/** Find a clip by id in the active sequence draft. */
function findClipIn(project: Project, clipId: string): Clip | null {
  const seq = project.sequences.find((s) => s.id === project.activeSequenceId)
  for (const track of seq?.tracks ?? []) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return null
}

/** Find a clip's linked partner in the active sequence. */
function findLinkedClip(seq: Sequence, linkedId: string): Clip | null {
  for (const track of seq.tracks) {
    const clip = track.clips.find((c) => c.id === linkedId)
    if (clip) return clip
  }
  return null
}

type Handlers = {
  [K in CommandName]: (args: import('@shared/commands').CommandArgs<K>) => unknown
}

export function findClip(): (clipId: string) => { track: Track; clip: Clip } | null {
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
        name: name ?? `${type === 'video' ? 'Video' : 'Audio'} ${seq.tracks.filter((t) => t.type === type).length + 1}`,
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
        fadeOut: 0,
        keyframes: []
      })
    })
    return { clipId: id }
  },

  insert_clips: ({ clips }) => {
    const newIds: string[] = []
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      if (!seq) throw new Error('No active sequence')
      for (const entry of clips) {
        const media = p.mediaPool.find((m) => m.id === entry.mediaId)
        if (!media) throw new Error(`Media ${entry.mediaId} not found`)
        const track = seq.tracks.find((t) => t.id === entry.trackId)
        if (!track) throw new Error(`Track ${entry.trackId} not found`)
        const clipOut = entry.outPoint ?? media.duration
        const dur = clipOut - entry.inPoint
        // Ripple: push existing clips that start at or after the insertion point
        for (const t of seq.tracks) {
          for (const c of t.clips) {
            if (c.start >= entry.at) c.start += dur
          }
        }
        const id = crypto.randomUUID()
        track.clips.push({
          id,
          kind: 'media',
          mediaId: entry.mediaId,
          start: entry.at,
          inPoint: entry.inPoint,
          outPoint: clipOut,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          effects: [],
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          keyframes: []
        })
        newIds.push(id)
      }
    })
    return { clipIds: newIds }
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
        const leftKfs = clip.keyframes.filter((k) => k.time < localOffset)
        const rightKfs = clip.keyframes
          .filter((k) => k.time >= localOffset)
          .map((k) => ({ ...k, time: k.time - localOffset }))

        // Splitting breaks the link so each half is independent
        if (clip.linkedClipId) {
          const linked = findLinkedClip(seq!, clip.linkedClipId)
          if (linked) delete linked.linkedClipId
          delete clip.linkedClipId
        }

        track.clips.push({
          ...structuredClone(clip),
          id: newId,
          start: at,
          inPoint: cutSource,
          keyframes: rightKfs
        })
        clip.outPoint = cutSource
        clip.keyframes = leftKfs
        return
      }
      throw new Error(`Clip ${clipId} not found`)
    })
    return { newClipId: newId }
  },

  trim_clip: ({ clipId, inPoint, outPoint, ripple }) => {
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      for (const track of seq?.tracks ?? []) {
        const clip = track.clips.find((c) => c.id === clipId)
        if (!clip) continue
        const oldDuration = clipDuration(clip)

        // Adjust start when trimming the in-point (left edge)
        if (inPoint !== undefined) {
          const delta = inPoint - clip.inPoint
          clip.start = Math.max(0, clip.start + delta)
          clip.inPoint = inPoint
        }
        if (outPoint !== undefined) clip.outPoint = outPoint

        // Propagate trim to the linked clip
        if (clip.linkedClipId) {
          const linked = findLinkedClip(seq!, clip.linkedClipId)
          if (linked) {
            if (inPoint !== undefined) {
              const delta = inPoint - linked.inPoint
              linked.start = Math.max(0, linked.start + delta)
              linked.inPoint = inPoint
            }
            if (outPoint !== undefined) linked.outPoint = outPoint
          }
        }

        if (ripple) {
          const delta = clipDuration(clip) - oldDuration
          const boundary = clip.start + clipDuration(clip)
          for (const t of seq!.tracks) {
            for (const c of t.clips) {
              if (c.id !== clipId && c.id !== clip.linkedClipId && c.start >= boundary - delta) {
                c.start = Math.max(0, c.start + delta)
              }
            }
          }
        }
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
      let originalStart = 0
      for (const track of seq.tracks) {
        const idx = track.clips.findIndex((c) => c.id === clipId)
        if (idx >= 0) {
          found = track.clips[idx]
          originalStart = found.start
          if (trackId && trackId !== track.id) track.clips.splice(idx, 1)
          break
        }
      }
      if (!found) throw new Error(`Clip ${clipId} not found`)
      const delta = start - originalStart
      found.start = start
      if (trackId) {
        const dest = seq.tracks.find((t) => t.id === trackId)
        if (!dest) throw new Error(`Track ${trackId} not found`)
        if (!dest.clips.includes(found)) dest.clips.push(found)
      }
      // Propagate move to the linked clip
      if (found.linkedClipId) {
        const linked = findLinkedClip(seq, found.linkedClipId)
        if (linked) linked.start = Math.max(0, linked.start + delta)
      }
    })
    return { ok: true }
  },

  set_property: ({ clipId, transform, speed, volume, fadeIn, fadeOut }) => {
    // Validate inputs before touching state
    if (speed !== undefined && speed <= 0) throw new Error(`speed must be > 0 (got ${speed})`)
    if (volume !== undefined && (volume < 0 || volume > 4)) throw new Error(`volume must be between 0 and 4 (got ${volume})`)
    if (transform?.opacity !== undefined && (transform.opacity < 0 || transform.opacity > 1))
      throw new Error(`opacity must be between 0 and 1 (got ${transform.opacity})`)
    if (transform?.scale !== undefined && transform.scale <= 0)
      throw new Error(`scale must be > 0 (got ${transform.scale})`)

    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      for (const track of seq?.tracks ?? []) {
        const clip = track.clips.find((c) => c.id === clipId)
        if (clip) {
          // Merge transform preserving existing fields that weren't specified
          if (transform) Object.assign(clip.transform, transform)
          // Apply speed: rescale all clip-relative keyframe times proportionally,
          // then adjust the clip's outPoint to reflect the new duration.
          if (speed !== undefined && clip.kind === 'media') {
            const oldDur = clipDuration(clip)
            const newDur = oldDur / speed
            const ratio = newDur / (oldDur || newDur)
            clip.keyframes = clip.keyframes.map((kf) => ({ ...kf, time: kf.time * ratio }))
            clip.outPoint = clip.inPoint + (clip.outPoint - clip.inPoint) / speed
          }
          if (volume !== undefined) clip.volume = volume
          if (fadeIn !== undefined) clip.fadeIn = fadeIn
          if (fadeOut !== undefined) clip.fadeOut = fadeOut
          return
        }
      }
      throw new Error(`Clip ${clipId} not found`)
    })
    return { ok: true }
  },

  delete_clip: ({ clipId, ripple }) => {
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      for (const track of seq?.tracks ?? []) {
        const idx = track.clips.findIndex((c) => c.id === clipId)
        if (idx >= 0) {
          const clip = track.clips[idx]
          const gapStart = clip.start
          const gapSize = clipDuration(clip)
          const linkedId = clip.linkedClipId
          track.clips.splice(idx, 1)

          // Delete the linked clip too
          if (linkedId) {
            for (const t of seq!.tracks) {
              const li = t.clips.findIndex((c) => c.id === linkedId)
              if (li >= 0) {
                t.clips.splice(li, 1)
                break
              }
            }
          }

          if (ripple && gapSize > 0) {
            for (const t of seq!.tracks) {
              for (const c of t.clips) {
                if (c.start >= gapStart + gapSize) {
                  c.start -= gapSize
                } else if (c.start > gapStart) {
                  c.start = gapStart
                }
              }
            }
          }
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
        fadeOut: 0,
        keyframes: []
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

  set_keyframe: ({ clipId, time, ...props }) => {
    useEditor.getState().commit((p) => {
      const clip = findClipIn(p, clipId)
      if (!clip) throw new Error(`Clip ${clipId} not found`)
      const existing = clip.keyframes.find((k) => k.time === time)
      if (existing) {
        Object.assign(existing, props)
      } else {
        clip.keyframes.push({ time, ...props })
        clip.keyframes.sort((a, b) => a.time - b.time)
      }
    })
    return { ok: true }
  },

  delete_keyframe: ({ clipId, time }) => {
    useEditor.getState().commit((p) => {
      const clip = findClipIn(p, clipId)
      if (!clip) throw new Error(`Clip ${clipId} not found`)
      const idx = clip.keyframes.findIndex((k) => k.time === time)
      if (idx < 0) throw new Error(`No keyframe at time ${time} on clip ${clipId}`)
      clip.keyframes.splice(idx, 1)
    })
    return { ok: true }
  },

  split_clips: ({ splits }) => {
    const newIds: string[] = []
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      if (!seq) throw new Error('No active sequence')
      // Sort splits by time ascending so earlier cuts don't shift later clip IDs
      const sorted = [...splits].sort((a, b) => a.at - b.at)
      for (const { clipId, at } of sorted) {
        const newId = crypto.randomUUID()
        for (const track of seq.tracks) {
          const clip = track.clips.find((c) => c.id === clipId)
          if (!clip) continue
          const localOffset = at - clip.start
          if (localOffset <= 0 || localOffset >= clipDuration(clip)) continue
          const cutSource = clip.inPoint + localOffset
          const leftKfs = clip.keyframes.filter((k) => k.time < localOffset)
          const rightKfs = clip.keyframes
            .filter((k) => k.time >= localOffset)
            .map((k) => ({ ...k, time: k.time - localOffset }))
          if (clip.linkedClipId) {
            const linked = findLinkedClip(seq, clip.linkedClipId)
            if (linked) delete linked.linkedClipId
            delete clip.linkedClipId
          }
          track.clips.push({ ...structuredClone(clip), id: newId, start: at, inPoint: cutSource, keyframes: rightKfs })
          clip.outPoint = cutSource
          clip.keyframes = leftKfs
          newIds.push(newId)
          break
        }
      }
    })
    return { newClipIds: newIds }
  },

  set_project_settings: ({ name, width, height, fps }) => {
    useEditor.getState().commit((p) => {
      if (name !== undefined) p.name = name
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      if (!seq) throw new Error('No active sequence')
      if (width !== undefined) seq.width = width
      if (height !== undefined) seq.height = height
      if (fps !== undefined) seq.fps = fps
    })
    return { ok: true }
  },

  detach_audio: ({ clipId }) => {
    useEditor.getState().commit((p) => {
      const seq = p.sequences.find((s) => s.id === p.activeSequenceId)
      const clip = findClipIn(p, clipId)
      if (!clip) throw new Error(`Clip ${clipId} not found`)
      if (clip.linkedClipId) {
        const linked = findLinkedClip(seq!, clip.linkedClipId)
        if (linked) delete linked.linkedClipId
        delete clip.linkedClipId
      }
    })
    return { ok: true }
  },

  undo: () => { useEditor.getState().undo(); return { ok: true } },
  redo: () => { useEditor.getState().redo(); return { ok: true } },

  add_captions: async ({ mediaId, trackId, maxWords, fontSize, color }) => {
    const { project } = useEditor.getState()
    const media = project.mediaPool.find((m) => m.id === mediaId)
    if (!media) throw new Error(`Media ${mediaId} not found`)

    // Get or fetch transcript
    const { transcripts, setTranscript } = useTranscripts.getState()
    let words = transcripts[mediaId]
    if (!words) {
      const { apiKey } = useSettings.getState()
      if (!apiKey) throw new Error('No API key. Run get_transcript first or set an OpenAI key.')
      const result = await window.api.transcribeMedia(media.filePath, apiKey)
      setTranscript(mediaId, result)
      words = result
    }
    if (words.length === 0) throw new Error('Transcript is empty — nothing to caption.')

    // Find the clip on the timeline that uses this media
    const seq = project.sequences.find((s) => s.id === project.activeSequenceId)
    if (!seq) throw new Error('No active sequence')
    let sourceClip: import('@shared/schema').Clip | undefined
    for (const track of seq.tracks) {
      const c = track.clips.find((cl) => cl.mediaId === mediaId && cl.kind === 'media')
      if (c) { sourceClip = c; break }
    }
    if (!sourceClip) throw new Error('Media is not on the timeline. Add it first.')
    const clip = sourceClip

    // Group words into phrases of ≤ maxWords
    const phrases: { text: string; start: number; end: number }[] = []
    let group: typeof words = []
    for (const w of words) {
      group.push(w)
      if (group.length >= maxWords) {
        phrases.push({ text: group.map((x) => x.word).join(' '), start: group[0].start, end: group[group.length - 1].end })
        group = []
      }
    }
    if (group.length) phrases.push({ text: group.map((x) => x.word).join(' '), start: group[0].start, end: group[group.length - 1].end })

    // Find or create a caption video track
    let captionTrackId = trackId
    if (!captionTrackId) {
      const captionTrack = seq.tracks.find((t) => t.type === 'video' && t.name === 'Captions')
      captionTrackId = captionTrack?.id
    }
    if (!captionTrackId) {
      const res = await runCommand('add_track', { type: 'video', name: 'Captions' })
      captionTrackId = (res as { trackId: string }).trackId
    }

    // Place caption title clips
    let count = 0
    useEditor.getState().commit((p) => {
      const s = p.sequences.find((sq) => sq.id === p.activeSequenceId)
      if (!s) return
      const t = s.tracks.find((tr) => tr.id === captionTrackId)
      if (!t) return
      for (const phrase of phrases) {
        const tlStart = clip.start + (phrase.start - clip.inPoint)
        const tlEnd = clip.start + (phrase.end - clip.inPoint)
        if (tlStart < 0 || tlEnd <= tlStart) continue
        t.clips.push({
          id: crypto.randomUUID(),
          kind: 'title',
          start: tlStart,
          inPoint: 0,
          outPoint: tlEnd - tlStart,
          mediaId: '',
          title: { text: phrase.text, fontSize, color, background: 'transparent', align: 'center' },
          transform: { x: 0, y: 60, scale: 1, rotation: 0, opacity: 1 },
          effects: [],
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          keyframes: []
        })
        count++
      }
    })
    return { captionsAdded: count, trackId: captionTrackId }
  },

  get_transcript: async ({ mediaId, language: _language }) => {
    const { project } = useEditor.getState()
    const media = project.mediaPool.find((m) => m.id === mediaId)
    if (!media) throw new Error(`Media ${mediaId} not found`)
    const { transcripts, setTranscript } = useTranscripts.getState()
    let words = transcripts[mediaId]
    if (!words) {
      const { apiKey } = useSettings.getState()
      if (!apiKey) throw new Error('No API key configured. Set an OpenAI API key in Settings.')
      const result = await window.api.transcribeMedia(media.filePath, apiKey)
      setTranscript(mediaId, result)
      words = result
    }
    return {
      mediaId,
      wordCount: words.length,
      words: words.map((w, i) => ({ index: i, word: w.word, start: w.start, end: w.end }))
    }
  },

  remove_words: ({ mediaId, wordIndices, aggressiveness }) => {
    const { project } = useEditor.getState()
    const { transcripts } = useTranscripts.getState()
    const words = transcripts[mediaId]
    if (!words || words.length === 0) throw new Error('No transcript for this media. Run get_transcript first.')

    const PAD = aggressiveness === 'tight' ? 0 : aggressiveness === 'balanced' ? 0.04 : 0.12

    // Find the clip on the timeline that uses this mediaId
    const seq = project.sequences.find((s) => s.id === project.activeSequenceId)
    if (!seq) throw new Error('No active sequence')
    let foundClip: import('@shared/schema').Clip | undefined
    for (const track of seq.tracks) {
      const c = track.clips.find((cl) => cl.mediaId === mediaId && cl.kind === 'media')
      if (c) { foundClip = c; break }
    }
    if (!foundClip) throw new Error('Media is not on the timeline')
    const clip = foundClip

    // Sort indices and group into contiguous runs
    const sorted = [...new Set(wordIndices)].sort((a, b) => a - b)
    const runs: [number, number][] = []
    for (const idx of sorted) {
      if (idx < 0 || idx >= words.length) throw new Error(`Word index ${idx} out of range (0..${words.length - 1})`)
      if (runs.length && idx === runs[runs.length - 1][1] + 1) {
        runs[runs.length - 1][1] = idx
      } else {
        runs.push([idx, idx])
      }
    }

    // Convert source-relative word times to timeline positions, apply padding
    const ranges = runs.map(([lo, hi]) => {
      const srcStart = Math.max(0, words[lo].start - PAD)
      const srcEnd = words[hi].end + PAD
      const tl = (src: number): number => clip.start + (src - clip.inPoint)
      return { inPoint: Math.max(0, tl(srcStart)), outPoint: tl(srcEnd) }
    })

    // Delete ranges from latest to earliest so earlier cuts don't shift later positions
    const revRanges = [...ranges].reverse()
    useEditor.getState().commit((p) => {
      const s = p.sequences.find((sq) => sq.id === p.activeSequenceId)
      if (!s) return
      for (const { inPoint, outPoint } of revRanges) {
        const gapSize = outPoint - inPoint
        for (const track of s.tracks) {
          for (let i = track.clips.length - 1; i >= 0; i--) {
            const c = track.clips[i]
            const cEnd = c.start + clipDuration(c)
            if (c.start >= inPoint && cEnd <= outPoint) {
              track.clips.splice(i, 1)
            } else if (c.start < outPoint && cEnd > outPoint) {
              c.inPoint += outPoint - c.start
              c.start = inPoint
            } else if (c.start < inPoint && cEnd > inPoint) {
              c.outPoint = c.inPoint + (inPoint - c.start)
            }
          }
          for (const c of track.clips) {
            if (c.start >= outPoint) c.start -= gapSize
          }
        }
      }
    })
    return { deletedRanges: ranges.length, ranges }
  },

  inspect_media: ({ mediaId }) => {
    const { project } = useEditor.getState()
    const media = project.mediaPool.find((m) => m.id === mediaId)
    if (!media) throw new Error(`Media ${mediaId} not found`)
    return {
      id: mediaId,
      name: media.name,
      filePath: media.filePath,
      width: media.width,
      height: media.height,
      fps: media.fps,
      duration: media.duration,
      hasAudio: media.hasAudio
    }
  },

  get_timeline_state: () => {
    const project = useEditor.getState().project
    // Return a compact version with 8-char IDs so agent context stays small
    const short = (id: string): string => id.slice(0, 8)
    return {
      name: project.name,
      activeSequenceId: short(project.activeSequenceId ?? ''),
      mediaPool: project.mediaPool.map((m) => ({
        id: short(m.id),
        name: m.name,
        duration: Math.round(m.duration * 100) / 100,
        width: m.width,
        height: m.height,
        hasAudio: m.hasAudio
      })),
      sequences: project.sequences.map((seq) => ({
        id: short(seq.id),
        name: seq.name,
        width: seq.width,
        height: seq.height,
        fps: seq.fps,
        tracks: seq.tracks.map((track) => ({
          id: short(track.id),
          name: track.name,
          type: track.type,
          muted: track.muted,
          clips: track.clips.map((clip) => ({
            id: short(clip.id),
            mediaId: clip.mediaId ? short(clip.mediaId) : undefined,
            start: Math.round(clip.start * 100) / 100,
            duration: Math.round(clipDuration(clip) * 100) / 100,
            ...(clip.kind === 'title' && clip.title ? { text: clip.title.text } : {})
          }))
        }))
      }))
    }
  },

  export: async ({ outPath }) => {
    const { project } = useEditor.getState()
    if (!project.activeSequenceId) throw new Error('No active sequence to export')
    const seq = project.sequences.find((s) => s.id === project.activeSequenceId)
    const titlePngs = seq ? renderTitlePngs(seq) : {}
    await window.api.exportSequence(project, project.activeSequenceId, outPath, titlePngs)
    return { outPath }
  }
}

export async function runCommand(name: CommandName, rawArgs: unknown): Promise<unknown> {
  const schema = commandSchemas[name]
  const args = schema.parse(rawArgs ?? {})
  return await (handlers[name] as (a: unknown) => unknown)(args)
}
