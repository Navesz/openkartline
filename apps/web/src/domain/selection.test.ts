import { describe, expect, it } from 'vitest'
import { DEFAULT_KART, PRESETS } from './presets'
import { clampSelectedSample } from './selection'
import { simulateInBrowser } from './simulator'

describe('sample selection', () => {
  const result = simulateInBrowser({
    track: PRESETS.oval,
    kart: DEFAULT_KART,
    settings: { safetyMarginM: 0.5, sampleCount: 32 },
  })

  it('clears missing selections and clamps stale indexes', () => {
    expect(clampSelectedSample(99, result)).toBe(31)
    expect(clampSelectedSample(-5, result)).toBe(0)
    expect(clampSelectedSample(Number.NaN, result)).toBeNull()
    expect(clampSelectedSample(1, null)).toBeNull()
  })
})
