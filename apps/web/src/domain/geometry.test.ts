import { describe, expect, it } from 'vitest'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import { pathLength, resampleClosed, validateTrack } from './geometry'

const t: Translate = (key, params) => translate('en', key, params)

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
    expect(validateTrack(square, 8, t)).toEqual([])
    expect(
      validateTrack(
        [
          { x: 0, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
          { x: 20, y: 0 },
        ],
        8,
        t,
      ),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'error' })]))
    expect(validateTrack(square, 0, t)).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('Width') })]),
    )
  })
})
