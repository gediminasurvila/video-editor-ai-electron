import { useCallback, useEffect, useRef, useState } from 'react'
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

const LAYOUT_KEY = 'video-ai:layout'
interface Layout {
  leftWidth: number
  rightWidth: number
  timelineHeight: number
  leftOpen: boolean
  rightOpen: boolean
}
const DEFAULT_LAYOUT: Layout = {
  leftWidth: 240,
  rightWidth: 300,
  timelineHeight: 260,
  leftOpen: true,
  rightOpen: true
}

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_LAYOUT
}

export function App(): JSX.Element {
  const [rightTab, setRightTab] = useState<RightTab>('inspector')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [layout, setLayout] = useState<Layout>(loadLayout)
  useShortcuts()

  // Persist layout whenever it changes
  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch {}
  }, [layout])

  const updateLayout = useCallback((patch: Partial<Layout>) => {
    setLayout((l) => ({ ...l, ...patch }))
  }, [])

  const clamp = (v: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, v))

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

      {/* Main workspace */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left panel — Media */}
        {layout.leftOpen ? (
          <div
            style={{
              width: layout.leftWidth,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              background: theme.color.panel
            }}
          >
            <MediaPanel />
          </div>
        ) : (
          <CollapsedStrip
            label="Media"
            side="left"
            onExpand={() => updateLayout({ leftOpen: true })}
          />
        )}

        {/* Left divider */}
        <PanelDivider
          direction="col"
          onDrag={(dx) =>
            updateLayout({
              leftWidth: clamp(layout.leftWidth + dx, 140, 480),
              leftOpen: true
            })
          }
          collapsed={!layout.leftOpen}
          onCollapse={() => updateLayout({ leftOpen: !layout.leftOpen })}
          collapseDir="left"
        />

        {/* Center — Preview */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Preview />
        </div>

        {/* Right divider */}
        <PanelDivider
          direction="col"
          onDrag={(dx) =>
            updateLayout({
              rightWidth: clamp(layout.rightWidth - dx, 200, 500),
              rightOpen: true
            })
          }
          collapsed={!layout.rightOpen}
          onCollapse={() => updateLayout({ rightOpen: !layout.rightOpen })}
          collapseDir="right"
        />

        {/* Right panel — Inspector / AI / Transcript */}
        {layout.rightOpen ? (
          <div
            style={{
              width: layout.rightWidth,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              background: theme.color.panel
            }}
          >
            <div
              style={{
                display: 'flex',
                borderBottom: `1px solid ${theme.color.border}`,
                flexShrink: 0
              }}
            >
              <RightTab
                label="Properties"
                active={rightTab === 'inspector'}
                onClick={() => setRightTab('inspector')}
              />
              <RightTab
                label="✨ AI"
                active={rightTab === 'agent'}
                onClick={() => setRightTab('agent')}
              />
              <RightTab
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
          </div>
        ) : (
          <CollapsedStrip
            label="Inspector"
            side="right"
            onExpand={() => updateLayout({ rightOpen: true })}
          />
        )}
      </div>

      {/* Timeline row divider */}
      <PanelDivider
        direction="row"
        onDrag={(dy) =>
          updateLayout({ timelineHeight: clamp(layout.timelineHeight - dy, 120, 560) })
        }
      />

      {/* Timeline */}
      <div style={{ height: layout.timelineHeight, flexShrink: 0, overflow: 'hidden' }}>
        <Timeline />
      </div>

      {/* Drop overlay */}
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

// ── Panel divider (drag to resize, click to collapse) ────────────────────────

function PanelDivider({
  direction,
  onDrag,
  onCollapse,
  collapseDir,
  collapsed
}: {
  direction: 'col' | 'row'
  onDrag: (delta: number) => void
  onCollapse?: () => void
  collapseDir?: 'left' | 'right'
  collapsed?: boolean
}): JSX.Element {
  const [active, setActive] = useState(false)
  const [hovered, setHovered] = useState(false)
  const lastPos = useRef(0)
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag

  useEffect(() => {
    if (!active) return
    const onMove = (e: MouseEvent): void => {
      const pos = direction === 'col' ? e.clientX : e.clientY
      const delta = pos - lastPos.current
      lastPos.current = pos
      onDragRef.current(delta)
    }
    const onUp = (): void => setActive(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [active, direction])

  const isCol = direction === 'col'
  const showBtn = (hovered || active) && onCollapse

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        e.preventDefault()
        setActive(true)
        lastPos.current = isCol ? e.clientX : e.clientY
      }}
      style={{
        [isCol ? 'width' : 'height']: 5,
        [isCol ? 'height' : 'width']: '100%',
        cursor: isCol ? 'col-resize' : 'row-resize',
        background: active
          ? theme.color.accent
          : hovered
            ? theme.color.border + 'cc'
            : theme.color.border,
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
        transition: 'background 0.1s'
      }}
    >
      {showBtn && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onCollapse}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
          style={{
            position: 'absolute',
            ...(isCol
              ? { top: 8, left: '50%', transform: 'translateX(-50%)' }
              : { left: 8, top: '50%', transform: 'translateY(-50%)' }),
            width: 18,
            height: 18,
            padding: 0,
            fontSize: 10,
            borderRadius: '50%',
            border: `1px solid ${theme.color.border}`,
            background: theme.color.panelAlt,
            color: theme.color.textDim,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 11,
            lineHeight: 1
          }}
        >
          {isCol
            ? collapseDir === 'right'
              ? collapsed ? '‹' : '›'
              : collapsed ? '›' : '‹'
            : collapsed ? '▲' : '▼'}
        </button>
      )}
    </div>
  )
}

// ── Collapsed panel strip ─────────────────────────────────────────────────────

function CollapsedStrip({
  label,
  side,
  onExpand
}: {
  label: string
  side: 'left' | 'right'
  onExpand: () => void
}): JSX.Element {
  return (
    <div
      style={{
        width: 26,
        flexShrink: 0,
        background: theme.color.panel,
        borderRight: side === 'left' ? `1px solid ${theme.color.border}` : undefined,
        borderLeft: side === 'right' ? `1px solid ${theme.color.border}` : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0
      }}
    >
      <button
        onClick={onExpand}
        title={`Expand ${label}`}
        style={{
          width: '100%',
          height: 28,
          padding: 0,
          border: 'none',
          borderRadius: 0,
          borderBottom: `1px solid ${theme.color.border}`,
          background: 'transparent',
          color: theme.color.textDim,
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {side === 'left' ? '›' : '‹'}
      </button>
      <div
        style={{
          writingMode: 'vertical-rl',
          transform: side === 'left' ? 'rotate(180deg)' : 'none',
          fontSize: theme.font.size.sm,
          color: theme.color.textDim,
          padding: `${theme.space.sm}px 0`,
          userSelect: 'none',
          cursor: 'default',
          letterSpacing: 0.5,
          textTransform: 'uppercase'
        }}
      >
        {label}
      </div>
    </div>
  )
}

// ── Right panel tab ───────────────────────────────────────────────────────────

function RightTab({
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
        borderBottom: active ? `2px solid ${theme.color.accent}` : '2px solid transparent',
        fontSize: theme.font.size.sm,
        padding: '6px 4px',
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  )
}
