import { useState } from 'react'
import { theme } from '../../app/theme'
import { runCommand } from '../../commands'

const RATIO_OPTIONS = [
  { label: '16:9', desc: 'Landscape · YouTube · TV',      w: 1920, h: 1080 },
  { label: '9:16', desc: 'Portrait · Reels · TikTok',     w: 1080, h: 1920 },
  { label: '1:1',  desc: 'Square · Instagram',             w: 1080, h: 1080 },
  { label: '4:3',  desc: 'Classic · Presentation',         w: 1440, h: 1080 },
  { label: '21:9', desc: 'Cinematic · Ultrawide',          w: 2560, h: 1080 },
] as const

type RatioOption = (typeof RATIO_OPTIONS)[number]

const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30, 60] as const

const VIZ_MAX = 80
function vizSize(w: number, h: number): { vw: number; vh: number } {
  const a = w / h
  return a >= 1
    ? { vw: VIZ_MAX, vh: Math.round(VIZ_MAX / a) }
    : { vw: Math.round(VIZ_MAX * a), vh: VIZ_MAX }
}

export function NewProjectDialog({
  onDone,
  canClose = false
}: {
  onDone: () => void
  canClose?: boolean
}): JSX.Element {
  const [ratio, setRatio] = useState<RatioOption>(RATIO_OPTIONS[0])
  const [fps, setFps] = useState<number>(30)
  const [busy, setBusy] = useState(false)

  async function create(): Promise<void> {
    setBusy(true)
    await runCommand('create_sequence', { name: 'My Movie', width: ratio.w, height: ratio.h, fps })
    await runCommand('add_track', { type: 'video', name: 'Video 1' })
    await runCommand('add_track', { type: 'audio', name: 'Audio 1' })
    setBusy(false)
    onDone()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div
        style={{
          background: theme.color.panel,
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.md,
          padding: theme.space.xl,
          width: 600,
          maxWidth: 'calc(100vw - 40px)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.7)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space.lg }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>New project</h2>
            <p style={{ margin: `${theme.space.xs}px 0 0`, fontSize: theme.font.size.sm, color: theme.color.textDim }}>
              Choose aspect ratio and frame rate — you can change these later.
            </p>
          </div>
          {canClose && (
            <button
              onClick={onDone}
              style={{ fontSize: 18, background: 'none', border: 'none', color: theme.color.textDim, cursor: 'pointer', padding: 4 }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Ratio cards */}
        <p style={{ margin: `0 0 ${theme.space.sm}px`, fontSize: theme.font.size.sm, color: theme.color.textDim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Aspect ratio
        </p>
        <div style={{ display: 'flex', gap: theme.space.sm, marginBottom: theme.space.lg }}>
          {RATIO_OPTIONS.map((opt) => {
            const active = ratio.label === opt.label
            const { vw, vh } = vizSize(opt.w, opt.h)
            return (
              <button
                key={opt.label}
                onClick={() => setRatio(opt)}
                style={{
                  flex: '1 1 0',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 8, padding: `${theme.space.md}px ${theme.space.xs}px`,
                  background: active ? theme.color.accentDim : theme.color.panelAlt,
                  border: `2px solid ${active ? theme.color.accent : theme.color.border}`,
                  borderRadius: theme.radius.md,
                  cursor: 'pointer', color: 'inherit',
                  transition: 'border-color 0.1s, background 0.1s'
                }}
              >
                {/* Visual ratio shape */}
                <div style={{
                  width: vw, height: vh,
                  background: active ? theme.color.accent : theme.color.border,
                  borderRadius: 3, flexShrink: 0
                }} />
                <strong style={{ fontSize: 13 }}>{opt.label}</strong>
                <span style={{ fontSize: 10, color: theme.color.textDim, textAlign: 'center', lineHeight: 1.4 }}>
                  {opt.desc}
                </span>
                <span style={{ fontSize: 10, color: theme.color.textDim }}>
                  {opt.w}×{opt.h}
                </span>
              </button>
            )
          })}
        </div>

        {/* FPS */}
        <p style={{ margin: `0 0 ${theme.space.sm}px`, fontSize: theme.font.size.sm, color: theme.color.textDim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Frame rate
        </p>
        <div style={{ display: 'flex', gap: theme.space.xs, marginBottom: theme.space.xl }}>
          {FPS_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setFps(f)}
              style={{
                flex: '1 1 0', padding: '7px 4px', fontSize: 12,
                background: fps === f ? theme.color.accentDim : theme.color.panelAlt,
                border: `1px solid ${fps === f ? theme.color.accent : theme.color.border}`,
                borderRadius: theme.radius.sm, cursor: 'pointer',
                color: fps === f ? '#fff' : theme.color.textDim,
                transition: 'border-color 0.1s, background 0.1s'
              }}
            >
              {f} fps
            </button>
          ))}
        </div>

        {/* Create button */}
        <button
          onClick={() => void create()}
          disabled={busy}
          style={{
            width: '100%', padding: '11px 0', fontSize: 15, fontWeight: 600,
            background: theme.color.accentDim, borderColor: theme.color.accent,
            color: '#fff', borderRadius: theme.radius.md,
            cursor: busy ? 'wait' : 'pointer',
            letterSpacing: 0.3
          }}
        >
          {busy ? 'Creating…' : `Create project  —  ${ratio.w}×${ratio.h} · ${fps} fps`}
        </button>
      </div>
    </div>
  )
}
