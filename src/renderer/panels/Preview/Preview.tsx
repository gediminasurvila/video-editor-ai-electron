import { useEffect, useRef, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { clipDuration, sequenceDuration, resolveTransform, containFit, type Clip, type MediaItem, type Sequence, type Transform } from '@shared/schema'
import { importViaDialog } from '../../actions/quickActions'
import { runCommand } from '../../commands'
import { Engine } from '../../engine/Engine'
import { AudioEngine } from '../../engine/AudioEngine'

export function Preview(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewAreaRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const audioRef = useRef<AudioEngine | null>(null)
  const [, forceRedraw] = useState(0)
  const [areaCss, setAreaCss] = useState({ w: 0, h: 0 })

  const project = useEditor((s) => s.project)
  const playhead = useEditor((s) => s.playhead)
  const setPlayhead = useEditor((s) => s.setPlayhead)
  const playing = useEditor((s) => s.playing)
  const setPlaying = useEditor((s) => s.setPlaying)
  const select = useEditor((s) => s.select)
  const selectedClipId = useEditor((s) => s.selectedClipId)
  const seq = activeSequence(project)
  const selectedClip = seq?.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId) ?? null
  const selectedMedia = selectedClip?.kind === 'media'
    ? project.mediaPool.find((m) => m.id === selectedClip.mediaId)
    : undefined
  const duration = seq ? sequenceDuration(seq) : 0

  // Create engines once the canvas exists.
  useEffect(() => {
    if (!canvasRef.current) return
    try {
      engineRef.current = new Engine(canvasRef.current, () => forceRedraw((n) => n + 1))
    } catch (err) {
      console.error('Engine init failed:', err)
    }
    audioRef.current = new AudioEngine(() => forceRedraw((n) => n + 1))
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
      audioRef.current?.dispose()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    const el = previewAreaRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setAreaCss({ w: el.clientWidth, h: el.clientHeight }))
    obs.observe(el)
    setAreaCss({ w: el.clientWidth, h: el.clientHeight })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    for (const m of project.mediaPool) audioRef.current?.prefetch(m)
  }, [project.mediaPool])

  useEffect(() => {
    if (playing && seq) void audioRef.current?.play(seq, project.mediaPool, playhead)
    else audioRef.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  useEffect(() => {
    if (seq) engineRef.current?.render(project, seq, playhead)
  }, [project, seq, playhead])

  // Master playback clock — resets to 0 when sequence ends.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = (now - last) / 1000
      last = now
      const next = useEditor.getState().playhead + dt
      if (next >= duration) {
        setPlayhead(0)
        setPlaying(false)
        return
      }
      setPlayhead(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration, setPlayhead, setPlaying])

  // Double-click canvas → select the topmost video clip at the playhead.
  function selectClipAtPlayhead(): void {
    if (!seq) return
    for (let i = seq.tracks.length - 1; i >= 0; i--) {
      const track = seq.tracks[i]
      if (track.type !== 'video') continue
      for (const clip of track.clips) {
        if (playhead >= clip.start && playhead < clip.start + clipDuration(clip)) {
          select(clip.id)
          return
        }
      }
    }
  }

  // Compute canvas CSS size to fit within the preview area (letterbox/pillarbox).
  const canvasCss = (() => {
    if (!seq || areaCss.w === 0) return null
    const pad = theme.space.lg * 2
    const availW = Math.max(1, areaCss.w - pad)
    const availH = Math.max(1, areaCss.h - pad)
    const scale = Math.min(availW / seq.width, availH / seq.height)
    return { width: Math.floor(seq.width * scale), height: Math.floor(seq.height * scale) }
  })()

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: theme.color.bg,
        minHeight: 0
      }}
    >
      <div
        ref={previewAreaRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        {seq ? (
          <div style={{ position: 'relative', lineHeight: 0, flexShrink: 0 }}>
            <canvas
              ref={canvasRef}
              onDoubleClick={selectClipAtPlayhead}
              title="Double-click to select clip at playhead"
              style={{
                display: 'block',
                width: canvasCss ? canvasCss.width : seq.width,
                height: canvasCss ? canvasCss.height : seq.height,
                background: '#000',
                border: `1px solid ${theme.color.border}`,
                cursor: 'default'
              }}
            />
            {selectedClip && (
              <ClipOverlay
                clip={selectedClip}
                seq={seq}
                media={selectedMedia}
                playhead={playhead}
              />
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: theme.color.textDim }}>
            <div style={{ fontSize: 40, marginBottom: theme.space.md }}>🎬</div>
            <p style={{ margin: 0, fontSize: theme.font.size.lg, color: theme.color.text }}>
              Start your movie
            </p>
            <p style={{ margin: `${theme.space.sm}px 0 ${theme.space.md}px` }}>
              Import a video and it appears here, ready to edit.
            </p>
            <button onClick={importViaDialog} style={{ padding: '8px 18px' }}>
              + Import media
            </button>
          </div>
        )}
      </div>
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          gap: theme.space.md,
          padding: `0 ${theme.space.md}px`,
          borderTop: `1px solid ${theme.color.border}`,
          flexShrink: 0
        }}
      >
        <button onClick={() => setPlayhead(0)} title="Go to start (Home)">⏮</button>
        <button
          onClick={() => setPlaying(!playing)}
          title="Play / pause (Space)"
          disabled={!seq}
          style={{ minWidth: 70 }}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <span style={{ fontFamily: theme.font.mono, fontSize: theme.font.size.sm }}>
          {fmtTime(playhead)} / {fmtTime(duration)}
        </span>
        {seq && (
          <span
            style={{ fontSize: theme.font.size.sm, color: theme.color.textDim, marginLeft: 'auto' }}
            title={`${seq.width}×${seq.height} @ ${seq.fps}fps`}
          >
            {seq.width}×{seq.height}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Canvas clip overlay: bounding box + drag to move/scale ───────────────────

interface OverlayProps {
  clip: Clip
  seq: Sequence
  media: MediaItem | undefined
  playhead: number
}

function ClipOverlay({ clip, seq, media, playhead }: OverlayProps): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [cssSize, setCssSize] = useState({ w: 0, h: 0 })
  const [dragLive, setDragLive] = useState<Partial<Transform> | null>(null)
  const dragRef = useRef<{
    mode: 'move' | 'scale'
    startX: number
    startY: number
    origT: Transform
    origDist: number
    cx: number
    cy: number
  } | null>(null)

  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setCssSize({ w: el.clientWidth, h: el.clientHeight }))
    obs.observe(el)
    setCssSize({ w: el.clientWidth, h: el.clientHeight })
    return () => obs.disconnect()
  }, [])

  const baseT = resolveTransform(clip, playhead)
  const t: Transform = dragLive ? { ...baseT, ...dragLive } : baseT

  const mw = media?.width ?? seq.width
  const mh = media?.height ?? seq.height
  const { drawW, drawH } = containFit(mw, mh, seq.width, seq.height)

  const cssX = cssSize.w / seq.width
  const cssY = cssSize.h / seq.height
  const scaledW = drawW * t.scale * cssX
  const scaledH = drawH * t.scale * cssY
  const cx = cssSize.w / 2 + t.x * cssX
  const cy = cssSize.h / 2 - t.y * cssY
  const bL = cx - scaledW / 2
  const bT = cy - scaledH / 2

  function commitTransform(patch: Partial<Transform>): void {
    if (clip.keyframes.length > 0) {
      const local = Math.round(Math.max(0, playhead - clip.start) * 1000) / 1000
      const full = resolveTransform(clip, playhead)
      void runCommand('set_keyframe', {
        clipId: clip.id, time: local,
        x: patch.x ?? full.x, y: patch.y ?? full.y,
        scale: patch.scale ?? full.scale,
        rotation: full.rotation, opacity: full.opacity
      })
    } else {
      void runCommand('set_property', { clipId: clip.id, transform: patch })
    }
  }

  function startDrag(
    e: React.PointerEvent,
    mode: 'move' | 'scale'
  ): void {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const origT = resolveTransform(clip, playhead)
    const origDist = mode === 'scale'
      ? Math.sqrt((e.clientX - (overlayRef.current!.getBoundingClientRect().left + cx)) ** 2 +
                  (e.clientY - (overlayRef.current!.getBoundingClientRect().top  + cy)) ** 2) || 1
      : 1
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, origT, origDist, cx, cy }
  }

  function onDragMove(e: React.PointerEvent): void {
    const d = dragRef.current
    if (!d || e.buttons === 0) return
    if (d.mode === 'move') {
      const dx = (e.clientX - d.startX) / cssX
      const dy = -(e.clientY - d.startY) / cssY
      setDragLive({ x: d.origT.x + dx, y: d.origT.y + dy })
    } else {
      const rect = overlayRef.current!.getBoundingClientRect()
      const ddx = e.clientX - (rect.left + d.cx)
      const ddy = e.clientY - (rect.top  + d.cy)
      const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1
      setDragLive({ scale: Math.max(0.05, d.origT.scale * (dist / d.origDist)) })
    }
  }

  function onDragEnd(e: React.PointerEvent): void {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    if (d.mode === 'move') {
      const dx = (e.clientX - d.startX) / cssX
      const dy = -(e.clientY - d.startY) / cssY
      commitTransform({ x: d.origT.x + dx, y: d.origT.y + dy })
    } else {
      const rect = overlayRef.current!.getBoundingClientRect()
      const ddx = e.clientX - (rect.left + d.cx)
      const ddy = e.clientY - (rect.top  + d.cy)
      const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1
      commitTransform({ scale: Math.max(0.05, d.origT.scale * (dist / d.origDist)) })
    }
    setDragLive(null)
  }

  const HANDLE = 8
  const corners = [
    { top: bT - HANDLE / 2, left: bL - HANDLE / 2, cursor: 'nwse-resize' },
    { top: bT - HANDLE / 2, left: bL + scaledW - HANDLE / 2, cursor: 'nesw-resize' },
    { top: bT + scaledH - HANDLE / 2, left: bL + scaledW - HANDLE / 2, cursor: 'nwse-resize' },
    { top: bT + scaledH - HANDLE / 2, left: bL - HANDLE / 2, cursor: 'nesw-resize' }
  ]

  return (
    <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {cssSize.w > 0 && (
        <>
          {/* Bounding box — drag to move */}
          <div
            onPointerDown={(e) => startDrag(e, 'move')}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            style={{
              position: 'absolute',
              left: bL, top: bT,
              width: scaledW, height: scaledH,
              border: `1px dashed ${theme.color.accent}`,
              boxSizing: 'border-box',
              cursor: 'move',
              pointerEvents: 'auto'
            }}
          />
          {/* Corner handles — drag to scale */}
          {corners.map((pos, i) => (
            <div
              key={i}
              onPointerDown={(e) => startDrag(e, 'scale')}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              style={{
                position: 'absolute',
                top: pos.top, left: pos.left,
                width: HANDLE, height: HANDLE,
                background: '#fff',
                border: `1.5px solid ${theme.color.accent}`,
                borderRadius: 2,
                cursor: pos.cursor,
                pointerEvents: 'auto'
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.floor((s % 1) * 100)
  return `${m}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
}
