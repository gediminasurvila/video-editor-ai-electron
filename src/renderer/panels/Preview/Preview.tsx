import { useEffect, useRef, useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { sequenceDuration } from '@shared/schema'
import { Engine } from '../../engine/Engine'

/**
 * Preview surface. Decodes media with WebCodecs and composites the active frame
 * with the WebGL engine; the master playback clock advances the playhead and the
 * engine re-renders on every playhead/project change.
 */
export function Preview(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const [, forceRedraw] = useState(0)
  const [playing, setPlaying] = useState(false)

  const project = useEditor((s) => s.project)
  const playhead = useEditor((s) => s.playhead)
  const setPlayhead = useEditor((s) => s.setPlayhead)
  const seq = activeSequence(project)
  const duration = seq ? sequenceDuration(seq) : 0

  // Create the engine once the canvas exists.
  useEffect(() => {
    if (!canvasRef.current) return
    try {
      engineRef.current = new Engine(canvasRef.current, () => forceRedraw((n) => n + 1))
    } catch (err) {
      console.error('Engine init failed:', err)
    }
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])

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
          <span style={{ color: theme.color.textDim }}>No active sequence</span>
        )}
      </div>
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: theme.space.md,
          padding: `0 ${theme.space.md}px`,
          borderTop: `1px solid ${theme.color.border}`
        }}
      >
        <button onClick={() => setPlayhead(0)}>⏮</button>
        <button onClick={() => setPlaying((p) => !p)}>{playing ? '⏸' : '▶'}</button>
        <span style={{ fontFamily: theme.font.mono, fontSize: theme.font.size.sm }}>
          {playhead.toFixed(2)}s / {duration.toFixed(2)}s
        </span>
      </div>
    </div>
  )
}
