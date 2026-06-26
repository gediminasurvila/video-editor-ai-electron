import { useEffect, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor } from '../../state/store'
import { runCommand } from '../../commands'
import type { McpStatus } from '@shared/ipc'

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
  const { project, filePath, undo, redo, past, future, setProject } = useEditor()
  const [mcp, setMcp] = useState<McpStatus | null>(null)

  useEffect(() => {
    window.api.mcpStatus().then(setMcp)
    return window.api.onMcpStatusChanged(setMcp)
  }, [])

  async function open(): Promise<void> {
    const path = await window.api.openProjectDialog()
    if (!path) return
    const loaded = await window.api.loadProject(path)
    setProject(loaded, path)
  }

  async function save(): Promise<void> {
    const path = filePath ?? (await window.api.saveProjectDialog())
    if (!path) return
    await window.api.saveProject(path, project)
    if (!filePath) setProject(project, path)
  }

  async function newSequence(): Promise<void> {
    await runCommand('create_sequence', { name: 'Sequence 1' })
    await runCommand('add_track', { type: 'video' })
    await runCommand('add_track', { type: 'audio' })
  }

  async function exportVideo(): Promise<void> {
    const path = await window.api.saveProjectDialog()
    if (!path) return
    try {
      await runCommand('export', { outPath: path.replace(/\.aivp$/, '') + '.mp4' })
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  return (
    <div
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        gap: theme.space.sm,
        padding: `0 ${theme.space.md}px`,
        background: theme.color.panel,
        borderBottom: `1px solid ${theme.color.border}`
      }}
    >
      <strong style={{ marginRight: theme.space.md }}>Video AI</strong>
      <button onClick={open}>Open</button>
      <button onClick={save}>Save</button>
      <button onClick={newSequence}>+ Sequence</button>
      <button onClick={undo} disabled={past.length === 0}>
        Undo
      </button>
      <button onClick={redo} disabled={future.length === 0}>
        Redo
      </button>
      <button onClick={exportVideo}>Export</button>
      <div style={{ flex: 1 }} />
      <button
        onClick={onOpenSettings}
        title="Settings & MCP config"
        style={{ fontSize: theme.font.size.sm, color: theme.color.textDim }}
      >
        MCP{' '}
        <span style={{ color: mcp?.running ? '#5ad07a' : theme.color.danger }}>
          ● {mcp?.running ? 'online' : 'offline'}
        </span>
      </button>
      <button onClick={onOpenSettings} title="Settings">
        ⚙
      </button>
    </div>
  )
}
