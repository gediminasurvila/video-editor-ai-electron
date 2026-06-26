import { useState } from 'react'
import { theme } from './theme'
import { Toolbar } from '../panels/Toolbar/Toolbar'
import { MediaPanel } from '../panels/MediaPanel/MediaPanel'
import { Preview } from '../panels/Preview/Preview'
import { Inspector } from '../panels/Inspector/Inspector'
import { Timeline } from '../panels/Timeline/Timeline'
import { AgentChat } from '../panels/AgentChat/AgentChat'

type RightTab = 'inspector' | 'agent'

export function App(): JSX.Element {
  const [rightTab, setRightTab] = useState<RightTab>('agent')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Panel width={260} border="right">
          <MediaPanel />
        </Panel>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Preview />
        </div>
        <Panel width={320} border="left">
          <div style={{ display: 'flex', borderBottom: `1px solid ${theme.color.border}` }}>
            <Tab label="Agent" active={rightTab === 'agent'} onClick={() => setRightTab('agent')} />
            <Tab
              label="Inspector"
              active={rightTab === 'inspector'}
              onClick={() => setRightTab('inspector')}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {rightTab === 'agent' ? <AgentChat /> : <Inspector />}
          </div>
        </Panel>
      </div>
      <div style={{ height: 280, borderTop: `1px solid ${theme.color.border}` }}>
        <Timeline />
      </div>
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
