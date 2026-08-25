import { describe, expect, it } from 'vitest'
import { DEFAULT_KART, PRESETS } from './presets'
import type { ValidationIssue } from './types'
import { validateSimulationInput } from './validation'

/**
 * Issues name their message rather than carrying it rendered, so these assert
 * the key. That is the stronger claim: wording is free to change without a
 * test pretending the rule changed with it.
 */
const keysOf = (issues: ValidationIssue[]): string[] =>
  issues.map((issue) => ('key' in issue.note ? issue.note.key : issue.note.text))

describe('central simulation validation', () => {
  const settings = { safetyMarginM: 0.5, sampleCount: 200 }

  it('accepts the shipped preset and kart', () => {
    expect(validateSimulationInput(PRESETS.technical, DEFAULT_KART, settings)).toEqual([])
  })

  it('blocks simulation while a background image is uncalibrated', () => {
    const background = { imageDataUrl: 'data:image/jpeg;base64,/9j/', imageWidthPx: 640, imageHeightPx: 480 }
    const uncalibrated = validateSimulationInput({ ...PRESETS.oval, background }, DEFAULT_KART, settings)
    expect(keysOf(uncalibrated)).toContain('validation.backgroundUncalibrated')
    expect(uncalibrated.every((issue) => issue.level === 'error')).toBe(true)
    const calibrated = validateSimulationInput(
      { ...PRESETS.oval, background: { ...background, scaleMPerPx: 0.4 } },
      DEFAULT_KART,
      settings,
    )
    expect(calibrated).toEqual([])
  })

  it('rejects fractional samples, unusable margins, non-finite values, and schema bounds', () => {
    const issues = validateSimulationInput(
      { ...PRESETS.oval, widthM: 1 },
      { ...DEFAULT_KART, powerHp: Number.NaN, driverMassKg: 181 },
      { safetyMarginM: 0.5, sampleCount: 32.5 },
    )
    expect(keysOf(issues)).toEqual(
      expect.arrayContaining([
        'validation.power',
        'validation.driverMass',
        'validation.sampleCount',
        'validation.noUsableCorridor',
      ]),
    )
  })

  it('limits imported control-point and coordinate volume', () => {
    const tooMany = Array.from({ length: 501 }, (_, index) => ({ x: index, y: index % 2 }))
    expect(validateSimulationInput({ ...PRESETS.oval, centerline: tooMany }, DEFAULT_KART, settings)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          note: expect.objectContaining({
            key: 'validation.controlPoints',
            params: expect.objectContaining({ max: 500 }),
          }),
        }),
      ]),
    )
    expect(
      validateSimulationInput(
        { ...PRESETS.oval, centerline: [{ x: 100_001, y: 0 }, ...PRESETS.oval.centerline.slice(1)] },
        DEFAULT_KART,
        settings,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          note: expect.objectContaining({
            key: 'validation.invalidCoordinate',
            params: expect.objectContaining({ max: 100_000 }),
          }),
        }),
      ]),
    )
  })
})
