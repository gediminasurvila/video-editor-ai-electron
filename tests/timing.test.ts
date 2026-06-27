import { describe, it, expect } from 'vitest'
import { fadeGain, crossfadeAlpha } from '@shared/timing'
import { ClipSchema } from '@shared/schema'

describe('fadeGain', () => {
  const dur = 10
  it('is full in the middle with no fades', () => {
    expect(fadeGain(5, dur, 0, 0)).toBe(1)
  })
  it('ramps up during fade-in', () => {
    expect(fadeGain(0, dur, 2, 0)).toBe(0)
    expect(fadeGain(1, dur, 2, 0)).toBeCloseTo(0.5)
    expect(fadeGain(2, dur, 2, 0)).toBe(1)
  })
  it('ramps down during fade-out', () => {
    expect(fadeGain(10, dur, 0, 2)).toBe(0)
    expect(fadeGain(9, dur, 0, 2)).toBeCloseTo(0.5)
    expect(fadeGain(8, dur, 0, 2)).toBe(1)
  })
  it('clamps to [0,1]', () => {
    expect(fadeGain(-1, dur, 2, 0)).toBe(0)
    expect(fadeGain(11, dur, 0, 2)).toBe(0)
  })
})

describe('crossfadeAlpha', () => {
  it('ramps incoming 0→1 across the transition', () => {
    expect(crossfadeAlpha(0, 2)).toBe(0)
    expect(crossfadeAlpha(1, 2)).toBe(0.5)
    expect(crossfadeAlpha(2, 2)).toBe(1)
  })
  it('returns 1 for a zero-length transition', () => {
    expect(crossfadeAlpha(0, 0)).toBe(1)
  })
})

describe('ClipSchema defaults', () => {
  it('fills in kind/volume/fades for a media clip', () => {
    const c = ClipSchema.parse({ id: 'c', mediaId: 'm', start: 0, inPoint: 0, outPoint: 5 })
    expect(c.kind).toBe('media')
    expect(c.volume).toBe(1)
    expect(c.fadeIn).toBe(0)
    expect(c.fadeOut).toBe(0)
    expect(c.transition).toBeUndefined()
  })
})
