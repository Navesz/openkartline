import { describe, expect, it } from 'vitest'
import { formatLapTime, formatNumber } from './formatNumber'

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

describe('formatNumber follows the reader locale', () => {
  it.each([
    ['en', 1234.5, 1, '1,234.5'],
    ['pt-BR', 1234.5, 1, '1.234,5'],
    ['en', 1.05, 2, '1.05'],
    ['pt-BR', 1.05, 2, '1,05'],
    ['en', 1200, 0, '1,200'],
    ['pt-BR', 1200, 0, '1.200'],
  ] as const)('formats %s %s to %s digits as %s', (locale, value, digits, expected) => {
    // Every figure came from toFixed, which always writes a full stop, so a
    // Portuguese reader saw "1.05" for a grip coefficient beside a Portuguese
    // label -- two conventions colliding inside one panel.
    expect(formatNumber(locale, value, digits)).toBe(expected)
  })

  it('degrades a non-finite value instead of printing NaN at the user', () => {
    expect(formatNumber('en', Number.NaN)).toBe('—')
    expect(formatNumber('pt-BR', Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('formatLapTime stays in motorsport convention', () => {
  it('is not localised', () => {
    // Timing screens and results sheets write m:ss.cc with a full stop in every
    // country; a comma here would mislead a reader comparing against one.
    expect(formatLapTime(83.456)).toBe('1:23.46')
  })

  it('degrades a non-finite value', () => {
    expect(formatLapTime(Number.NaN)).toBe('—')
  })
})
