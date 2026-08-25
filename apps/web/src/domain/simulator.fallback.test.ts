import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_KART, PRESETS } from './presets'

// Force the ported engine to fail so the defensive fallback is exercised end
// to end; the primary path is covered by simulator.test.ts and the parity gate.
vi.mock('./engine/minimumBending', () => ({
  minimumBendingPath: () => {
    throw new Error('forced optimizer failure')
  },
}))

import { simulateInBrowser } from './simulator'

describe('simulateInBrowser defensive fallback', () => {
  it('answers with the anchor heuristic when the ported engine throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = simulateInBrowser({
      track: PRESETS.oval,
      kart: DEFAULT_KART,
      settings: { safetyMarginM: 0.5, sampleCount: 120 },
    })
    expect(result.solver).toBe('browser-point-mass-v1')
    expect(result.samples).toHaveLength(120)
    expect(result.lapTimeS).toBeGreaterThan(5)
    expect(result.samples.every((sample) => Number.isFinite(sample.speedMps) && sample.speedMps > 0)).toBe(
      true,
    )
    expect(result.maxSpeedMps).toBeLessThanOrEqual(DEFAULT_KART.topSpeedKph / 3.6)
    expect(result.events.length).toBeGreaterThan(0)
    // A console warning is not a user-facing signal. The heuristic is a
    // different model -- measured 6.7% from the primary engine on the shipped
    // presets -- and it lands in the same hero slot, so the degradation has to
    // be visible in the result itself.
    // Stored as a key, not as rendered text: the note has to follow a later
    // language switch rather than freeze in the locale that solved the lap.
    expect(result.warnings[0]).toEqual({ key: 'project.warningSolverFallback' })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
