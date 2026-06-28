import { useEffect, useRef, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { runCommand } from '../../commands'
import { importViaDialog } from '../../actions/quickActions'
import { sequenceDuration } from '@shared/schema'
import type { McpStatus } from '@shared/ipc'

const SEQUENCE_PRESETS = [
  { label: '1080p HD  30 fps', width: 1920, height: 1080, fps: 30 },
  { label: '1080p HD  60 fps', width: 1920, height: 1080, fps: 60 },
  { label: '4K UHD   30 fps', width: 3840, height: 2160, fps: 30 },
  { label: 'Vertical 9:16  30 fps', width: 1080, height: 1920, fps: 30 }
] as const

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
  const { project, filePath, undo, redo, past, future, setProject } = useEditor()
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [presetOpen, setPresetOpen] = useState(false)
  const presetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!presetOpen) return
    function onClickOutside(e: MouseEvent): void {
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) {
        setPresetOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [presetOpen])

  const seq = activeSequence(project)
  const hasContent = !!seq && sequenceDuration(seq) > 0

  useEffect(() => {
    window.api.mcpStatus().then(setMcp)
    return window.api.onMcpStatusChanged(setMcp)
  }, [])

  async function newSequenceFromPreset(preset: (typeof SEQUENCE_PRESETS)[number]): Promise<void> {
    setPresetOpen(false)
    await runCommand('create_sequence', {
      name: preset.label,
      width: preset.width,
      height: preset.height,
      fps: preset.fps
    })
    await runCommand('add_track', { type: 'video', name: 'Video 1' })
    await runCommand('add_track', { type: 'audio', name: 'Audio 1' })
  }

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

      <div ref={presetRef} style={{ position: 'relative' }}>
        <button onClick={() => setPresetOpen((o) => !o)} title="Create a new sequence">
          + Sequence
        </button>
        {presetOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: theme.color.panel,
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.md,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              zIndex: 100,
              minWidth: 200
            }}
          >
            {SEQUENCE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => void newSequenceFromPreset(p)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderRadius: 0,
                  padding: `${theme.space.sm}px ${theme.space.md}px`,
                  cursor: 'pointer',
                  fontSize: theme.font.size.sm,
                  color: theme.color.text
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = theme.color.panelAlt)
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = 'none')
                }
              >
                {p.label}
                <span style={{ color: theme.color.textDim, fontSize: 10, marginLeft: 8 }}>
                  {p.width}×{p.height}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

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
