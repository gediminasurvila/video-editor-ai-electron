import { describe, it, expect, beforeEach } from 'vitest'
import { useEditor } from '@renderer/state/store'
import { ProjectSchema } from '@shared/schema'

beforeEach(() => {
  useEditor.getState().setProject(
    ProjectSchema.parse({ version: 1, id: 'p', name: 'P', activeSequenceId: null })
  )
})

describe('editor store undo/redo', () => {
  it('commits a mutation and supports undo/redo', () => {
    const { commit } = useEditor.getState()
    commit((p) => {
      p.name = 'Renamed'
    })
    expect(useEditor.getState().project.name).toBe('Renamed')
    expect(useEditor.getState().past).toHaveLength(1)

    useEditor.getState().undo()
    expect(useEditor.getState().project.name).toBe('P')
    expect(useEditor.getState().future).toHaveLength(1)

    useEditor.getState().redo()
    expect(useEditor.getState().project.name).toBe('Renamed')
  })

  it('clears the redo stack on a new commit', () => {
    const { commit } = useEditor.getState()
    commit((p) => (p.name = 'A'))
    useEditor.getState().undo()
    commit((p) => (p.name = 'B'))
    expect(useEditor.getState().future).toHaveLength(0)
    expect(useEditor.getState().project.name).toBe('B')
  })
})
