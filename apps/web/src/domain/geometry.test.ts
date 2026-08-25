import { describe, expect, it } from 'vitest'
import { pathLength, resampleClosed, validateTrack } from './geometry'

const square = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 20 },
  { x: 0, y: 20 },
]

describe('track geometry', () => {
  it('resamples a closed path at an approximately uniform interval', () => {
    const samples = resampleClosed(square, 8)
    expect(samples).toHaveLength(8)
    expect(pathLength(samples)).toBeCloseTo(80, 4)
    expect(samples[1]).toEqual({ x: 10, y: 0 })
  })

  it('finds invalid and self-intersecting centerlines', () => {
    expect(validateTrack(square, 8)).toEqual([])
    expect(
      validateTrack(
        [
          { x: 0, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
          { x: 20, y: 0 },
        ],
        8,
      ),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'error' })]))
    expect(validateTrack(square, 0)).toEqual(
      expect.arrayContaining([expect.objectContaining({ note: { key: 'validation.widthPositive' } })]),
    )
  })
})

describe('validateTrack keeps scanning past a close pair', () => {
  // The scan used to `break` out of the outer loop on the first pair under 1 m
  // apart, which a single drag of one control point onto its neighbour
  // produces. A self-crossing lap then downgraded to a warning, `hasErrors`
  // stayed false, and the solver ran on a figure-eight corridor.
  const crossingWithAClosePair = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0 },
    { x: 200, y: 200 },
    { x: 0, y: 200 },
    { x: 200, y: 0 },
  ]

  it('reports the close pair and the crossing together', () => {
    const issues = validateTrack(crossingWithAClosePair, 8)
    expect(issues).toContainEqual({
      level: 'warning',
      note: { key: 'validation.pointsTooClose', params: { a: 1, b: 2 } },
    })
    expect(issues).toContainEqual({
      level: 'error',
      note: { key: 'validation.selfIntersecting' },
    })
  })

  it('reports the close pair only once', () => {
    const allClose = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 0, y: 0.5 },
    ]
    const warnings = validateTrack(allClose, 8).filter((issue) => issue.level === 'warning')
    expect(warnings).toHaveLength(1)
  })
})
