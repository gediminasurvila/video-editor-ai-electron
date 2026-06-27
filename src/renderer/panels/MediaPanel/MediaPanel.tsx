import { useEffect } from 'react'
import { theme } from '../../app/theme'
import { useEditor } from '../../state/store'
import { useThumbnails } from '../../state/thumbnails'
import { importViaDialog, addMediaToTimeline } from '../../actions/quickActions'

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function MediaPanel(): JSX.Element {
  const project = useEditor((s) => s.project)
  const strips = useThumbnails((s) => s.strips)
  const ensure = useThumbnails((s) => s.ensure)

  useEffect(() => {
    for (const m of project.mediaPool) ensure(m)
  }, [project.mediaPool, ensure])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Media" action={<button onClick={importViaDialog}>+ Import</button>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.space.sm }}>
        {project.mediaPool.length === 0 && (
          <div
            onClick={importViaDialog}
            style={{
              marginTop: theme.space.md,
              padding: theme.space.lg,
              border: `1px dashed ${theme.color.border}`,
              borderRadius: theme.radius.md,
              textAlign: 'center',
              color: theme.color.textDim,
              fontSize: theme.font.size.sm,
              cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: 22, marginBottom: theme.space.sm }}>📁</div>
            Drop video or audio files here,
            <br />
            or click to import.
          </div>
        )}
        {project.mediaPool.map((m) => (
          <div
            key={m.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-media-id', m.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onDoubleClick={() => addMediaToTimeline(m.id)}
            title="Double-click or drag onto the timeline"
            style={{
              padding: theme.space.sm,
              marginBottom: theme.space.xs,
              background: theme.color.panelAlt,
              borderRadius: theme.radius.sm,
              cursor: 'grab',
              display: 'flex',
              gap: theme.space.sm,
              alignItems: 'center'
            }}
          >
            <div
              style={{
                width: 64,
                height: 36,
                flexShrink: 0,
                borderRadius: theme.radius.sm,
                background: strips[m.id]?.[0]
                  ? `#000 center/cover no-repeat url(${strips[m.id][0]})`
                  : theme.color.track,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16
              }}
            >
              {!strips[m.id]?.[0] && (m.width > 0 ? '🎞️' : '🔊')}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name}
              </div>
              <div style={{ fontSize: theme.font.size.sm, color: theme.color.textDim }}>
                {m.width > 0 ? `${m.width}×${m.height} · ` : ''}
                {fmtDuration(m.duration)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Header({
  title,
  action
}: {
  title: string
  action?: React.ReactNode
}): JSX.Element {
  return (
    <div
      style={{
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${theme.space.sm}px`,
        borderBottom: `1px solid ${theme.color.border}`,
        fontSize: theme.font.size.sm,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: theme.color.textDim
      }}
    >
      <span>{title}</span>
      {action}
    </div>
  )
}
