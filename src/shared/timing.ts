/**
 * Pure timing math shared by the preview engine and the exporter so a fade or
 * cross-dissolve looks the same on screen as in the rendered file. All times in
 * seconds.
 */

/** Opacity/gain multiplier (0..1) from a clip's fade-in/out ramps at `local`. */
export function fadeGain(local: number, duration: number, fadeIn: number, fadeOut: number): number {
  let g = 1
  if (fadeIn > 0 && local < fadeIn) g = Math.min(g, local / fadeIn)
  if (fadeOut > 0 && local > duration - fadeOut) g = Math.min(g, (duration - local) / fadeOut)
  return Math.max(0, Math.min(1, g))
}

/** Incoming-clip alpha (0..1) for a cross-dissolve of `duration` at `local`. */
export function crossfadeAlpha(local: number, duration: number): number {
  if (duration <= 0) return 1
  return Math.max(0, Math.min(1, local / duration))
}
