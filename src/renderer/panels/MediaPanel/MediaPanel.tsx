import { useCallback, useEffect, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor } from '../../state/store'
import { useThumbnails } from '../../state/thumbnails'
import { importViaDialog, importFolderViaDialog, addMediaToTimeline } from '../../actions/quickActions'
import { ContextMenu, type ContextMenuState } from '../Timeline/ContextMenu'

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function MediaPanel(): JSX.Element {
  const project = useEditor((s) => s.project)
  const strips = useThumbnails((s) => s.strips)
  const ensure = useThumbnails((s) => s.ensure)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const closeCtx = useCallback(() => setCtxMenu(null), [])
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    for (const m of project.mediaPool) ensure(m)
  }, [project.mediaPool, ensure])

  // Probe each media file to detect offline (missing / unreadable) items.
  useEffect(() => {
    const ids = new Set<string>()
    const check = async (): Promise<void> => {
      for (const m of project.mediaPool) {
        try { await window.api.probeMedia(m.filePath) }
        catch { ids.add(m.id) }
      }
      setOfflineIds(new Set(ids))
    }
    void check()
  // Only re-check when the media pool list changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.mediaPool.map((m) => m.id).join(',')])

  function openMediaCtx(e: React.MouseEvent, mediaId: string): void {
    e.preventDefault()
    e.stopPropagation()
    const isOffline = offlineIds.has(mediaId)
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Add to Timeline',
          disabled: isOffline,
          onClick: () => void addMediaToTimeline(mediaId)
        },
        isOffline
          ? {
              label: 'Relink media…',
              onClick: async () => {
                const paths = await window.api.openMediaDialog()
                if (!paths[0]) return
                useEditor.getState().commit((p) => {
                  const m = p.mediaPool.find((x) => x.id === mediaId)
                  if (m) {
                    m.filePath = paths[0]
                    m.name = paths[0].split('/').pop() ?? m.name
                  }
                })
              }
            }
          : { separator: true as const },
        {
          label: 'Remove from Project',
          danger: true,
          onClick: () =>
            useEditor.getState().commit((p) => {
              p.mediaPool = p.mediaPool.filter((m) => m.id !== mediaId)
              for (const seq of p.sequences) {
                for (const track of seq.tracks) {
                  track.clips = track.clips.filter((c) => c.mediaId !== mediaId)
                }
              }
            })
        }
      ]
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header
        title="Media"
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={importViaDialog} title="Import files">+ Files</button>
            <button onClick={importFolderViaDialog} title="Import an entire folder of media">+ Folder</button>
          </div>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.space.sm }}>
        {project.mediaPool.length === 0 ? (
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
        ) : (
          project.mediaPool.map((m) => {
            const offline = offlineIds.has(m.id)
            return (
              <div
                key={m.id}
                draggable={!offline}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-media-id', m.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onDoubleClick={() => !offline && void addMediaToTimeline(m.id)}
                onContextMenu={(e) => openMediaCtx(e, m.id)}
                title={offline ? 'Media file not found — right-click to relink' : 'Double-click or drag to timeline · Right-click for options'}
                style={{
                  padding: theme.space.sm,
                  marginBottom: theme.space.xs,
                  background: theme.color.panelAlt,
                  borderRadius: theme.radius.sm,
                  cursor: offline ? 'default' : 'grab',
                  display: 'flex',
                  gap: theme.space.sm,
                  alignItems: 'center',
                  opacity: offline ? 0.55 : 1,
                  border: offline ? `1px solid #a03020` : '1px solid transparent'
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
                  {offline ? '⚠️' : !strips[m.id]?.[0] ? (m.width > 0 ? '🎞️' : '🔊') : null}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: theme.font.size.md
                    }}
                  >
                    {m.name}
                  </div>
                  {offline ? (
                    <div style={{ fontSize: theme.font.size.sm, color: '#e06050', marginTop: 2 }}>
                      Media offline
                    </div>
                  ) : (
                    <div style={{ fontSize: theme.font.size.sm, color: theme.color.textDim, marginTop: 2 }}>
                      {m.width > 0 ? `${m.width}×${m.height}  ` : ''}
                      {m.hasAudio ? '🔊 ' : ''}
                      {fmtDuration(m.duration)}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={closeCtx} />}
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
        color: theme.color.textDim,
        flexShrink: 0
      }}
    >
      <span>{title}</span>
      {action}
    </div>
  )
}
