import { create } from 'zustand'
import { type Project } from '@shared/schema'

function emptyProject(): Project {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: 'Untitled',
    mediaPool: [],
    sequences: [],
    activeSequenceId: null
  }
}

export type ToolMode = 'select' | 'trim' | 'cut'

interface EditorState {
  project: Project
  selectedClipId: string | null
  playhead: number
  /** Whether the preview is playing (lifted here so shortcuts can toggle it). */
  playing: boolean
  /** Path of the open .aivp file, if saved. */
  filePath: string | null
  past: Project[]
  future: Project[]
  /** Active editing tool (V = select, T = trim, C = cut/razor). */
  toolMode: ToolMode

  setProject: (project: Project, filePath?: string | null) => void
  /** Apply a mutation as an undoable transaction. */
  commit: (mutator: (draft: Project) => void) => void
  select: (clipId: string | null) => void
  setPlayhead: (t: number) => void
  setPlaying: (playing: boolean) => void
  togglePlay: () => void
  undo: () => void
  redo: () => void
  setToolMode: (mode: ToolMode) => void
}

const HISTORY_LIMIT = 100

export const useEditor = create<EditorState>((set) => ({
  project: emptyProject(),
  selectedClipId: null,
  playhead: 0,
  playing: false,
  filePath: null,
  past: [],
  future: [],
  toolMode: 'select',

  setProject: (project, filePath = null) =>
    set({
      project,
      filePath,
      past: [],
      future: [],
      selectedClipId: null,
      playhead: 0,
      playing: false
    }),

  commit: (mutator) =>
    set((state) => {
      const next = structuredClone(state.project)
      mutator(next)
      const past = [...state.past, state.project].slice(-HISTORY_LIMIT)
      return { project: next, past, future: [] }
    }),

  select: (clipId) => set({ selectedClipId: clipId }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT)
      }
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        project: next,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1)
      }
    }),

  setToolMode: (mode) => set({ toolMode: mode })
}))

export function activeSequence(project: Project) {
  return project.sequences.find((s) => s.id === project.activeSequenceId) ?? null
}
