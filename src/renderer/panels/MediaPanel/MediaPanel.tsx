import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { runCommand } from '../../commands'

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function MediaPanel(): JSX.Element {
  const project = useEditor((s) => s.project)

  async function importMedia(): Promise<void> {
    const paths = await window.api.openMediaDialog()
    for (const p of paths) await runCommand('import_media', { filePath: p })
  }

  async function addToTimeline(mediaId: string): Promise<void> {
    const seq = activeSequence(useEditor.getState().project)
    if (!seq) {
      alert('Create a sequence first (+ Sequence).')
      return
    }
    const track = seq.tracks.find((t) => t.type === 'video')
    if (!track) return
    // Append after the last clip on the track.
    const start = track.clips.reduce((max, c) => Math.max(max, c.start + (c.outPoint - c.inPoint)), 0)
    await runCommand('add_clip', { trackId: track.id, mediaId, start })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Media" action={<button onClick={importMedia}>Import</button>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.space.sm }}>
        {project.mediaPool.length === 0 && (
          <p style={{ color: theme.color.textDim, fontSize: theme.font.size.sm }}>
            No media yet. Click Import to add video or audio files.
          </p>
        )}
        {project.mediaPool.map((m) => (
          <div
            key={m.id}
            onDoubleClick={() => addToTimeline(m.id)}
            title="Double-click to add to timeline"
            style={{
              padding: theme.space.sm,
              marginBottom: theme.space.xs,
              background: theme.color.panelAlt,
              borderRadius: theme.radius.sm,
              cursor: 'pointer'
            }}
          >
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.name}
            </div>
            <div style={{ fontSize: theme.font.size.sm, color: theme.color.textDim }}>
              {m.width > 0 ? `${m.width}×${m.height} · ` : ''}
              {fmtDuration(m.duration)} · {m.codec ?? 'audio'}
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
