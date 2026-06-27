import { useEffect, useRef, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { useThumbnails } from '../../state/thumbnails'
import { runCommand } from '../../commands'
import { addMediaToTimeline } from '../../actions/quickActions'
import { snapTime } from '../../timeline/snap'
import { clipDuration, isTitle, type Clip } from '@shared/schema'

const TRACK_HEIGHT = 60
const LABEL_WIDTH = 96
const EDGE_PX = 8 // hit zone for edge-trimming
const MIN_DUR = 0.1 // seconds
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
  // live preview values while dragging
  start: number
  inPoint: number
  outPoint: number
  moved: boolean
}

export function Timeline(): JSX.Element {
  const project = useEditor((s) => s.project)
  const playhead = useEditor((s) => s.playhead)
  const setPlayhead = useEditor((s) => s.setPlayhead)
  const selectedClipId = useEditor((s) => s.selectedClipId)
  const select = useEditor((s) => s.select)
  const seq = activeSequence(project)

  const [pxPerSec, setPxPerSec] = useState(50)
  const [drag, setDrag] = useState<Drag | null>(null)
  const laneRef = useRef<HTMLDivElement>(null)
  const strips = useThumbnails((s) => s.strips)
  const ensureThumbs = useThumbnails((s) => s.ensure)

  // ----- helpers -----
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

  // ----- scrubbing the playhead -----
  function onRulerPointerDown(e: React.PointerEvent): void {
    e.currentTarget.setPointerCapture(e.pointerId)
    setPlayhead(timeAtClientX(e.clientX))
  }
  function onRulerPointerMove(e: React.PointerEvent): void {
    if (e.buttons === 1) setPlayhead(timeAtClientX(e.clientX))
  }

  // ----- clip drag (move / trim) -----
  function onClipPointerDown(e: React.PointerEvent, clip: Clip, trackId: string): void {
    e.stopPropagation()
    select(clip.id)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const width = rect.width
    let mode: DragMode = 'move'
    if (offsetX <= EDGE_PX) mode = 'trim-left'
    else if (offsetX >= width - EDGE_PX) mode = 'trim-right'

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
      moved: false
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
          start = Math.max(0, start)
          return { ...d, start, moved: true }
        }
        if (d.mode === 'trim-left') {
          let start = snapTime(d.origStart + deltaSec, points, SNAP_PX / pxPerSec)
          let inPoint = d.origIn + (start - d.origStart)
          if (inPoint < 0) {
            start -= inPoint
            inPoint = 0
          }
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
        if (d && d.moved) {
          useEditor.getState().commit((p) => {
            const sequence = p.sequences.find((s) => s.id === p.activeSequenceId)
            for (const t of sequence?.tracks ?? []) {
              const c = t.clips.find((x) => x.id === d.clipId)
              if (c) {
                c.start = d.start
                c.inPoint = d.inPoint
                c.outPoint = d.outPoint
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

  // ----- drop media from the bin -----
  function onLaneDrop(e: React.DragEvent): void {
    const mediaId = e.dataTransfer.getData('application/x-media-id')
    if (!mediaId) return
    e.preventDefault()
    addMediaToTimeline(mediaId, timeAtClientX(e.clientX))
  }

  function fitZoom(): void {
    const lane = laneRef.current
    const dur = seq
      ? Math.max(
          5,
          ...seq.tracks.flatMap((t) => t.clips.map((c) => c.start + clipDuration(c)))
        )
      : 10
    const width = (lane?.clientWidth ?? 800) - 24
    setPxPerSec(Math.min(200, Math.max(10, width / dur)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.color.panel }}>
      <div
        style={{
          height: 34,
          display: 'flex',
          alignItems: 'center',
          gap: theme.space.sm,
          padding: `0 ${theme.space.sm}px`,
          borderBottom: `1px solid ${theme.color.border}`
        }}
      >
        <strong style={{ fontSize: theme.font.size.sm }}>Timeline</strong>
        <button
          disabled={!seq}
          onClick={() => runCommand('add_title', { text: 'Title', start: playhead, duration: 3 })}
          title="Add a text/title clip at the playhead"
        >
          T Title
        </button>
        <button
          disabled={!selectedClipId}
          onClick={() =>
            selectedClipId && runCommand('split_clip', { clipId: selectedClipId, at: playhead })
          }
          title="Split the selected clip at the playhead (S)"
        >
          ✂ Split
        </button>
        <button
          disabled={!selectedClipId}
          onClick={() => selectedClipId && runCommand('delete_clip', { clipId: selectedClipId })}
          title="Delete the selected clip (Delete)"
        >
          🗑 Delete
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setPxPerSec((z) => Math.max(10, z / 1.5))} title="Zoom out">
          −
        </button>
        <button onClick={fitZoom} title="Fit timeline">
          Fit
        </button>
        <button onClick={() => setPxPerSec((z) => Math.min(200, z * 1.5))} title="Zoom in">
          +
        </button>
      </div>

      {!seq ? (
        <div style={{ padding: theme.space.lg, color: theme.color.textDim, fontSize: theme.font.size.sm }}>
          Import a video to start editing.
        </div>
      ) : (
        <div ref={laneRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {/* Ruler */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2 }}>
            <div style={{ width: LABEL_WIDTH, background: theme.color.panel }} />
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
                  left: 0,
                  zIndex: 1
                }}
              >
                {track.type === 'video' ? '🎬' : '🔊'} {track.name}
              </div>
              <div
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-media-id')) e.preventDefault()
                }}
                onDrop={onLaneDrop}
                style={{
                  position: 'relative',
                  flex: 1,
                  background: theme.color.track,
                  borderBottom: `1px solid ${theme.color.border}`
                }}
              >
                {track.clips.map((clip) => {
                  const live = drag && drag.clipId === clip.id ? drag : null
                  const start = live ? live.start : clip.start
                  const dur = live ? live.outPoint - live.inPoint : clipDuration(clip)
                  const media = mediaById.get(clip.mediaId)
                  const selected = selectedClipId === clip.id
                  const title = isTitle(clip)
                  const widthPx = Math.max(2, dur * pxPerSec)
                  const bg = title
                    ? 'linear-gradient(135deg,#5a4a8c,#8c5a7a)'
                    : track.type === 'video'
                      ? theme.color.clip
                      : theme.color.clipAudio
                  return (
                    <div
                      key={clip.id}
                      onPointerDown={(e) => onClipPointerDown(e, clip, track.id)}
                      title={title ? clip.title?.text : media?.name}
                      style={{
                        position: 'absolute',
                        left: start * pxPerSec,
                        width: widthPx,
                        top: 5,
                        bottom: 5,
                        background: bg,
                        border: `2px solid ${selected ? theme.color.accent : 'transparent'}`,
                        borderRadius: theme.radius.sm,
                        overflow: 'hidden',
                        fontSize: theme.font.size.sm,
                        whiteSpace: 'nowrap',
                        color: '#fff',
                        cursor: 'grab',
                        userSelect: 'none',
                        boxShadow: selected ? `0 0 0 1px ${theme.color.accent}` : 'none'
                      }}
                    >
                      {!title && track.type === 'video' && media && (
                        <Filmstrip
                          strip={strips[clip.mediaId]}
                          mediaDuration={media.duration}
                          inPoint={clip.inPoint}
                          dur={dur}
                          widthPx={widthPx}
                          pxPerSec={pxPerSec}
                        />
                      )}
                      {/* fade ramps */}
                      {clip.fadeIn > 0 && <FadeTri side="left" w={clip.fadeIn * pxPerSec} />}
                      {clip.fadeOut > 0 && <FadeTri side="right" w={clip.fadeOut * pxPerSec} />}
                      {/* cross-dissolve badge */}
                      {clip.transition && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 2,
                            top: 2,
                            fontSize: 10,
                            background: 'rgba(0,0,0,0.45)',
                            borderRadius: 3,
                            padding: '0 3px'
                          }}
                        >
                          ⤫
                        </div>
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
          ))}

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
    </div>
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

/** Lay out the media's thumbnails across the clip's trimmed source range. */
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
          opacity: 0.85,
          pointerEvents: 'none'
        }}
      />
    )
  })
  return <>{out}</>
}

/** A translucent triangle showing a fade-in/out ramp at a clip edge. */
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
