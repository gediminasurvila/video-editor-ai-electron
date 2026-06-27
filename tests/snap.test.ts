import { describe, it, expect } from 'vitest'
import { snapTime, pxToSec } from '@renderer/timeline/snap'

describe('snapTime', () => {
  it('snaps to the nearest point within tolerance', () => {
    expect(snapTime(5.05, [5, 10], 0.1)).toBe(5)
    expect(snapTime(9.95, [5, 10], 0.1)).toBe(10)
  })

  it('leaves the value alone when nothing is close enough', () => {
    expect(snapTime(7, [5, 10], 0.1)).toBe(7)
  })

  it('picks the closest of several points', () => {
    expect(snapTime(8.2, [8, 8.3, 9], 0.5)).toBe(8.3)
  })

  it('handles an empty set of points', () => {
    expect(snapTime(3.3, [], 0.2)).toBe(3.3)
  })
})

describe('pxToSec', () => {
  it('converts pixels to seconds at a given zoom', () => {
    expect(pxToSec(100, 50)).toBe(2)
  })
})
