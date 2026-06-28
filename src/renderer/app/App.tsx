import { useState } from 'react'
import { theme } from './theme'
import { Toolbar } from '../panels/Toolbar/Toolbar'
import { MediaPanel } from '../panels/MediaPanel/MediaPanel'
import { Preview } from '../panels/Preview/Preview'
import { Inspector } from '../panels/Inspector/Inspector'
import { Timeline } from '../panels/Timeline/Timeline'
import { AgentChat } from '../panels/AgentChat/AgentChat'
import { TranscriptPanel } from '../panels/Transcript/TranscriptPanel'
import { SettingsModal } from '../panels/Settings/SettingsModal'
import { useShortcuts } from '../hooks/useShortcuts'
import { importFiles } from '../actions/quickActions'

type RightTab = 'inspector' | 'agent' | 'transcript'

export function App(): JSX.Element {
  const [rightTab, setRightTab] = useState<RightTab>('inspector')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  useShortcuts()

  function onDragOver(e: React.DragEvent): void {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setDropActive(true)
    }
  }
  function onDrop(e: React.DragEvent): void {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDropActive(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.api.getPathForFile(f))
      .filter(Boolean)
    if (paths.length) void importFiles(paths)
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropActive(false)}
      onDrop={onDrop}
    >
      <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Panel width={260} border="right">
          <MediaPanel />
        </Panel>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Preview />
        </div>
        <Panel width={320} border="left">
          <div style={{ display: 'flex', borderBottom: `1px solid ${theme.color.border}` }}>
            <Tab
              label="Properties"
              active={rightTab === 'inspector'}
              onClick={() => setRightTab('inspector')}
            />
            <Tab
              label="✨ AI"
              active={rightTab === 'agent'}
              onClick={() => setRightTab('agent')}
            />
            <Tab
              label="Transcript"
              active={rightTab === 'transcript'}
              onClick={() => setRightTab('transcript')}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {rightTab === 'inspector' ? (
              <Inspector />
            ) : rightTab === 'agent' ? (
              <AgentChat />
            ) : (
              <TranscriptPanel />
            )}
          </div>
        </Panel>
      </div>
      <div style={{ height: 280, borderTop: `1px solid ${theme.color.border}` }}>
        <Timeline />
      </div>

      {dropActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(108,140,255,0.12)',
            border: `2px dashed ${theme.color.accent}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: theme.font.size.lg,
            color: theme.color.text,
            pointerEvents: 'none',
            zIndex: 50
          }}
        >
          Drop files to import
        </div>
      )}
    </div>
  )
}

function Panel({
  children,
  width,
  border
}: {
  children: React.ReactNode
  width: number
  border: 'left' | 'right'
}): JSX.Element {
  return (
    <div
      style={{
        width,
        background: theme.color.panel,
        display: 'flex',
        flexDirection: 'column',
        [border === 'right' ? 'borderRight' : 'borderLeft']: `1px solid ${theme.color.border}`
      }}
    >
      {children}
    </div>
  )
}

function Tab({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        border: 'none',
        borderRadius: 0,
        background: active ? theme.color.panelAlt : 'transparent',
        color: active ? theme.color.text : theme.color.textDim,
        borderBottom: active ? `2px solid ${theme.color.accent}` : '2px solid transparent'
      }}
    >
      {label}
    </button>
  )
}
