import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { runCommand } from '../../commands'
import { Header } from '../MediaPanel/MediaPanel'
import { isTitle, resolveTransform, type Keyframe } from '@shared/schema'

export function Inspector(): JSX.Element {
  const selectedClipId = useEditor((s) => s.selectedClipId)
  const playhead = useEditor((s) => s.playhead)
  const project = useEditor((s) => s.project)
  const seq = activeSequence(project)

  const clip = seq?.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId) ?? null

  function setTransform(key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', value: number): void {
    if (clip) void runCommand('set_property', { clipId: clip.id, transform: { [key]: value } })
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
          <p style={{ color: theme.color.textDim, fontSize: theme.font.size.sm }}>
            Select a clip to edit its properties.
          </p>
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
              <NumField label="Position X" value={clip.transform.x} onChange={(v) => setTransform('x', v)} />
              <NumField label="Position Y" value={clip.transform.y} onChange={(v) => setTransform('y', v)} />
              <NumField label="Scale" value={clip.transform.scale} step={0.05} onChange={(v) => setTransform('scale', v)} />
              <NumField label="Rotation" value={clip.transform.rotation} onChange={(v) => setTransform('rotation', v)} />
              <NumField label="Opacity" value={clip.transform.opacity} step={0.05} min={0} max={1} onChange={(v) => setTransform('opacity', v)} />
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
