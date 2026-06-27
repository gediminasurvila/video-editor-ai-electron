/**
 * Snap a target time to the nearest snap point within `tolerance` seconds.
 * Returns the snapped time, or the original if nothing is close enough. Snap
 * points are things like the playhead and other clips' start/end edges — this is
 * what makes dragging on the timeline feel precise without manual alignment.
 */
export function snapTime(target: number, points: number[], tolerance: number): number {
  let best = target
  let bestDist = tolerance
  for (const p of points) {
    const d = Math.abs(p - target)
    if (d <= bestDist) {
      best = p
      bestDist = d
    }
  }
  return best
}

/** Convert a horizontal pixel distance to seconds at a given zoom. */
export function pxToSec(px: number, pxPerSec: number): number {
  return px / pxPerSec
}
