import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { runCommand } from '../../commands'
import { Header } from '../MediaPanel/MediaPanel'
import { clipDuration, isTitle, resolveTransform, containFit, fillScale, type Keyframe } from '@shared/schema'

const ASPECT_PRESETS = [
  { label: '16:9 — 1920×1080 (Full HD)', w: 1920, h: 1080 },
  { label: '16:9 — 3840×2160 (4K UHD)', w: 3840, h: 2160 },
  { label: '16:9 — 1280×720 (HD Ready)', w: 1280, h: 720 },
  { label: '9:16 — 1080×1920 (Vertical)', w: 1080, h: 1920 },
  { label: '1:1 — 1080×1080 (Square)', w: 1080, h: 1080 },
  { label: '4:3 — 1440×1080', w: 1440, h: 1080 }
]
const FPS_PRESETS = [23.976, 24, 25, 29.97, 30, 60]

export function Inspector(): JSX.Element {
  const selectedClipId = useEditor((s) => s.selectedClipId)
  const playhead = useEditor((s) => s.playhead)
  const project = useEditor((s) => s.project)
  const seq = activeSequence(project)

  const clip = seq?.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId) ?? null

  const localTime = clip ? Math.max(0, playhead - clip.start) : 0
  const KF_EPS = 0.02

  function hasPropKf(prop: keyof Omit<Keyframe, 'time'>): boolean {
    return (clip?.keyframes ?? []).some((k) => Math.abs(k.time - localTime) < KF_EPS && prop in k)
  }

  function addPropKf(prop: keyof Omit<Keyframe, 'time'>, value: number): void {
    if (!clip) return
    const t = Math.round(localTime * 1000) / 1000
    void runCommand('set_keyframe', { clipId: clip.id, time: t, [prop]: value })
  }

  function setTransform(key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', value: number): void {
    if (!clip) return
    const kfAt = clip.keyframes.find((k) => Math.abs(k.time - localTime) < KF_EPS)
    if (kfAt && key in kfAt) {
      const t = Math.round(localTime * 1000) / 1000
      void runCommand('set_keyframe', { clipId: clip.id, time: t, [key]: value })
    } else {
      void runCommand('set_property', { clipId: clip.id, transform: { [key]: value } })
    }
  }

  function fitClip(): void {
    if (!clip) return
    void runCommand('set_property', { clipId: clip.id, transform: { x: 0, y: 0, scale: 1 } })
  }

  function fillClip(): void {
    if (!clip || !seq) return
    const media = project.mediaPool.find((m) => m.id === clip.mediaId)
    if (!media || media.width === 0) return
    const scale = fillScale(media.width, media.height, seq.width, seq.height)
    void runCommand('set_property', { clipId: clip.id, transform: { x: 0, y: 0, scale } })
  }

  function applyKenBurns(type: 'zoom-in' | 'zoom-out' | 'pan-lr' | 'pan-rl'): void {
    if (!clip || !seq) return
    const media = project.mediaPool.find((m) => m.id === clip.mediaId)
    if (!media || media.width === 0) return
    const dur = clipDuration(clip)
    const fs = fillScale(media.width, media.height, seq.width, seq.height)
    const panFs = fs * 1.15
    const { drawW, drawH } = containFit(media.width, media.height, seq.width, seq.height)
    const panX = Math.max(0, (drawW * panFs - seq.width) / 2) * 0.7
    const panY = Math.max(0, (drawH * panFs - seq.height) / 2) * 0.7
    let kf0: Keyframe, kf1: Keyframe
    if (type === 'zoom-in') {
      kf0 = { time: 0, scale: fs, x: 0, y: 0, opacity: 1 }
      kf1 = { time: dur, scale: fs * 1.25, x: 0, y: 0, opacity: 1 }
    } else if (type === 'zoom-out') {
      kf0 = { time: 0, scale: fs * 1.25, x: 0, y: 0, opacity: 1 }
      kf1 = { time: dur, scale: fs, x: 0, y: 0, opacity: 1 }
    } else if (type === 'pan-lr') {
      kf0 = { time: 0, scale: panFs, x: -panX, y: 0, opacity: 1 }
      kf1 = { time: dur, scale: panFs, x: panX, y: 0, opacity: 1 }
    } else {
      kf0 = { time: 0, scale: panFs, x: panX, y: 0, opacity: 1 }
      kf1 = { time: dur, scale: panFs, x: -panX, y: 0, opacity: 1 }
    }
    useEditor.getState().commit((p) => {
      const s = p.sequences.find((sq) => sq.id === p.activeSequenceId)
      for (const t of s?.tracks ?? []) {
        const c = t.clips.find((x) => x.id === clip!.id)
        if (c) { c.keyframes = [kf0, kf1]; break }
      }
    })
  }

  function setAudio(patch: { volume?: number; fadeIn?: number; fadeOut?: number }): void {
    if (clip) void runCommand('set_audio', { clipId: clip.id, ...patch })
  }
  function setTitle(patch: { text?: string; fontSize?: number; color?: string }): void {
    if (clip) void runCommand('set_title', { clipId: clip.id, ...patch })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Properties" />
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.space.md }}>
        {!clip ? (
          <>
            <p style={{ color: theme.color.textDim, fontSize: theme.font.size.sm, marginTop: 0 }}>
              Select a clip — or configure the project below.
            </p>
            {seq && (
              <Section title="Sequence settings">
                <Row label="Resolution">
                  <select
                    value={`${seq.width}x${seq.height}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number)
                      void runCommand('set_project_settings', { width: w, height: h })
                    }}
                    style={selectStyle}
                  >
                    {ASPECT_PRESETS.map((p) => (
                      <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>
                        {p.label}
                      </option>
                    ))}
                    {!ASPECT_PRESETS.some((p) => p.w === seq.width && p.h === seq.height) && (
                      <option value={`${seq.width}x${seq.height}`}>
                        Custom — {seq.width}×{seq.height}
                      </option>
                    )}
                  </select>
                </Row>
                <Row label="Frame rate">
                  <select
                    value={seq.fps}
                    onChange={(e) => void runCommand('set_project_settings', { fps: Number(e.target.value) })}
                    style={selectStyle}
                  >
                    {FPS_PRESETS.map((f) => (
                      <option key={f} value={f}>{f} fps</option>
                    ))}
                    {!FPS_PRESETS.includes(seq.fps) && (
                      <option value={seq.fps}>{seq.fps} fps (custom)</option>
                    )}
                  </select>
                </Row>
                <Row label="Name">
                  <input
                    type="text"
                    defaultValue={project.name}
                    onBlur={(e) => void runCommand('set_project_settings', { name: e.target.value })}
                    style={{ width: 140 }}
                  />
                </Row>
              </Section>
            )}
          </>
        ) : (
          <>
            {isTitle(clip) && clip.title && (
              <Section title="Text">
                <textarea
                  value={clip.title.text}
                  onChange={(e) => setTitle({ text: e.target.value })}
                  rows={2}
                  style={{ width: '100%', marginBottom: theme.space.sm }}
                />
                <NumField
                  label="Font size"
                  value={clip.title.fontSize}
                  step={4}
                  onChange={(v) => setTitle({ fontSize: v })}
                />
                <Row label="Color">
                  <input
                    type="color"
                    value={clip.title.color}
                    onChange={(e) => setTitle({ color: e.target.value })}
                  />
                </Row>
              </Section>
            )}

            <Section title="Transform">
              <KfNumField label="Position X" value={resolveTransform(clip, playhead).x} onChange={(v) => setTransform('x', v)} hasKf={hasPropKf('x')} onKf={() => addPropKf('x', resolveTransform(clip, playhead).x)} />
              <KfNumField label="Position Y" value={resolveTransform(clip, playhead).y} onChange={(v) => setTransform('y', v)} hasKf={hasPropKf('y')} onKf={() => addPropKf('y', resolveTransform(clip, playhead).y)} />
              <KfNumField label="Scale" value={resolveTransform(clip, playhead).scale} step={0.05} onChange={(v) => setTransform('scale', v)} hasKf={hasPropKf('scale')} onKf={() => addPropKf('scale', resolveTransform(clip, playhead).scale)} />
              <KfNumField label="Rotation" value={resolveTransform(clip, playhead).rotation} onChange={(v) => setTransform('rotation', v)} hasKf={hasPropKf('rotation')} onKf={() => addPropKf('rotation', resolveTransform(clip, playhead).rotation)} />
              <KfNumField label="Opacity" value={resolveTransform(clip, playhead).opacity} step={0.05} min={0} max={1} onChange={(v) => setTransform('opacity', v)} hasKf={hasPropKf('opacity')} onKf={() => addPropKf('opacity', resolveTransform(clip, playhead).opacity)} />
              {clip.kind === 'media' && (
                <div style={{ display: 'flex', gap: theme.space.xs, marginTop: theme.space.xs }}>
                  <button onClick={fitClip} style={{ flex: 1, fontSize: 11 }} title="Contain: scale=1, centered">Fit</button>
                  <button onClick={fillClip} style={{ flex: 1, fontSize: 11 }} title="Cover: zoom to fill frame with no bars">Fill</button>
                </div>
              )}
            </Section>

            {clip.kind === 'media' && !isTitle(clip) && (
              <Section title="Motion presets">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.space.xs }}>
                  {([
                    ['zoom-in',  'Zoom In'],
                    ['zoom-out', 'Zoom Out'],
                    ['pan-lr',   '← Pan →'],
                    ['pan-rl',   '→ Pan ←']
                  ] as const).map(([type, label]) => (
                    <button
                      key={type}
                      onClick={() => applyKenBurns(type)}
                      style={{ fontSize: 11, padding: '4px 0' }}
                      title="Replaces all keyframes with a Ken Burns animation"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p style={{ color: theme.color.textDim, fontSize: 10, margin: `${theme.space.xs}px 0 0` }}>
                  Sets fill scale + start/end keyframes. Designed for landscape→portrait reframe.
                </p>
              </Section>
            )}

            <Section title="Clip">
              <Row label="Duration">
                <span style={{ color: theme.color.textDim, fontSize: theme.font.size.sm }}>
                  {clipDuration(clip).toFixed(2)}s
                </span>
              </Row>
              {clip.kind === 'media' && (
                <NumField
                  label="Speed"
                  value={Math.round((clipDuration(clip) > 0 ? (clip.outPoint - clip.inPoint) / clipDuration(clip) : 1) * 100) / 100}
                  step={0.25}
                  min={0.1}
                  max={8}
                  onChange={(v) => void runCommand('set_property', { clipId: clip.id, speed: v })}
                />
              )}
            </Section>

            <Section title="Audio & fades">
              {!isTitle(clip) && (
                <Slider
                  label={`Volume ${Math.round(clip.volume * 100)}%`}
                  value={clip.volume}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={(v) => setAudio({ volume: v })}
                />
              )}
              <NumField label="Fade in (s)" value={clip.fadeIn} step={0.1} min={0} onChange={(v) => setAudio({ fadeIn: v })} />
              <NumField label="Fade out (s)" value={clip.fadeOut} step={0.1} min={0} onChange={(v) => setAudio({ fadeOut: v })} />
            </Section>

            <Section title="Transition (from previous clip)">
              <Row label="Cross-dissolve">
                <select
                  value={clip.transition ? 'dissolve' : 'none'}
                  onChange={(e) =>
                    void runCommand('set_transition', {
                      clipId: clip.id,
                      type: e.target.value === 'none' ? 'none' : 'dissolve',
                      duration: clip.transition?.duration ?? 1
                    })
                  }
                  style={selectStyle}
                >
                  <option value="none">None</option>
                  <option value="dissolve">Dissolve</option>
                </select>
              </Row>
              {clip.transition && (
                <NumField
                  label="Duration (s)"
                  value={clip.transition.duration}
                  step={0.1}
                  min={0.1}
                  onChange={(v) =>
                    void runCommand('set_transition', { clipId: clip.id, type: 'dissolve', duration: v })
                  }
                />
              )}
            </Section>

            <Section title="Keyframes">
              <button
                onClick={() => {
                  const local = Math.max(0, playhead - clip.start)
                  const t = resolveTransform(clip, playhead)
                  void runCommand('set_keyframe', {
                    clipId: clip.id,
                    time: local,
                    x: t.x,
                    y: t.y,
                    scale: t.scale,
                    rotation: t.rotation,
                    opacity: t.opacity
                  })
                }}
                style={{ marginBottom: theme.space.sm, width: '100%' }}
                title="Capture current transform as a keyframe at the playhead"
              >
                + Add keyframe at playhead
              </button>
              {clip.keyframes.length === 0 ? (
                <p style={{ color: theme.color.textDim, fontSize: theme.font.size.sm }}>
                  No keyframes. Add one to start animating.
                </p>
              ) : (
                <KeyframeList clipId={clip.id} keyframes={clip.keyframes} />
              )}
            </Section>

            <div style={{ display: 'flex', gap: theme.space.sm, marginTop: theme.space.sm }}>
              <button onClick={() => void runCommand('delete_clip', { clipId: clip.id })}>
                Delete clip
              </button>
              <button
                onClick={() => void runCommand('delete_clip', { clipId: clip.id, ripple: true })}
                title="Delete and shift all later clips left to close the gap (Shift+Delete)"
              >
                Ripple delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  background: theme.color.bg,
  color: theme.color.text,
  border: `1px solid ${theme.color.border}`,
  borderRadius: theme.radius.sm,
  padding: '4px 6px'
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ marginBottom: theme.space.lg }}>
      <div
        style={{
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontSize: theme.font.size.sm,
          color: theme.color.textDim,
          marginBottom: theme.space.sm
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.space.sm,
        fontSize: theme.font.size.md
      }}
    >
      <span style={{ color: theme.color.textDim }}>{label}</span>
      {children}
    </label>
  )
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}): JSX.Element {
  return (
    <Row label={label}>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 90 }}
      />
    </Row>
  )
}

function KfNumField({
  label, value, onChange, step = 1, min, max, hasKf, onKf
}: {
  label: string; value: number; onChange: (v: number) => void
  step?: number; min?: number; max?: number
  hasKf?: boolean; onKf?: () => void
}): JSX.Element {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space.sm, fontSize: theme.font.size.md }}>
      <span style={{ color: theme.color.textDim }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <input
          type="number"
          value={typeof value === 'number' && isFinite(value) ? parseFloat(value.toFixed(4)) : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: 78 }}
        />
        {onKf !== undefined && (
          <button
            onClick={onKf}
            title="Add keyframe for this property at playhead"
            style={{
              fontSize: 11, padding: '1px 5px', lineHeight: 1.5,
              color: hasKf ? '#ffaa33' : theme.color.textDim,
              background: hasKf ? 'rgba(255,170,51,0.15)' : 'transparent',
              borderColor: hasKf ? '#ffaa33' : theme.color.border
            }}
          >
            ◆
          </button>
        )}
      </div>
    </label>
  )
}

function KeyframeList({
  clipId,
  keyframes
}: {
  clipId: string
  keyframes: Keyframe[]
}): JSX.Element {
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  return (
    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
      {sorted.map((kf) => {
        const props = Object.entries(kf)
          .filter(([k]) => k !== 'time')
          .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
          .join(', ')
        return (
          <div
            key={kf.time}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: theme.space.xs,
              fontSize: theme.font.size.sm,
              background: theme.color.panelAlt,
              borderRadius: theme.radius.sm,
              padding: `2px ${theme.space.xs}px`
            }}
          >
            <span style={{ color: theme.color.accent, minWidth: 40 }}>
              {kf.time.toFixed(2)}s
            </span>
            <span style={{ flex: 1, color: theme.color.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: `0 ${theme.space.xs}px` }}>
              {props}
            </span>
            <button
              onClick={() => void runCommand('delete_keyframe', { clipId, time: kf.time })}
              style={{ fontSize: 10, padding: '0 4px' }}
              title="Delete this keyframe"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
}): JSX.Element {
  return (
    <div style={{ marginBottom: theme.space.sm }}>
      <div style={{ fontSize: theme.font.size.md, color: theme.color.textDim }}>{label}</div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}
