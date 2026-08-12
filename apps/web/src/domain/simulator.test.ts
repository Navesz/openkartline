import { describe, expect, it } from 'vitest'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import { distance } from './geometry'
import { DEFAULT_KART, PRESETS } from './presets'
import { availableBrakingAcceleration, availableDriveAcceleration, simulateInBrowser } from './simulator'

const t: Translate = (key, params) => translate('en', key, params)

describe('browser simulator', () => {
  it('returns a finite deterministic closed-lap solution', () => {
    const request = {
      track: PRESETS.technical,
      kart: DEFAULT_KART,
      settings: { safetyMarginM: 0.5, sampleCount: 160 },
    }
    const first = simulateInBrowser(request, t)
    const second = simulateInBrowser(request, t)
    expect(first.samples).toHaveLength(160)
    expect(first.lapTimeS).toBeGreaterThan(5)
    expect(first.lapTimeS).toBe(second.lapTimeS)
    expect(first.samples.every((sample) => Number.isFinite(sample.speedMps) && sample.speedMps > 0)).toBe(
      true,
    )
    expect(first.maxSpeedMps).toBeLessThanOrEqual(DEFAULT_KART.topSpeedKph / 3.6)
    expect(first.events.length).toBeGreaterThan(0)
  })

  it('predicts a quicker lap with more lateral grip', () => {
    const base = {
      track: PRESETS.oval,
      kart: DEFAULT_KART,
      settings: { safetyMarginM: 0.5, sampleCount: 160 },
    }
    const normal = simulateInBrowser(base, t)
    const grippy = simulateInBrowser({ ...base, kart: { ...DEFAULT_KART, gripCoefficient: 1.5 } }, t)
    expect(grippy.lapTimeS).toBeLessThan(normal.lapTimeS)
  })

  it('intersects power and tire limits instead of scaling power by lateral grip', () => {
    const maximumLateral = DEFAULT_KART.gripCoefficient * 9.80665
    const straight = availableDriveAcceleration(20, 0, DEFAULT_KART)
    const powerLimitedCorner = availableDriveAcceleration(20, maximumLateral * 0.8, DEFAULT_KART)
    const tireLimitedCorner = availableDriveAcceleration(20, maximumLateral * 0.99, DEFAULT_KART)
    expect(powerLimitedCorner).toBeCloseTo(straight, 10)
    expect(tireLimitedCorner).toBeLessThan(straight)
  })

  it('keeps every speed transition inside the combined grip envelope', () => {
    const result = simulateInBrowser(
      {
        track: PRESETS.hairpin,
        kart: DEFAULT_KART,
        settings: { safetyMarginM: 0.5, sampleCount: 200 },
      },
      t,
    )
    result.samples.forEach((sample, index) => {
      const next = result.samples[(index + 1) % result.samples.length]
      const segmentLength = distance(sample.position, next.position)
      const acceleration = (next.speedMps ** 2 - sample.speedMps ** 2) / (2 * segmentLength)
      if (acceleration >= 0) {
        const lateral = sample.speedMps ** 2 * Math.abs(sample.curvature)
        expect(acceleration).toBeLessThanOrEqual(
          availableDriveAcceleration(sample.speedMps, lateral, DEFAULT_KART) + 1e-6,
        )
      } else {
        const lateral = next.speedMps ** 2 * Math.abs(next.curvature)
        expect(-acceleration).toBeLessThanOrEqual(
          availableBrakingAcceleration(lateral, DEFAULT_KART, next.speedMps) + 1e-6,
        )
      }
    })
  })
})
