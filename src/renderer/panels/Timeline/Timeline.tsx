import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { runCommand } from '../../commands'
import { clipDuration } from '@shared/schema'

const PX_PER_SEC = 50
const TRACK_HEIGHT = 56
const LABEL_WIDTH = 96

export function Timeline(): JSX.Element {
  const project = useEditor((s) => s.project)
  const playhead = useEditor((s) => s.playhead)
  const setPlayhead = useEditor((s) => s.setPlayhead)
  const selectedClipId = useEditor((s) => s.selectedClipId)
  const select = useEditor((s) => s.select)
  const seq = activeSequence(project)

  function onRulerClick(e: React.MouseEvent): void {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setPlayhead(Math.max(0, x / PX_PER_SEC))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.color.panel }}>
      <div
        style={{
          height: 32,
          display: 'flex',
          alignItems: 'center',
          gap: theme.space.sm,
          padding: `0 ${theme.space.sm}px`,
          borderBottom: `1px solid ${theme.color.border}`
        }}
      >
        <strong style={{ fontSize: theme.font.size.sm }}>Timeline</strong>
        <button onClick={() => runCommand('add_track', { type: 'video' })}>+ Video</button>
        <button onClick={() => runCommand('add_track', { type: 'audio' })}>+ Audio</button>
        <button
          disabled={!selectedClipId}
          onClick={() =>
            selectedClipId && runCommand('split_clip', { clipId: selectedClipId, at: playhead })
          }
        >
          Split at playhead
        </button>
      </div>

      {!seq ? (
        <div style={{ padding: theme.space.md, color: theme.color.textDim }}>
          No active sequence.
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {/* Ruler */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2 }}>
            <div style={{ width: LABEL_WIDTH, background: theme.color.panel }} />
            <div
              onClick={onRulerClick}
              style={{
                position: 'relative',
                height: 20,
                flex: 1,
                background: theme.color.panelAlt,
                borderBottom: `1px solid ${theme.color.border}`,
                cursor: 'text'
              }}
            >
              {Array.from({ length: 60 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: i * PX_PER_SEC,
                    fontSize: 9,
                    color: theme.color.textDim,
                    paddingLeft: 2
                  }}
                >
                  {i}s
                </div>
              ))}
            </div>
          </div>

          {/* Tracks */}
          {seq.tracks.map((track) => (
            <div key={track.id} style={{ display: 'flex', height: TRACK_HEIGHT }}>
              <div
                style={{
                  width: LABEL_WIDTH,
                  borderRight: `1px solid ${theme.color.border}`,
                  borderBottom: `1px solid ${theme.color.border}`,
                  padding: theme.space.xs,
                  fontSize: theme.font.size.sm,
                  color: theme.color.textDim,
                  background: theme.color.panel,
                  position: 'sticky',
                  left: 0
                }}
              >
                {track.name}
              </div>
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  background: theme.color.track,
                  borderBottom: `1px solid ${theme.color.border}`
                }}
              >
                {track.clips.map((clip) => {
                  const media = project.mediaPool.find((m) => m.id === clip.mediaId)
                  return (
                    <div
                      key={clip.id}
                      onClick={() => select(clip.id)}
                      title={media?.name}
                      style={{
                        position: 'absolute',
                        left: clip.start * PX_PER_SEC,
                        width: clipDuration(clip) * PX_PER_SEC,
                        top: 4,
                        bottom: 4,
                        background: track.type === 'video' ? theme.color.clip : theme.color.clipAudio,
                        border: `2px solid ${
                          selectedClipId === clip.id ? theme.color.accent : 'transparent'
                        }`,
                        borderRadius: theme.radius.sm,
                        overflow: 'hidden',
                        padding: '2px 6px',
                        fontSize: theme.font.size.sm,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer'
                      }}
                    >
                      {media?.name ?? 'clip'}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: LABEL_WIDTH + playhead * PX_PER_SEC,
              width: 2,
              background: theme.color.danger,
              pointerEvents: 'none',
              zIndex: 3
            }}
          />
        </div>
      )}
    </div>
  )
}
