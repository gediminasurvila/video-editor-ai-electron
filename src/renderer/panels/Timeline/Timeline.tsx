import { useCallback, useEffect, useRef, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor, activeSequence, type ToolMode } from '../../state/store'
import { useThumbnails } from '../../state/thumbnails'
import { runCommand } from '../../commands'
import { addMediaToTimeline } from '../../actions/quickActions'
import { snapTime } from '../../timeline/snap'
import { clipDuration, isTitle, type Clip, type Track } from '@shared/schema'
import { ContextMenu, type ContextMenuState, type MenuEntry } from './ContextMenu'

const TRACK_HEIGHT = 64
const LABEL_WIDTH = 112
const EDGE_PX = 8
const MIN_DUR = 0.1
const SNAP_PX = 8

type DragMode = 'move' | 'trim-left' | 'trim-right'
interface Drag {
  clipId: string
  trackId: string
  mode: DragMode
  startX: number
  origStart: number
  origIn: number
  origOut: number
  mediaDuration: number
  start: number
  inPoint: number
  outPoint: number
  moved: boolean
  ripple: boolean
}

interface TrackDrag {
  trackId: string
  origIndex: number
  targetIndex: number
  startY: number
}

export function Timeline(): JSX.Element {
  const project = useEditor((s) => s.project)
  const playhead = useEditor((s) => s.playhead)
  const setPlayhead = useEditor((s) => s.setPlayhead)
  const selectedClipId = useEditor((s) => s.selectedClipId)
  const select = useEditor((s) => s.select)
  const rangeIn = useEditor((s) => s.rangeIn)
  const rangeOut = useEditor((s) => s.rangeOut)
  const setRangeIn = useEditor((s) => s.setRangeIn)
  const setRangeOut = useEditor((s) => s.setRangeOut)
  const clearRange = useEditor((s) => s.clearRange)
  const toolMode = useEditor((s) => s.toolMode)
  const setToolMode = useEditor((s) => s.setToolMode)
  const seq = activeSequence(project)

  const [pxPerSec, setPxPerSec] = useState(50)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [trackDrag, setTrackDrag] = useState<TrackDrag | null>(null)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const laneRef = useRef<HTMLDivElement>(null)
  const strips = useThumbnails((s) => s.strips)
  const ensureThumbs = useThumbnails((s) => s.ensure)

  const mediaById = new Map(project.mediaPool.map((m) => [m.id, m]))

  useEffect(() => {
    for (const m of project.mediaPool) ensureThumbs(m)
  }, [project.mediaPool, ensureThumbs])

  function snapPoints(exceptClipId?: string): number[] {
    const pts = [0, playhead]
    for (const t of seq?.tracks ?? []) {
      for (const c of t.clips) {
        if (c.id === exceptClipId) continue
        pts.push(c.start, c.start + clipDuration(c))
      }
    }
    return pts
  }

  function timeAtClientX(clientX: number): number {
    const lane = laneRef.current
    if (!lane) return 0
    const rect = lane.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left + lane.scrollLeft) / pxPerSec)
  }

  // ── Ruler scrub ──────────────────────────────────────────────────────────
  function onRulerPointerDown(e: React.PointerEvent): void {
    e.currentTarget.setPointerCapture(e.pointerId)
    setPlayhead(timeAtClientX(e.clientX))
  }
  function onRulerPointerMove(e: React.PointerEvent): void {
    if (e.buttons === 1) setPlayhead(timeAtClientX(e.clientX))
  }

  // ── Clip drag (move / trim) ───────────────────────────────────────────────
  function onClipPointerDown(e: React.PointerEvent, clip: Clip, trackId: string): void {
    e.stopPropagation()
    if (e.button !== 0) return

    if (toolMode === 'cut') {
      void runCommand('split_clip', { clipId: clip.id, at: timeAtClientX(e.clientX) })
      return
    }

    select(clip.id)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const width = rect.width

    let mode: DragMode
    if (toolMode === 'trim') {
      mode = offsetX < width / 2 ? 'trim-left' : 'trim-right'
    } else {
      if (offsetX <= EDGE_PX) mode = 'trim-left'
      else if (offsetX >= width - EDGE_PX) mode = 'trim-right'
      else mode = 'move'
    }

    const isEdgeTrim = mode === 'trim-left' || mode === 'trim-right'
    setDrag({
      clipId: clip.id,
      trackId,
      mode,
      startX: e.clientX,
      origStart: clip.start,
      origIn: clip.inPoint,
      origOut: clip.outPoint,
      mediaDuration: mediaById.get(clip.mediaId)?.duration ?? clip.outPoint,
      start: clip.start,
      inPoint: clip.inPoint,
      outPoint: clip.outPoint,
      moved: false,
      ripple: isEdgeTrim && e.shiftKey
    })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent): void => {
      const deltaSec = (e.clientX - drag.startX) / pxPerSec
      const points = snapPoints(drag.clipId)
      setDrag((d) => {
        if (!d) return d
        if (d.mode === 'move') {
          let start = Math.max(0, d.origStart + deltaSec)
          const dur = d.origOut - d.origIn
          const snappedStart = snapTime(start, points, SNAP_PX / pxPerSec)
          const snappedEnd = snapTime(start + dur, points, SNAP_PX / pxPerSec)
          start = snappedStart !== start ? snappedStart : snappedEnd - dur
          return { ...d, start: Math.max(0, start), moved: true }
        }
        if (d.mode === 'trim-left') {
          let start = snapTime(d.origStart + deltaSec, points, SNAP_PX / pxPerSec)
          let inPoint = d.origIn + (start - d.origStart)
          if (inPoint < 0) { start -= inPoint; inPoint = 0 }
          if (d.origOut - inPoint < MIN_DUR) {
            inPoint = d.origOut - MIN_DUR
            start = d.origStart + (inPoint - d.origIn)
          }
          return { ...d, start: Math.max(0, start), inPoint, moved: true }
        }
        // trim-right
        const end = snapTime(d.origStart + (d.origOut - d.origIn) + deltaSec, points, SNAP_PX / pxPerSec)
        let outPoint = d.origIn + (end - d.origStart)
        outPoint = Math.min(d.mediaDuration, Math.max(d.origIn + MIN_DUR, outPoint))
        return { ...d, outPoint, moved: true }
      })
    }
    const onUp = (): void => {
      setDrag((d) => {
        if (d?.moved) {
          useEditor.getState().commit((p) => {
            const sequence = p.sequences.find((s) => s.id === p.activeSequenceId)
            for (const t of sequence?.tracks ?? []) {
              const c = t.clips.find((x) => x.id === d.clipId)
              if (c) {
                const prevStart = c.start
                const prevIn = c.inPoint
                const prevOut = c.outPoint
                c.start = d.start
                c.inPoint = d.inPoint
                c.outPoint = d.outPoint

                // Propagate to linked clip
                if (c.linkedClipId) {
                  for (const t2 of sequence!.tracks) {
                    const linked = t2.clips.find((x) => x.id === c.linkedClipId)
                    if (linked) {
                      linked.start = Math.max(0, linked.start + (d.start - prevStart))
                      linked.inPoint = Math.max(0, linked.inPoint + (d.inPoint - prevIn))
                      linked.outPoint = linked.outPoint + (d.outPoint - prevOut)
                      break
                    }
                  }
                }

                // Ripple: shift all other clips right of the trim point
                if (d.ripple && d.mode !== 'move') {
                  const oldDur = prevOut - prevIn
                  const newDur = d.outPoint - d.inPoint
                  const delta = newDur - oldDur
                  if (delta !== 0) {
                    const boundary = d.start + newDur
                    for (const t2 of sequence!.tracks) {
                      for (const c2 of t2.clips) {
                        if (c2.id !== d.clipId && c2.id !== c.linkedClipId && c2.start >= boundary - delta) {
                          c2.start = Math.max(0, c2.start + delta)
                        }
                      }
                    }
                  }
                }
                return
              }
            }
          })
        }
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, pxPerSec])

  // ── Track reorder drag ────────────────────────────────────────────────────
  function onTrackGripDown(e: React.MouseEvent, trackId: string, origIndex: number): void {
    e.preventDefault()
    e.stopPropagation()
    setTrackDrag({ trackId, origIndex, targetIndex: origIndex, startY: e.clientY })
  }

  useEffect(() => {
    if (!trackDrag || !seq) return
    const onMove = (e: MouseEvent): void => {
      const dy = e.clientY - trackDrag.startY
      const delta = Math.round(dy / TRACK_HEIGHT)
      const target = Math.max(0, Math.min(seq.tracks.length - 1, trackDrag.origIndex + delta))
      setTrackDrag((d) => d ? { ...d, targetIndex: target } : d)
    }
    const onUp = (): void => {
      setTrackDrag((d) => {
        if (d && d.targetIndex !== d.origIndex) {
          useEditor.getState().commit((p) => {
            const s = p.sequences.find((sq) => sq.id === p.activeSequenceId)
            if (!s) return
            const tracks = [...s.tracks]
            const [moved] = tracks.splice(d.origIndex, 1)
            tracks.splice(d.targetIndex, 0, moved)
            s.tracks = tracks
          })
        }
        return null
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [trackDrag, seq])

  // ── Drop media from bin ───────────────────────────────────────────────────
  function onLaneDrop(e: React.DragEvent, track: Track): void {
    const mediaId = e.dataTransfer.getData('application/x-media-id')
    if (!mediaId) return
    e.preventDefault()
    void addMediaToTimeline(mediaId, timeAtClientX(e.clientX), track.id)
  }

  // ── Fit zoom ──────────────────────────────────────────────────────────────
  function fitZoom(): void {
    const lane = laneRef.current
    const dur = seq
      ? Math.max(5, ...seq.tracks.flatMap((t) => t.clips.map((c) => c.start + clipDuration(c))))
      : 10
    const width = (lane?.clientWidth ?? 800) - 24
    setPxPerSec(Math.min(200, Math.max(10, width / dur)))
  }

  // ── Context menus ─────────────────────────────────────────────────────────
  const closeCtx = useCallback(() => setCtxMenu(null), [])

  function openClipCtx(e: React.MouseEvent, clip: Clip, track: Track): void {
    e.preventDefault()
    e.stopPropagation()
    const isVideo = track.type === 'video'
    const withinClip = playhead >= clip.start && playhead <= clip.start + clipDuration(clip)
    const items: MenuEntry[] = [
      {
        label: 'Split at Playhead',
        shortcut: 'S',
        disabled: !withinClip,
        onClick: () => void runCommand('split_clip', { clipId: clip.id, at: playhead })
      },
      { separator: true },
      {
        label: 'Delete',
        shortcut: '⌫',
        danger: true,
        onClick: () => void runCommand('delete_clip', { clipId: clip.id })
      },
      {
        label: 'Ripple Delete',
        shortcut: '⇧⌫',
        danger: true,
        onClick: () => void runCommand('delete_clip', { clipId: clip.id, ripple: true })
      },
      { separator: true },
      {
        label: clip.transition ? 'Remove Transition' : 'Add Dissolve',
        onClick: () =>
          void runCommand('set_transition', {
            clipId: clip.id,
            type: clip.transition ? 'none' : 'dissolve',
            duration: clip.transition?.duration ?? 1
          })
      },
      {
        label: `Fade In  ${clip.fadeIn > 0 ? '✓ ' : ''}0.5s`,
        onClick: () =>
          void runCommand('set_audio', { clipId: clip.id, fadeIn: clip.fadeIn > 0 ? 0 : 0.5 })
      },
      {
        label: `Fade Out  ${clip.fadeOut > 0 ? '✓ ' : ''}0.5s`,
        onClick: () =>
          void runCommand('set_audio', { clipId: clip.id, fadeOut: clip.fadeOut > 0 ? 0 : 0.5 })
      },
      ...(clip.linkedClipId && isVideo
        ? ([
            { separator: true } as MenuEntry,
            {
              label: 'Detach Audio',
              onClick: () => void runCommand('detach_audio', { clipId: clip.id })
            } as MenuEntry
          ])
        : [])
    ]
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }

  function openTrackCtx(e: React.MouseEvent, track: Track): void {
    e.preventDefault()
    e.stopPropagation()
    const trackCount = seq?.tracks.length ?? 0
    const items: MenuEntry[] = [
      {
        label: track.muted ? 'Unmute Track' : 'Mute Track',
        onClick: () =>
          useEditor.getState().commit((p) => {
            const s = p.sequences.find((sq) => sq.id === p.activeSequenceId)
            const t = s?.tracks.find((t) => t.id === track.id)
            if (t) t.muted = !t.muted
          })
      },
      { separator: true },
      {
        label: 'Add Video Track',
        onClick: () => void runCommand('add_track', { type: 'video' })
      },
      {
        label: 'Add Audio Track',
        onClick: () => void runCommand('add_track', { type: 'audio' })
      },
      { separator: true },
      {
        label: 'Delete Track',
        danger: true,
        disabled: trackCount <= 1,
        onClick: () =>
          useEditor.getState().commit((p) => {
            const s = p.sequences.find((sq) => sq.id === p.activeSequenceId)
            if (s) s.tracks = s.tracks.filter((t) => t.id !== track.id)
          })
      }
    ]
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }

  function openLaneCtx(e: React.MouseEvent): void {
    e.preventDefault()
    if (!seq) return
    const items: MenuEntry[] = [
      {
        label: 'Add Video Track',
        onClick: () => void runCommand('add_track', { type: 'video' })
      },
      {
        label: 'Add Audio Track',
        onClick: () => void runCommand('add_track', { type: 'audio' })
      }
    ]
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }

  // ── Track mute toggle ─────────────────────────────────────────────────────
  function toggleMute(track: Track): void {
    useEditor.getState().commit((p) => {
      const s = p.sequences.find((sq) => sq.id === p.activeSequenceId)
      const t = s?.tracks.find((t) => t.id === track.id)
      if (t) t.muted = !t.muted
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.color.panel }}
      onContextMenu={openLaneCtx}
    >
      {/* Toolbar */}
      <div
        style={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: `0 ${theme.space.sm}px`,
          borderBottom: `1px solid ${theme.color.border}`,
          flexShrink: 0
        }}
      >
        <strong style={{ fontSize: theme.font.size.sm, marginRight: 4 }}>Timeline</strong>
        <ToolBtn label="Select" shortcut="V" mode="select" current={toolMode} onSelect={setToolMode} />
        <ToolBtn label="Trim" shortcut="T" mode="trim" current={toolMode} onSelect={setToolMode} />
        <ToolBtn label="Cut" shortcut="C" mode="cut" current={toolMode} onSelect={setToolMode} />
        <div style={{ width: 1, background: theme.color.border, height: 16, margin: '0 4px' }} />
        <TlBtn
          disabled={!seq}
          onClick={() => void runCommand('add_title', { text: 'Title', start: playhead, duration: 3 })}
          title="Add title clip at playhead"
        >
          T Title
        </TlBtn>
        <TlBtn
          disabled={!selectedClipId}
          onClick={() => selectedClipId && void runCommand('split_clip', { clipId: selectedClipId, at: playhead })}
          title="Split selected clip at playhead (S)"
        >
          ✂ Split
        </TlBtn>
        <TlBtn
          disabled={!selectedClipId}
          onClick={() => selectedClipId && void runCommand('delete_clip', { clipId: selectedClipId })}
          title="Delete selected clip (Delete)"
        >
          ⌫ Delete
        </TlBtn>
        <div style={{ width: 1, background: theme.color.border, height: 16, margin: '0 4px' }} />
        <TlBtn onClick={() => setRangeIn(playhead)} title="Set in-point (I)">I</TlBtn>
        <TlBtn onClick={() => setRangeOut(playhead)} title="Set out-point (O)">O</TlBtn>
        <TlBtn
          disabled={rangeIn === null || rangeOut === null || rangeOut <= (rangeIn ?? 0)}
          onClick={() => {
            if (rangeIn !== null && rangeOut !== null) {
              void runCommand('delete_range', { inPoint: rangeIn, outPoint: rangeOut, ripple: true })
              clearRange()
            }
          }}
          title="Delete range between I/O markers (X)"
          style={rangeIn !== null && rangeOut !== null ? { color: theme.color.danger } : {}}
        >
          Del Range
        </TlBtn>
        {(rangeIn !== null || rangeOut !== null) && (
          <TlBtn onClick={clearRange} title="Clear I/O markers">Clear I/O</TlBtn>
        )}
        <div style={{ flex: 1 }} />
        <TlBtn onClick={() => setPxPerSec((z) => Math.max(10, z / 1.5))} title="Zoom out">−</TlBtn>
        <TlBtn onClick={fitZoom} title="Fit all clips">Fit</TlBtn>
        <TlBtn onClick={() => setPxPerSec((z) => Math.min(200, z * 1.5))} title="Zoom in">+</TlBtn>
      </div>

      {!seq ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.space.md,
            color: theme.color.textDim,
            fontSize: theme.font.size.sm
          }}
        >
          <div style={{ fontSize: 28, opacity: 0.4 }}>🎬</div>
          Import a video or drag files here to start editing.
          <div style={{ display: 'flex', gap: theme.space.sm }}>
            <TlBtn onClick={() => void runCommand('add_track', { type: 'video' })}>+ Video Track</TlBtn>
            <TlBtn onClick={() => void runCommand('add_track', { type: 'audio' })}>+ Audio Track</TlBtn>
          </div>
        </div>
      ) : (
        <div ref={laneRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {/* Ruler */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2 }}>
            <div
              style={{
                width: LABEL_WIDTH,
                background: theme.color.panel,
                borderBottom: `1px solid ${theme.color.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                padding: `0 ${theme.space.xs}px`,
                gap: 4
              }}
            >
              <TlBtn
                onClick={() => void runCommand('add_track', { type: 'video' })}
                title="Add video track"
                style={{ fontSize: 10, padding: '1px 4px' }}
              >
                +V
              </TlBtn>
              <TlBtn
                onClick={() => void runCommand('add_track', { type: 'audio' })}
                title="Add audio track"
                style={{ fontSize: 10, padding: '1px 4px' }}
              >
                +A
              </TlBtn>
            </div>
            <div
              onPointerDown={onRulerPointerDown}
              onPointerMove={onRulerPointerMove}
              style={{
                position: 'relative',
                height: 22,
                flex: 1,
                background: theme.color.panelAlt,
                borderBottom: `1px solid ${theme.color.border}`,
                cursor: 'text'
              }}
            >
              {Array.from({ length: 120 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: i * pxPerSec,
                    fontSize: 9,
                    color: theme.color.textDim,
                    paddingLeft: 3,
                    borderLeft: `1px solid ${theme.color.border}`,
                    height: 22
                  }}
                >
                  {i}s
                </div>
              ))}
              {rangeIn !== null && rangeOut !== null && rangeOut > rangeIn && (
                <div
                  style={{
                    position: 'absolute',
                    left: rangeIn * pxPerSec,
                    width: (rangeOut - rangeIn) * pxPerSec,
                    top: 0,
                    bottom: 0,
                    background: 'rgba(255,80,80,0.18)',
                    pointerEvents: 'none'
                  }}
                />
              )}
              {rangeIn !== null && (
                <RangeMarker x={rangeIn * pxPerSec} color="#4caf50" />
              )}
              {rangeOut !== null && (
                <RangeMarker x={rangeOut * pxPerSec} color={theme.color.danger} />
              )}
            </div>
          </div>

          {/* Tracks */}
          {seq.tracks.map((track, idx) => {
            const isVideoTrack = track.type === 'video'
            const trackColor = isVideoTrack ? '#3a4a8c' : '#2a6a4a'
            return (
              <div key={track.id} style={{ display: 'flex', height: TRACK_HEIGHT, position: 'relative' }}>
                {/* Track insert indicator */}
              {trackDrag && trackDrag.targetIndex === idx && trackDrag.origIndex !== idx && (
                <div
                  style={{
                    height: 2,
                    background: theme.color.accent,
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: trackDrag.targetIndex < trackDrag.origIndex ? 0 : undefined,
                    bottom: trackDrag.targetIndex > trackDrag.origIndex ? 0 : undefined,
                    zIndex: 5,
                    pointerEvents: 'none'
                  }}
                />
              )}

              {/* Track header */}
                <div
                  onContextMenu={(e) => openTrackCtx(e, track)}
                  style={{
                    width: LABEL_WIDTH,
                    borderRight: `1px solid ${theme.color.border}`,
                    borderBottom: `1px solid ${theme.color.border}`,
                    background: trackDrag?.trackId === track.id
                      ? theme.color.panelAlt
                      : theme.color.panel,
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 0,
                    gap: 0,
                    overflow: 'hidden',
                    opacity: trackDrag?.trackId === track.id ? 0.6 : 1
                  }}
                >
                  {/* Drag grip */}
                  <div
                    onMouseDown={(e) => onTrackGripDown(e, track.id, idx)}
                    style={{
                      width: 12,
                      alignSelf: 'stretch',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'grab',
                      color: theme.color.border,
                      fontSize: 10,
                      flexShrink: 0,
                      userSelect: 'none'
                    }}
                    title="Drag to reorder track"
                  >
                    ⠿
                  </div>
                  {/* Colored track type strip */}
                  <div
                    style={{
                      width: 3,
                      alignSelf: 'stretch',
                      background: track.muted ? theme.color.border : trackColor,
                      flexShrink: 0
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      padding: `0 ${theme.space.xs}px`,
                      gap: 4,
                      minWidth: 0
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{isVideoTrack ? '🎬' : '🔊'}</span>
                    <span
                      style={{
                        fontSize: theme.font.size.sm,
                        color: track.muted ? theme.color.textDim : theme.color.text,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textDecoration: track.muted ? 'line-through' : 'none'
                      }}
                    >
                      {track.name}
                    </span>
                    <button
                      onClick={() => toggleMute(track)}
                      title={track.muted ? 'Unmute' : 'Mute'}
                      style={{
                        fontSize: 11,
                        padding: '1px 4px',
                        background: track.muted ? theme.color.danger + '33' : 'transparent',
                        border: `1px solid ${track.muted ? theme.color.danger : theme.color.border}`,
                        color: track.muted ? theme.color.danger : theme.color.textDim,
                        borderRadius: 3,
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      M
                    </button>
                  </div>
                </div>

                {/* Clip lane */}
                <div
                  onContextMenu={(e) => {
                    // Only open lane context if not on a clip (clips stop propagation)
                    openLaneCtx(e)
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('application/x-media-id')) e.preventDefault()
                  }}
                  onDrop={(e) => onLaneDrop(e, track)}
                  style={{
                    position: 'relative',
                    flex: 1,
                    background: track.muted ? theme.color.track + '88' : theme.color.track,
                    borderBottom: `1px solid ${theme.color.border}`
                  }}
                >
                  {track.clips.map((clip) => {
                    const live = drag?.clipId === clip.id ? drag : null
                    const start = live ? live.start : clip.start
                    const dur = live
                      ? live.outPoint - live.inPoint
                      : clipDuration(clip)
                    const media = mediaById.get(clip.mediaId)
                    const selected = selectedClipId === clip.id
                    const title = isTitle(clip)
                    const linked = !!clip.linkedClipId
                    const widthPx = Math.max(2, dur * pxPerSec)

                    const bg = title
                      ? 'linear-gradient(135deg,#5a4a8c,#8c5a7a)'
                      : isVideoTrack
                        ? linked
                          ? 'linear-gradient(180deg,#3a5a9c,#3a4a8c)'
                          : theme.color.clip
                        : linked
                          ? 'linear-gradient(180deg,#2a7a5a,#2a6a4a)'
                          : theme.color.clipAudio

                    return (
                      <div
                        key={clip.id}
                        onPointerDown={(e) => onClipPointerDown(e, clip, track.id)}
                        onContextMenu={(e) => openClipCtx(e, clip, track)}
                        title={title ? clip.title?.text : media?.name}
                        style={{
                          position: 'absolute',
                          left: start * pxPerSec,
                          width: widthPx,
                          top: 5,
                          bottom: 5,
                          background: bg,
                          border: `2px solid ${selected ? theme.color.accent : linked ? 'rgba(108,200,180,0.3)' : 'transparent'}`,
                          borderRadius: theme.radius.sm,
                          overflow: 'hidden',
                          fontSize: theme.font.size.sm,
                          whiteSpace: 'nowrap',
                          color: '#fff',
                          cursor:
                            toolMode === 'cut'
                              ? 'crosshair'
                              : toolMode === 'trim'
                                ? 'ew-resize'
                                : 'grab',
                          userSelect: 'none',
                          boxShadow: selected ? `0 0 0 1px ${theme.color.accent}` : 'none',
                          opacity: track.muted ? 0.45 : 1
                        }}
                      >
                        {!title && isVideoTrack && media && (
                          <Filmstrip
                            strip={strips[clip.mediaId]}
                            mediaDuration={media.duration}
                            inPoint={clip.inPoint}
                            dur={dur}
                            widthPx={widthPx}
                            pxPerSec={pxPerSec}
                          />
                        )}
                        {clip.fadeIn > 0 && <FadeTri side="left" w={clip.fadeIn * pxPerSec} />}
                        {clip.fadeOut > 0 && <FadeTri side="right" w={clip.fadeOut * pxPerSec} />}
                        {clip.transition && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 2,
                              top: 2,
                              fontSize: 9,
                              background: 'rgba(0,0,0,0.45)',
                              borderRadius: 3,
                              padding: '0 3px'
                            }}
                          >
                            ⤫
                          </div>
                        )}
                        {/* Linked indicator */}
                        {linked && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 4,
                              top: 3,
                              fontSize: 9,
                              opacity: 0.7
                            }}
                          >
                            🔗
                          </div>
                        )}
                        {/* Ripple indicator while dragging */}
                        {live?.ripple && live.moved && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: 0,
                              right: 0,
                              border: `2px solid #ffaa33`,
                              borderRadius: theme.radius.sm,
                              pointerEvents: 'none'
                            }}
                          />
                        )}
                        <span
                          style={{
                            position: 'relative',
                            display: 'inline-block',
                            padding: '3px 8px',
                            textShadow: '0 1px 2px rgba(0,0,0,0.7)'
                          }}
                        >
                          {title ? `T  ${clip.title?.text ?? ''}` : media?.name ?? 'clip'}
                        </span>
                        <Edge side="left" />
                        <Edge side="right" />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Playhead */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: LABEL_WIDTH + playhead * pxPerSec,
              width: 2,
              background: theme.color.danger,
              pointerEvents: 'none',
              zIndex: 3
            }}
          />
        </div>
      )}

      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={closeCtx} />}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolBtn({
  label,
  shortcut,
  mode,
  current,
  onSelect
}: {
  label: string
  shortcut: string
  mode: ToolMode
  current: ToolMode
  onSelect: (m: ToolMode) => void
}): JSX.Element {
  const active = mode === current
  return (
    <button
      onClick={() => onSelect(mode)}
      style={{
        fontWeight: active ? 600 : 400,
        background: active ? theme.color.accentDim : 'transparent',
        borderColor: active ? theme.color.accent : theme.color.border,
        color: active ? '#fff' : theme.color.textDim,
        fontSize: theme.font.size.sm,
        padding: '2px 8px'
      }}
      title={`${label} tool (${shortcut})`}
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>{shortcut}</span>
    </button>
  )
}

function TlBtn({
  children,
  disabled,
  onClick,
  title,
  style
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
  title?: string
  style?: React.CSSProperties
}): JSX.Element {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{ fontSize: theme.font.size.sm, padding: '2px 7px', ...style }}
    >
      {children}
    </button>
  )
}

function Edge({ side }: { side: 'left' | 'right' }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side]: 0,
        width: EDGE_PX,
        cursor: 'ew-resize'
      }}
    />
  )
}

function RangeMarker({ x, color }: { x: number; color: string }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        bottom: 0,
        width: 2,
        background: color,
        pointerEvents: 'none'
      }}
    />
  )
}

function Filmstrip({
  strip,
  mediaDuration,
  inPoint,
  dur,
  widthPx,
  pxPerSec
}: {
  strip?: string[]
  mediaDuration: number
  inPoint: number
  dur: number
  widthPx: number
  pxPerSec: number
}): JSX.Element | null {
  if (!strip || strip.length === 0 || mediaDuration <= 0) return null
  const thumbW = 48
  const out = strip.map((src, i) => {
    if (!src) return null
    const sourceTime = (mediaDuration * (i + 0.5)) / strip.length
    if (sourceTime < inPoint || sourceTime > inPoint + dur) return null
    const left = (sourceTime - inPoint) * pxPerSec - thumbW / 2
    if (left > widthPx) return null
    return (
      <img
        key={i}
        src={src}
        draggable={false}
        style={{
          position: 'absolute',
          left: Math.max(0, left),
          top: 0,
          bottom: 0,
          width: thumbW,
          height: '100%',
          objectFit: 'cover',
          opacity: 0.75,
          pointerEvents: 'none'
        }}
      />
    )
  })
  return <>{out}</>
}

function FadeTri({ side, w }: { side: 'left' | 'right'; w: number }): JSX.Element {
  const clip = side === 'left' ? 'polygon(0 100%, 100% 0, 0 0)' : 'polygon(100% 100%, 0 0, 100% 0)'
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side]: 0,
        width: Math.min(w, 200),
        background: 'rgba(0,0,0,0.55)',
        clipPath: clip,
        pointerEvents: 'none'
      }}
    />
  )
}
