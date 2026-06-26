import { describe, it, expect } from 'vitest'
import { nearestIndex } from '@renderer/engine/decode/nearest'

describe('nearestIndex', () => {
  const ts = [0, 100, 200, 300, 400]

  it('returns -1 for an empty array', () => {
    expect(nearestIndex([], 50)).toBe(-1)
  })

  it('finds exact matches', () => {
    expect(nearestIndex(ts, 200)).toBe(2)
    expect(nearestIndex(ts, 0)).toBe(0)
    expect(nearestIndex(ts, 400)).toBe(4)
  })

  it('rounds to the closest neighbor', () => {
    expect(nearestIndex(ts, 130)).toBe(1) // closer to 100
    expect(nearestIndex(ts, 160)).toBe(2) // closer to 200
  })

  it('ties resolve to the earlier frame', () => {
    expect(nearestIndex(ts, 150)).toBe(1)
  })

  it('clamps below and above the range', () => {
    expect(nearestIndex(ts, -50)).toBe(0)
    expect(nearestIndex(ts, 9999)).toBe(4)
  })
})
