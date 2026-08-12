import { describe, expect, it } from 'vitest'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import { prepareTrackGeometry } from './engine/prepareTrack'
import { KART_HALF_WIDTH_M } from './kartModel'
import { DEFAULT_KART, PRESETS } from './presets'
import { simulateInBrowser } from './simulator'
import { buildCanonicalTrackGeometry, matchCenterlineIndices } from './trackGeometry'
import type { SimulationRequest } from './types'
import { toApiRequest } from '../services/api'

const t: Translate = (key, params) => translate('en', key, params)

describe('canonical track geometry', () => {
  it('feeds identical smooth center and boundaries to the fallback and API adapter', () => {
    const request: SimulationRequest = {
      track: PRESETS.hairpin,
      kart: DEFAULT_KART,
      settings: { safetyMarginM: 0.5, sampleCount: 80 },
    }
    const canonical = buildCanonicalTrackGeometry(request.track, request.settings.sampleCount)
    const fallback = simulateInBrowser(request, t)
    const api = toApiRequest(request)
    // The browser engine prepares the very corridor the adapter would send, so
    // both solve identical geometry; its samples expose that prepared corridor.
    const engineMargin = request.settings.safetyMarginM + KART_HALF_WIDTH_M
    const prepared = prepareTrackGeometry(
      api.track.left_boundary.map((point) => ({ x: point.x_m, y: point.y_m })),
      api.track.right_boundary.map((point) => ({ x: point.x_m, y: point.y_m })),
      request.track.direction,
      { sampleCount: request.settings.sampleCount, safetyMarginM: engineMargin },
    )
    expect(fallback.samples.map((sample) => sample.center)).toEqual(prepared.center)
    expect(api.track.left_boundary[17]).toEqual({
      x_m: canonical.left[17].x,
      y_m: canonical.left[17].y,
    })
    expect(api.track.right_boundary).toHaveLength(80)
  })

  it('preserves the declared start point while normalizing travel direction', () => {
    const canonical = buildCanonicalTrackGeometry({ ...PRESETS.oval, direction: 'counterclockwise' }, 80)
    expect(canonical.center[0]).toEqual(PRESETS.oval.centerline[0])
  })

  it('pairs engine samples with the right station even when the lap phase differs', () => {
    const canonical = buildCanonicalTrackGeometry(PRESETS.hairpin, 80)
    const shift = 23
    const rotated = canonical.center.map((_, index) => canonical.center[(index + shift) % 80])
    const matched = matchCenterlineIndices(canonical.center, rotated)
    expect(matched).toEqual(rotated.map((_, index) => (index + shift) % 80))
  })

  it('never indexes outside the centerline when the lap has few stations', () => {
    const canonical = buildCanonicalTrackGeometry(PRESETS.oval, 4)
    const matched = matchCenterlineIndices(canonical.center, canonical.center)
    expect(matched.every((index) => index >= 0 && index < 4)).toBe(true)
  })
})
