import { describe, expect, it } from 'vitest'
import { prepareTrackGeometry } from './engine/prepareTrack'
import { KART_HALF_WIDTH_M } from './kartModel'
import { DEFAULT_KART, PRESETS } from './presets'
import { simulateInBrowser } from './simulator'
import { buildCanonicalTrackGeometry, matchCenterlineIndices } from './trackGeometry'
import { pathLength } from './geometry'
import type { SimulationRequest, TrackInput } from './types'
import { toApiRequest } from '../services/api'

describe('canonical track geometry', () => {
  it('feeds identical smooth center and boundaries to the fallback and API adapter', () => {
    const request: SimulationRequest = {
      track: PRESETS.hairpin,
      kart: DEFAULT_KART,
      settings: { safetyMarginM: 0.5, sampleCount: 80 },
    }
    const canonical = buildCanonicalTrackGeometry(request.track, request.settings.sampleCount)
    const fallback = simulateInBrowser(request)
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

/** Largest gap between consecutive drawn points, in metres. */
function maxChordM(points: { x: number; y: number }[]): number {
  let worst = 0
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index]
    const to = points[(index + 1) % points.length]
    worst = Math.max(worst, Math.hypot(to.x - from.x, to.y - from.y))
  }
  return worst
}

describe('drawing resolution scales with the lap', () => {
  // TrackCanvas drew every corridor with 180 stations regardless of length. On
  // the shipped circuits that put up to 9.56 m between consecutive boundary
  // points -- more than the track is wide -- and the corridor read as a polygon
  // rather than a curve.
  const stationsFor = (track: TrackInput) =>
    Math.min(900, Math.max(180, Math.round(pathLength(track.centerline) / 1.5)))

  it.each(['voltaRedonda', 'adria', 'casteloBranco', 'baltar'] as const)(
    'keeps %s under 3 m between drawn boundary points',
    (key) => {
      const track = PRESETS[key]
      expect(maxChordM(buildCanonicalTrackGeometry(track, 180).left)).toBeGreaterThan(6)

      const drawn = buildCanonicalTrackGeometry(track, stationsFor(track))
      expect(maxChordM(drawn.left)).toBeLessThan(3)
      expect(maxChordM(drawn.right)).toBeLessThan(3)
    },
  )

  it('leaves a short track at the floor', () => {
    expect(stationsFor(PRESETS.oval)).toBe(180)
  })

  it('caps the count so a long import cannot make it unbounded', () => {
    const huge = {
      ...PRESETS.oval,
      centerline: PRESETS.oval.centerline.map((point) => ({ x: point.x * 40, y: point.y * 40 })),
    }
    expect(stationsFor(huge)).toBe(900)
  })
})
