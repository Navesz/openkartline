import { describe, expect, it } from 'vitest'
import { DEFAULT_KART, PRESETS } from './presets'
import { validateSimulationInput } from './validation'

describe('central simulation validation', () => {
  const settings = { safetyMarginM: 0.5, sampleCount: 200 }

  it('accepts the shipped preset and kart', () => {
    expect(validateSimulationInput(PRESETS.technical, DEFAULT_KART, settings)).toEqual([])
  })

  it('rejects fractional samples, unusable margins, non-finite values, and schema bounds', () => {
    const issues = validateSimulationInput(
      { ...PRESETS.oval, widthM: 1 },
      { ...DEFAULT_KART, powerHp: Number.NaN, driverMassKg: 181 },
      { safetyMarginM: 0.5, sampleCount: 32.5 },
    )
    const message = issues.map((issue) => issue.message).join(' ')
    expect(message).toMatch(/potência/i)
    expect(message).toMatch(/piloto/i)
    expect(message).toMatch(/inteiro/i)
    expect(message).toMatch(/corredor utilizável/i)
  })

  it('limits imported control-point and coordinate volume', () => {
    const tooMany = Array.from({ length: 501 }, (_, index) => ({ x: index, y: index % 2 }))
    expect(validateSimulationInput({ ...PRESETS.oval, centerline: tooMany }, DEFAULT_KART, settings)).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('500') })]),
    )
    expect(
      validateSimulationInput(
        { ...PRESETS.oval, centerline: [{ x: 100_001, y: 0 }, ...PRESETS.oval.centerline.slice(1)] },
        DEFAULT_KART,
        settings,
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('100.000') })]),
    )
  })
})
