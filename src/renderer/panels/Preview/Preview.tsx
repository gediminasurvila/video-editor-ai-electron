import { useEffect, useRef, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { sequenceDuration } from '@shared/schema'
import { importViaDialog } from '../../actions/quickActions'
import { Engine } from '../../engine/Engine'
import { AudioEngine } from '../../engine/AudioEngine'

/**
 * Preview surface. Decodes media with WebCodecs and composites the active frame
 * with the WebGL engine; a Web Audio engine plays clip audio in sync. The master
 * playback clock advances the playhead and the engine re-renders on change.
 */
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
  const seq = activeSequence(project)
  const duration = seq ? sequenceDuration(seq) : 0

  // Create the engines once the canvas exists.
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

  // Decode audio for imported media so playback starts cleanly.
  useEffect(() => {
    for (const m of project.mediaPool) audioRef.current?.prefetch(m)
  }, [project.mediaPool])

  // Drive audio playback from the play/pause state.
  useEffect(() => {
    if (playing && seq) void audioRef.current?.play(seq, project.mediaPool, playhead)
    else audioRef.current?.stop()
    // Re-sync only when play toggles (scrubbing mid-play is rare in a simple editor).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  // Render the current frame whenever time, project, or sequence changes.
  useEffect(() => {
    if (seq) engineRef.current?.render(project, seq, playhead)
  }, [project, seq, playhead])

  // Master playback clock.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = (now - last) / 1000
      last = now
      const next = useEditor.getState().playhead + dt
      if (next >= duration) {
        setPlayhead(duration)
        setPlaying(false)
        return
      }
      setPlayhead(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration, setPlayhead])

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
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              aspectRatio: `${seq.width} / ${seq.height}`,
              background: '#000',
              border: `1px solid ${theme.color.border}`
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
          borderTop: `1px solid ${theme.color.border}`
        }}
      >
        <button onClick={() => setPlayhead(0)} title="Go to start (Home)">
          ⏮
        </button>
        <button onClick={() => setPlaying(!playing)} title="Play / pause (Space)" disabled={!seq}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <span style={{ fontFamily: theme.font.mono, fontSize: theme.font.size.sm }}>
          {fmtTime(playhead)} / {fmtTime(duration)}
        </span>
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
