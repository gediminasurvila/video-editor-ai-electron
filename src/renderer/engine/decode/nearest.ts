/**
 * Index of the value in a sorted ascending array nearest to `target`.
 * Returns -1 for an empty array. Used to pick the closest decoded frame
 * (by timestamp) for a given source position.
 */
export function nearestIndex(sorted: number[], target: number): number {
  if (sorted.length === 0) return -1
  let lo = 0
  let hi = sorted.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < target) lo = mid + 1
    else hi = mid
  }
  const after = lo
  const before = lo - 1
  if (before < 0) return after
  return target - sorted[before] <= sorted[after] - target ? before : after
}
