import { describe, expect, it } from 'vitest'
import { KART_PRESETS, PRESETS, kartPresetKeyFor, trackPresetKeyFor, toKartInput } from './presets'
import type { TrackInput } from './types'

const BACKGROUND = {
  imageDataUrl: 'data:image/jpeg;base64,/9j/',
  imageWidthPx: 1200,
  imageHeightPx: 800,
}

describe('the preset a track matches', () => {
  it('names every shipped preset from its own values', () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      expect(trackPresetKeyFor(preset)).toBe(key)
    }
  })

  it('names none for a track edited away from one', () => {
    const nudged: TrackInput = {
      ...PRESETS.oval,
      centerline: PRESETS.oval.centerline.map((point, index) =>
        index === 0 ? { ...point, x: point.x + 1 } : point,
      ),
    }
    expect(trackPresetKeyFor(nudged)).toBe('')
  })

  it('names none for a track carrying a background photo', () => {
    // A preset ships no image, so a track with one is not that preset. Saying
    // it was put the picker one click from discarding the photo: re-selecting
    // a preset loads a fresh copy, and the status line reports only the load.
    expect(trackPresetKeyFor({ ...PRESETS.adria, background: BACKGROUND })).toBe('')
    expect(
      trackPresetKeyFor({
        ...PRESETS.adria,
        background: { ...BACKGROUND, scaleMPerPx: 0.35 },
      }),
    ).toBe('')
  })

  it('names none for a circuit stripped of its credit line', () => {
    // The real circuits are OpenStreetMap-derived and carry an ODbL credit.
    // A copy without it renders no attribution, so the picker naming the
    // circuit would assert a provenance the interface is not showing.
    expect(PRESETS.adria.attribution).toMatch(/ODbL/)
    const uncredited = { ...PRESETS.adria }
    delete (uncredited as { attribution?: string }).attribution
    expect(trackPresetKeyFor(uncredited)).toBe('')
  })

  it('is not fooled by a different circuit of the same shape', () => {
    const renamed = { ...PRESETS.oval, name: 'Something else' }
    expect(trackPresetKeyFor(renamed)).toBe('')
    const reversed =
      PRESETS.oval.direction === 'clockwise' ? ('counterclockwise' as const) : ('clockwise' as const)
    expect(trackPresetKeyFor({ ...PRESETS.oval, direction: reversed })).toBe('')
    expect(trackPresetKeyFor({ ...PRESETS.oval, widthM: PRESETS.oval.widthM + 1 })).toBe('')
  })
})

describe('the preset a kart matches', () => {
  it('names every shipped kart preset from its own values', () => {
    for (const [key, preset] of Object.entries(KART_PRESETS)) {
      expect(kartPresetKeyFor(toKartInput(preset))).toBe(key)
    }
  })

  it('names none once a value is edited away', () => {
    const edited = { ...toKartInput(KART_PRESETS.senior), powerHp: 42 }
    expect(kartPresetKeyFor(edited)).toBe('')
  })
})
