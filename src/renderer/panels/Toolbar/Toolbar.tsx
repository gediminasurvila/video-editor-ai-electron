import { useEffect, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { runCommand } from '../../commands'
import { importViaDialog } from '../../actions/quickActions'
import { sequenceDuration } from '@shared/schema'
import type { McpStatus } from '@shared/ipc'

const RATIO_PILLS = [
  { label: '16:9', w: 1920, h: 1080 },
  { label: '9:16', w: 1080, h: 1920 },
  { label: '1:1',  w: 1080, h: 1080 },
  { label: '4:3',  w: 1440, h: 1080 }
] as const

export function Toolbar({ onOpenSettings, onNewSequence }: { onOpenSettings: () => void; onNewSequence: () => void }): JSX.Element {
  const { project, filePath, undo, redo, past, future, setProject } = useEditor()
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const seq = activeSequence(project)
  const hasContent = !!seq && sequenceDuration(seq) > 0

  useEffect(() => {
    window.api.mcpStatus().then(setMcp)
    return window.api.onMcpStatusChanged(setMcp)
  }, [])

  async function open(): Promise<void> {
    const path = await window.api.openProjectDialog()
    if (!path) return
    setProject(await window.api.loadProject(path), path)
  }

  async function save(): Promise<void> {
    const path = filePath ?? (await window.api.saveProjectDialog())
    if (!path) return
    await window.api.saveProject(path, project)
    if (!filePath) setProject(project, path)
  }

  async function exportVideo(): Promise<void> {
    const path = await window.api.exportDialog(`${project.name || 'My Movie'}.mp4`)
    if (!path) return
    const off = window.api.onExportProgress((line) => {
      const m = line.match(/time=(\d+:\d+:\d+\.\d+)/)
      if (m) setExporting(`Exporting… ${m[1]}`)
    })
    setExporting('Exporting…')
    try {
      await runCommand('export', { outPath: path })
      setExporting(null)
    } catch (err) {
      setExporting(null)
      alert(`Export failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      off()
    }
  }

  return (
    <div
      style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        gap: theme.space.sm,
        padding: `0 ${theme.space.md}px`,
        background: theme.color.panel,
        borderBottom: `1px solid ${theme.color.border}`
      }}
    >
      <strong style={{ marginRight: theme.space.sm }}>🎬 Video AI</strong>

      <button onClick={importViaDialog} style={primaryBtn} title="Import media (⌘/Ctrl+I)">
        + Import
      </button>

      <button onClick={onNewSequence} title="Create a new sequence">
        + Sequence
      </button>

      {seq && (
        <>
          <Sep />
          <span style={{ fontSize: 10, color: theme.color.textDim, userSelect: 'none' }}>Ratio</span>
          {RATIO_PILLS.map((p) => {
            const active = seq.width === p.w && seq.height === p.h
            return (
              <button
                key={p.label}
                onClick={() => void runCommand('set_project_settings', { width: p.w, height: p.h })}
                title={`${p.w}×${p.h}`}
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  background: active ? theme.color.accentDim : 'transparent',
                  borderColor: active ? theme.color.accent : theme.color.border,
                  color: active ? '#fff' : theme.color.textDim
                }}
              >
                {p.label}
              </button>
            )
          })}
        </>
      )}

      <Sep />
      <button onClick={open} title="Open project">
        Open
      </button>
      <button onClick={save} title="Save project (⌘/Ctrl+S)">
        Save
      </button>

      <Sep />
      <button onClick={undo} disabled={past.length === 0} title="Undo (⌘/Ctrl+Z)">
        ↶
      </button>
      <button onClick={redo} disabled={future.length === 0} title="Redo (⌘/Ctrl+Shift+Z)">
        ↷
      </button>

      <div style={{ flex: 1 }} />

      {exporting && (
        <span style={{ fontSize: theme.font.size.sm, color: theme.color.accent }}>{exporting}</span>
      )}
      <button onClick={exportVideo} disabled={!hasContent || !!exporting} style={primaryBtn}>
        ⬆ Export
      </button>

      <Sep />
      <button
        onClick={onOpenSettings}
        title="Settings & MCP config"
        style={{ fontSize: theme.font.size.sm, color: theme.color.textDim }}
      >
        MCP{' '}
        <span style={{ color: mcp?.running ? '#5ad07a' : theme.color.danger }}>
          ● {mcp?.running ? 'on' : 'off'}
        </span>
      </button>
      <button onClick={onOpenSettings} title="Settings">
        ⚙
      </button>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  background: theme.color.accentDim,
  borderColor: theme.color.accent,
  color: '#fff',
  fontWeight: 600
}

function Sep(): JSX.Element {
  return <div style={{ width: 1, height: 22, background: theme.color.border, margin: '0 4px' }} />
}
