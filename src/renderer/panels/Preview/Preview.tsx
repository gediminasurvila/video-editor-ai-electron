import { useEffect, useRef, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { clipDuration, sequenceDuration } from '@shared/schema'
import { importViaDialog } from '../../actions/quickActions'
import { Engine } from '../../engine/Engine'
import { AudioEngine } from '../../engine/AudioEngine'

export function Preview(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const audioRef = useRef<AudioEngine | null>(null)
  const [, forceRedraw] = useState(0)

  const project = useEditor((s) => s.project)
  const playhead = useEditor((s) => s.playhead)
  const setPlayhead = useEditor((s) => s.setPlayhead)
  const playing = useEditor((s) => s.playing)
  const setPlaying = useEditor((s) => s.setPlaying)
  const select = useEditor((s) => s.select)
  const seq = activeSequence(project)
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
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          padding: theme.space.lg
        }}
      >
        {seq ? (
          <canvas
            ref={canvasRef}
            onDoubleClick={selectClipAtPlayhead}
            title="Double-click to select clip at playhead"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              aspectRatio: `${seq.width} / ${seq.height}`,
              background: '#000',
              border: `1px solid ${theme.color.border}`,
              cursor: 'default'
            }}
          />
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

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.floor((s % 1) * 100)
  return `${m}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
}
