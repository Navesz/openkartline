import { describe, expect, it } from 'vitest'
import { DEFAULT_KART, PRESETS } from '../domain/presets'
import { TRACK_IMAGE_LIMITS } from '../domain/trackImage'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import { ATTRIBUTION_MAX_LENGTH, parseProject, toProject } from './projectFile'

const t: Translate = (key, params) => translate('en', key, params)

const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAa//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ISP/2gAMAwEAAgADAAAAEB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ECP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ECP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ECP/2Q=='

const BACKGROUND = {
  imageDataUrl: TINY_JPEG,
  imageWidthPx: 640,
  imageHeightPx: 480,
  scaleMPerPx: 0.42,
}

describe('.okl.json project files', () => {
  it('round-trips canonical meters and kart parameters', () => {
    const settings = { safetyMarginM: 0.65, sampleCount: 240 }
    const { project } = toProject(PRESETS.hairpin, DEFAULT_KART, settings)
    const parsed = parseProject(JSON.stringify(project), t)
    expect(parsed.track).toEqual(PRESETS.hairpin)
    expect(parsed.kart).toEqual(DEFAULT_KART)
    expect(parsed.settings).toEqual(settings)
  })

  it('writes schema 0.2.0 and round-trips a calibrated background', () => {
    const track = { ...PRESETS.oval, background: BACKGROUND }
    const { project, warnings } = toProject(track, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    expect(project.schema_version).toBe('0.2.0')
    expect(warnings).toEqual([])
    const parsed = parseProject(JSON.stringify(project), t)
    expect(parsed.track.background).toEqual(BACKGROUND)
  })

  it('still reads 0.1.0 projects', () => {
    const { project } = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    const legacy = JSON.stringify({ ...project, schema_version: '0.1.0' })
    expect(parseProject(legacy, t).track.name).toBe(PRESETS.oval.name)
  })

  it('drops an over-budget image but keeps the calibration, with a warning', () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(TRACK_IMAGE_LIMITS.targetBytes * 1.4)}`
    const track = { ...PRESETS.oval, background: { ...BACKGROUND, imageDataUrl: huge } }
    const { project, warnings } = toProject(track, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    // Kept as a key so the run bar can render it in whatever locale is
    // current, not the one that happened to be active when the file was built.
    expect(warnings[0]).toEqual({ key: 'project.backgroundTooLarge' })
    expect(project.track.background?.image_data_url).toBeUndefined()
    expect(project.track.background?.scale_m_per_px).toBe(BACKGROUND.scaleMPerPx)
    // Dimensions without a picture cannot render; the reader degrades to none.
    expect(parseProject(JSON.stringify(project), t).track.background).toBeUndefined()
  })

  it('rejects a malformed background block', () => {
    const { project } = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    const malformed = {
      ...project,
      track: {
        ...project.track,
        background: { image_data_url: TINY_JPEG, image_width_px: 0, image_height_px: 10 },
      },
    }
    expect(() => parseProject(JSON.stringify(malformed), t)).toThrow(/dimensions/i)
  })

  it('rejects unsupported versions with an actionable error', () => {
    expect(() => parseProject('{"schema_version":"9.0"}', t)).toThrow('project.unsupportedVersion')
  })

  it('rejects oversized and out-of-contract project input', () => {
    expect(() => parseProject(' '.repeat(1024 * 1024 + 1), t)).toThrow('project.exceedsSizeLimit')
    const { project: invalid } = toProject(PRESETS.oval, DEFAULT_KART, {
      safetyMarginM: 0.5,
      sampleCount: 240,
    })
    invalid.simulation.settings.sample_count = 32.5
    expect(() => parseProject(JSON.stringify(invalid), t)).toThrow(/integer/)
  })

  it('rejects incompatible project constants and inconsistent derived values', () => {
    const { project: valid } = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    expect(() =>
      parseProject(JSON.stringify({ ...valid, track: { ...valid.track, direction: 'sideways' } }), t),
    ).toThrow('project.invalidDirection')
    expect(() =>
      parseProject(JSON.stringify({ ...valid, kart: { ...valid.kart, total_mass_kg: 999 } }), t),
    ).toThrow('project.massMismatch')
  })
})

describe('the attribution the app is willing to hold', () => {
  it('drops a credit longer than the published bound rather than re-emitting it', () => {
    // The schema caps `track.attribution` at 200 characters. Accepting a longer
    // one on load meant the next save produced a file that fails the project's
    // own schema.
    const overlong = 'x'.repeat(ATTRIBUTION_MAX_LENGTH + 1)
    const { project } = toProject({ ...PRESETS.oval, attribution: overlong }, DEFAULT_KART, {
      safetyMarginM: 0.5,
      sampleCount: 240,
    })
    expect(project.track.attribution).toBeUndefined()

    const smuggled = JSON.parse(JSON.stringify(project))
    smuggled.track.attribution = overlong
    expect(parseProject(JSON.stringify(smuggled), t).track.attribution).toBeUndefined()
  })

  it('keeps a credit at the bound', () => {
    const exact = 'x'.repeat(ATTRIBUTION_MAX_LENGTH)
    const { project } = toProject({ ...PRESETS.oval, attribution: exact }, DEFAULT_KART, {
      safetyMarginM: 0.5,
      sampleCount: 240,
    })
    expect(project.track.attribution).toBe(exact)
  })
})

describe('a GPS trace carries no borrowed credit', () => {
  it('does not keep an OpenStreetMap attribution on geometry that replaced it', () => {
    // Importing your own lap over one of the OSM-derived presets replaced the
    // centreline while leaving the credit in place, so a save would have
    // credited OpenStreetMap for a trace somebody drove themselves.
    const osmPreset = PRESETS.voltaRedonda
    expect(osmPreset.attribution).toBeTruthy()

    // What App.importGpsFile now builds.
    const { attribution: _replaced, ...rest } = osmPreset
    void _replaced
    const afterImport = {
      ...rest,
      centerline: PRESETS.oval.centerline,
      direction: PRESETS.oval.direction,
    }

    const { project } = toProject(afterImport, DEFAULT_KART, {
      safetyMarginM: 0.5,
      sampleCount: 240,
    })
    expect(project.track.attribution).toBeUndefined()
  })
})
