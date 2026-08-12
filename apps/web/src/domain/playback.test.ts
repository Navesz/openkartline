import { describe, expect, it } from 'vitest'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import { frameAtElapsed, wrapElapsed } from './playback'
import { DEFAULT_KART, PRESETS } from './presets'
import { simulateInBrowser } from './simulator'
import type { SimulationResult } from './types'

const t: Translate = (key, params) => translate('en', key, params)

const result: SimulationResult = simulateInBrowser(
  {
    track: PRESETS.technical,
    kart: DEFAULT_KART,
    settings: { safetyMarginM: 0.55, sampleCount: 200 },
  },
  t,
)

describe('lap playback', () => {
  it('walks the whole lap once and loops without a seam', () => {
    const start = frameAtElapsed(result, 0)!
    const wrapped = frameAtElapsed(result, result.lapTimeS)!
    expect(start.elapsedS).toBe(0)
    expect(wrapped.elapsedS).toBe(0)
    expect(wrapped.position).toEqual(start.position)
    expect(frameAtElapsed(result, -1)!.elapsedS).toBeCloseTo(result.lapTimeS - 1, 6)
  })

  it('advances distance monotonically across the whole lap, including the closing segment', () => {
    let previous = -1
    for (let step = 0; step < 400; step += 1) {
      const frame = frameAtElapsed(result, (step / 400) * result.lapTimeS)!
      expect(frame.distanceM).toBeGreaterThanOrEqual(previous)
      previous = frame.distanceM
    }
    expect(previous).toBeGreaterThan(result.trackLengthM * 0.99)
  })

  it('keeps the simulated lap independent of the playback rate', () => {
    // The rate belongs to the wall clock, not to the physics. Sampling the same
    // simulated instants must give identical states no matter how fast a
    // caller advances its own clock towards them.
    const instants = [0.1, 0.25, 0.5, 0.75, 0.9].map((ratio) => ratio * result.lapTimeS)
    for (const rate of [1, 2, 3]) {
      for (const instant of instants) {
        // A player at `rate` reaches `instant` after `instant / rate` real
        // seconds; the frame it renders is the one for `instant`.
        const realSeconds = instant / rate
        const frame = frameAtElapsed(result, realSeconds * rate)!
        const reference = frameAtElapsed(result, instant)!
        expect(frame.position).toEqual(reference.position)
        expect(frame.speedMps).toBe(reference.speedMps)
        expect(frame.throttle).toBe(reference.throttle)
        expect(frame.brake).toBe(reference.brake)
      }
    }
  })

  it('interpolates position between samples instead of snapping to them', () => {
    const first = result.samples[0]
    const second = result.samples[1]
    const middle = frameAtElapsed(result, (first.elapsedS + second.elapsedS) / 2)!
    expect(middle.position.x).toBeCloseTo((first.position.x + second.position.x) / 2, 6)
    expect(middle.position.y).toBeCloseTo((first.position.y + second.position.y) / 2, 6)
    expect(middle.speedMps).toBeCloseTo((first.speedMps + second.speedMps) / 2, 6)
  })

  it('reports commanded pedal values rather than blending them', () => {
    const braking = result.samples.find((sample) => sample.brake > 0.2)
    expect(braking).toBeDefined()
    const frame = frameAtElapsed(result, braking!.elapsedS + 1e-6)!
    expect(frame.brake).toBe(braking!.brake)
    expect(frame.mode).toBe(braking!.mode)
  })

  it('returns nothing for a result that cannot be played', () => {
    expect(frameAtElapsed(null, 0)).toBeNull()
    expect(frameAtElapsed({ ...result, samples: [] }, 0)).toBeNull()
    expect(frameAtElapsed({ ...result, lapTimeS: 0 }, 0)).toBeNull()
    expect(wrapElapsed(Number.NaN, 10)).toBe(0)
  })
})
