import { describe, expect, it } from 'vitest'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import { DEFAULT_KART, PRESETS } from './presets'
import { validateSimulationInput } from './validation'

const t: Translate = (key, params) => translate('en', key, params)

describe('central simulation validation', () => {
  const settings = { safetyMarginM: 0.5, sampleCount: 200 }

  it('accepts the shipped preset and kart', () => {
    expect(validateSimulationInput(PRESETS.technical, DEFAULT_KART, settings, t)).toEqual([])
  })

  it('blocks simulation while a background image is uncalibrated', () => {
    const background = { imageDataUrl: 'data:image/jpeg;base64,/9j/', imageWidthPx: 640, imageHeightPx: 480 }
    const uncalibrated = validateSimulationInput({ ...PRESETS.oval, background }, DEFAULT_KART, settings, t)
    expect(uncalibrated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'error', message: expect.stringContaining('Calibrate') }),
      ]),
    )
    const calibrated = validateSimulationInput(
      { ...PRESETS.oval, background: { ...background, scaleMPerPx: 0.4 } },
      DEFAULT_KART,
      settings,
      t,
    )
    expect(calibrated).toEqual([])
  })

  it('rejects fractional samples, unusable margins, non-finite values, and schema bounds', () => {
    const issues = validateSimulationInput(
      { ...PRESETS.oval, widthM: 1 },
      { ...DEFAULT_KART, powerHp: Number.NaN, driverMassKg: 181 },
      { safetyMarginM: 0.5, sampleCount: 32.5 },
      t,
    )
    const message = issues.map((issue) => issue.message).join(' ')
    expect(message).toMatch(/power/i)
    expect(message).toMatch(/driver/i)
    expect(message).toMatch(/integer/i)
    expect(message).toMatch(/usable corridor/i)
  })

  it('limits imported control-point and coordinate volume', () => {
    const tooMany = Array.from({ length: 501 }, (_, index) => ({ x: index, y: index % 2 }))
    expect(
      validateSimulationInput({ ...PRESETS.oval, centerline: tooMany }, DEFAULT_KART, settings, t),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('500') })]),
    )
    expect(
      validateSimulationInput(
        { ...PRESETS.oval, centerline: [{ x: 100_001, y: 0 }, ...PRESETS.oval.centerline.slice(1)] },
        DEFAULT_KART,
        settings,
        t,
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('100000') })]),
    )
  })
})
