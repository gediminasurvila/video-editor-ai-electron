import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { runCommand } from '../../commands'
import { Header } from '../MediaPanel/MediaPanel'

export function Inspector(): JSX.Element {
  const selectedClipId = useEditor((s) => s.selectedClipId)
  const project = useEditor((s) => s.project)
  const seq = activeSequence(project)

  const clip = seq?.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId) ?? null

  function setTransform(key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', value: number): void {
    if (!clip) return
    runCommand('set_property', { clipId: clip.id, transform: { [key]: value } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Inspector" />
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.space.md }}>
        {!clip ? (
          <p style={{ color: theme.color.textDim, fontSize: theme.font.size.sm }}>
            Select a clip to edit its properties.
          </p>
        ) : (
          <>
            <Field label="Position X" value={clip.transform.x} onChange={(v) => setTransform('x', v)} />
            <Field label="Position Y" value={clip.transform.y} onChange={(v) => setTransform('y', v)} />
            <Field
              label="Scale"
              value={clip.transform.scale}
              step={0.05}
              onChange={(v) => setTransform('scale', v)}
            />
            <Field
              label="Rotation"
              value={clip.transform.rotation}
              onChange={(v) => setTransform('rotation', v)}
            />
            <Field
              label="Opacity"
              value={clip.transform.opacity}
              step={0.05}
              min={0}
              max={1}
              onChange={(v) => setTransform('opacity', v)}
            />
            <hr style={{ borderColor: theme.color.border, margin: `${theme.space.md}px 0` }} />
            <button onClick={() => runCommand('delete_clip', { clipId: clip.id })}>
              Delete clip
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Field({
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
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 90 }}
      />
    </label>
  )
}
