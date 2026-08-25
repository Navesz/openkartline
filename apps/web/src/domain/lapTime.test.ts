import { describe, expect, it } from 'vitest'
import { formatLapTime } from './lapTime'

describe('formatLapTime', () => {
  it.each([
    [45.678, '0:45.68'],
    [59.994, '0:59.99'],
    [61.5, '1:01.50'],
    [0, '0:00.00'],
  ])('formats %s as %s', (seconds, expected) => {
    expect(formatLapTime(seconds)).toBe(expected)
  })

  it.each([
    [59.999, '1:00.00'],
    [119.997, '2:00.00'],
    [59.995, '1:00.00'],
  ])('carries a rounded-up second into the minute (%s)', (seconds, expected) => {
    // Splitting before rounding let the seconds field round up past the minute
    // it was measured against, so these rendered as 0:60.00 and 1:60.00.
    expect(formatLapTime(seconds)).toBe(expected)
  })
})
