import { describe, it, expect } from 'vitest'
import { ProjectSchema, clipDuration, sequenceDuration, type Project } from '@shared/schema'

function sampleProject(): Project {
  return ProjectSchema.parse({
    version: 1,
    id: 'p1',
    name: 'Test',
    activeSequenceId: 's1',
    mediaPool: [
      {
        id: 'm1',
        name: 'a.mp4',
        filePath: '/tmp/a.mp4',
        duration: 10,
        width: 1920,
        height: 1080,
        fps: 30,
        hasAudio: true,
        codec: 'h264'
      }
    ],
    sequences: [
      {
        id: 's1',
        name: 'Seq',
        width: 1920,
        height: 1080,
        fps: 30,
        tracks: [
          {
            id: 't1',
            type: 'video',
            name: 'Video 1',
            muted: false,
            clips: [
              { id: 'c1', mediaId: 'm1', start: 0, inPoint: 0, outPoint: 4 },
              { id: 'c2', mediaId: 'm1', start: 4, inPoint: 4, outPoint: 10 }
            ]
          }
        ]
      }
    ]
  })
}

describe('schema', () => {
  it('applies defaults to clips (transform, effects)', () => {
    const p = sampleProject()
    const clip = p.sequences[0].tracks[0].clips[0]
    expect(clip.transform.opacity).toBe(1)
    expect(clip.effects).toEqual([])
  })

  it('computes clip and sequence durations', () => {
    const p = sampleProject()
    const [c1, c2] = p.sequences[0].tracks[0].clips
    expect(clipDuration(c1)).toBe(4)
    expect(clipDuration(c2)).toBe(6)
    expect(sequenceDuration(p.sequences[0])).toBe(10)
  })

  it('round-trips through JSON', () => {
    const p = sampleProject()
    const restored = ProjectSchema.parse(JSON.parse(JSON.stringify(p)))
    expect(restored).toEqual(p)
  })

  it('rejects an unknown version', () => {
    expect(() => ProjectSchema.parse({ ...sampleProject(), version: 99 })).toThrow()
  })
})
