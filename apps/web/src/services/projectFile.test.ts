import { describe, expect, it } from 'vitest'
import { DEFAULT_KART, PRESETS } from '../domain/presets'
import { TRACK_IMAGE_LIMITS } from '../domain/trackImage'
import { translate } from '../i18n/translate'
import { LocalisedError } from '../domain/localisedError'
import type { ResultNote } from '../domain/types'
import { ATTRIBUTION_MAX_LENGTH, parseProject, toProject } from './projectFile'

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
    const parsed = parseProject(JSON.stringify(project))
    expect(parsed.track).toEqual(PRESETS.hairpin)
    expect(parsed.kart).toEqual(DEFAULT_KART)
    expect(parsed.settings).toEqual(settings)
  })

  it('writes schema 0.2.0 and round-trips a calibrated background', () => {
    const track = { ...PRESETS.oval, background: BACKGROUND }
    const { project, warnings } = toProject(track, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    expect(project.schema_version).toBe('0.2.0')
    expect(warnings).toEqual([])
    const parsed = parseProject(JSON.stringify(project))
    expect(parsed.track.background).toEqual(BACKGROUND)
  })

  it('still reads 0.1.0 projects', () => {
    const { project } = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    const legacy = JSON.stringify({ ...project, schema_version: '0.1.0' })
    expect(parseProject(legacy).track.name).toBe(PRESETS.oval.name)
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
    expect(parseProject(JSON.stringify(project)).track.background).toBeUndefined()
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
    expect(() => parseProject(JSON.stringify(malformed))).toThrow(/dimensions/i)
  })

  it('rejects unsupported versions with an actionable error', () => {
    expect(() => parseProject('{"schema_version":"9.0"}')).toThrow('project.unsupportedVersion')
  })

  it('rejects oversized and out-of-contract project input', () => {
    expect(() => parseProject(' '.repeat(1024 * 1024 + 1))).toThrow('project.exceedsSizeLimit')
    const { project: invalid } = toProject(PRESETS.oval, DEFAULT_KART, {
      safetyMarginM: 0.5,
      sampleCount: 240,
    })
    invalid.simulation.settings.sample_count = 32.5
    // The validation failure names its message rather than rendering it, so
    // this asserts the key. `parseProject` no longer takes a translator at all.
    expect(() => parseProject(JSON.stringify(invalid))).toThrow('validation.sampleCount')
  })

  it('rejects incompatible project constants and inconsistent derived values', () => {
    const { project: valid } = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    expect(() =>
      parseProject(JSON.stringify({ ...valid, track: { ...valid.track, direction: 'sideways' } })),
    ).toThrow('project.invalidDirection')
    expect(() =>
      parseProject(JSON.stringify({ ...valid, kart: { ...valid.kart, total_mass_kg: 999 } })),
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
    expect(parseProject(JSON.stringify(smuggled)).track.attribution).toBeUndefined()
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

describe('a project file cannot nominate a message this app owns', () => {
  it('will not resolve an object version as a message', () => {
    // A slot value shaped `{ key: … }` is a message reference. `schema_version`
    // is whatever the file said, so without coercion a file could name one of
    // this app's messages and have it quoted back: a crafted file produced
    // "Unsupported project version: RACING LINE LAB."
    const hostile = JSON.stringify({
      schema_version: { key: 'app.brandTagline' },
      project: { name: 'x' },
      track: {},
      kart: { parameters: {} },
      simulation: {},
    })

    let rendered = ''
    try {
      parseProject(hostile)
    } catch (error) {
      const note = error instanceof LocalisedError ? error.note : null
      rendered = note && 'key' in note ? translate('en', note.key, note.params) : String(error)
    }

    expect(rendered).toMatch(/not a version/i)
    expect(rendered).not.toMatch(/racing line lab/i)
  })

  it('does not echo an unknown key from a file as prose', () => {
    const injected = JSON.stringify({
      schema_version: { key: 'not-a-real-key-just-file-content' },
      project: { name: 'x' },
      track: {},
      kart: { parameters: {} },
      simulation: {},
    })

    let rendered = ''
    try {
      parseProject(injected)
    } catch (error) {
      const note = error instanceof LocalisedError ? error.note : null
      rendered = note && 'key' in note ? translate('en', note.key, note.params) : String(error)
    }

    expect(rendered).not.toMatch(/not-a-real-key-just-file-content/)
  })
})

describe('a rejected project does not freeze its wording', () => {
  it('names its failures instead of rendering them', () => {
    // `parseProject` used to take a translator and throw the rendered sentence.
    // A project rejected while the app was in English kept the English text in
    // the run bar after a switch to Portuguese -- the staleness #81 removed
    // everywhere else, surviving in the one path that went through
    // `validationErrorMessage`.
    const { project } = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    project.simulation.settings.sample_count = 32.5

    let notes: ResultNote[] = []
    try {
      parseProject(JSON.stringify(project))
    } catch (error) {
      notes = error instanceof LocalisedError ? error.notes : []
    }

    expect(notes).toEqual([expect.objectContaining({ key: 'validation.sampleCount' })])

    const render = (locale: 'en' | 'pt-BR') =>
      notes.map((note) => ('key' in note ? translate(locale, note.key, note.params) : note.text)).join(' ')
    expect(render('en')).not.toBe(render('pt-BR'))
    expect(render('en')).toMatch(/integer/i)
  })

  it('carries every reason a project was rejected, not just the first', () => {
    const { project } = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    project.simulation.settings.sample_count = 32.5
    project.kart.parameters.power_hp = 0

    let notes: ResultNote[] = []
    try {
      parseProject(JSON.stringify(project))
    } catch (error) {
      notes = error instanceof LocalisedError ? error.notes : []
    }

    const keys = notes.map((note) => ('key' in note ? note.key : note.text))
    expect(keys).toEqual(expect.arrayContaining(['validation.power', 'validation.sampleCount']))
  })
})

describe('the version a rejected file declared', () => {
  const rendered = (schemaVersion: unknown): string => {
    try {
      parseProject(JSON.stringify({ schema_version: schemaVersion, project: { name: 'x' } }))
    } catch (error) {
      const note = error instanceof LocalisedError ? error.note : undefined
      return note && 'key' in note ? translate('en', note.key, note.params) : String(error)
    }
    return ''
  }

  it('quotes a primitive back, however it was written', () => {
    // An unquoted `"schema_version": 0.2` is a plausible hand-edit. Coercing
    // only strings reported it as *missing*, pointing the user at the wrong
    // edit: the version is right there in the file, it is just not one we read.
    expect(rendered('9.0')).toMatch(/version: 9\.0/)
    expect(rendered(0.2)).toMatch(/version: 0\.2/)
    expect(rendered(false)).toMatch(/version: false/)
  })

  it('says missing only when nothing was declared', () => {
    expect(rendered(undefined)).toMatch(/missing/i)
    expect(rendered(null)).toMatch(/missing/i)
  })

  it('does not let a file choose how much of the interface it fills', () => {
    const long = rendered('9'.repeat(500))
    expect(long.length).toBeLessThan(120)
    expect(long).toContain('…')
  })

  it('will not quote an object, whatever it holds', () => {
    expect(rendered({ key: 'app.brandTagline' })).not.toMatch(/racing line lab/i)
    expect(rendered({ key: 'app.brandTagline' })).toMatch(/not a version/i)
    expect(rendered(['0.2.0'])).toMatch(/not a version/i)
  })
})

describe('a file that is valid JSON but not a project', () => {
  const message = (text: string): string => {
    try {
      parseProject(text)
    } catch (error) {
      const note = error instanceof LocalisedError ? error.note : undefined
      return note && 'key' in note ? translate('en', note.key, note.params) : String(error)
    }
    return ''
  }

  it.each(['null', '42', '"0.2.0"', 'true', '[]', '[{"schema_version":"0.2.0"}]'])(
    'answers %s in this app\u2019s own words',
    (text) => {
      // `null`, a number, a string and an array are all valid JSON. Reading
      // `schema_version` off `null` threw a raw `TypeError`, and the run bar
      // showed it verbatim: "Cannot read properties of null".
      const rendered = message(text)
      expect(rendered).toMatch(/unsupported project version/i)
      expect(rendered).not.toMatch(/cannot read propert/i)
      expect(rendered).not.toMatch(/TypeError/)
    },
  )

  it('does not leave a hole in the sentence for a blank version', () => {
    expect(message('{"schema_version":""}')).toMatch(/missing/i)
    expect(message('{"schema_version":"   "}')).toMatch(/missing/i)
    expect(message('{"schema_version":""}')).not.toMatch(/version: \./)
  })

  it('truncates by code point, not by code unit', () => {
    // Slicing mid-surrogate leaves half a character. It stays a lone surrogate
    // in the string and only becomes U+FFFD once rendered, so asserting on
    // U+FFFD here would pass either way -- this looks for the unpaired unit.
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    const emoji = `${'a'.repeat(39)}\u{1F600}\u{1F600}`
    const rendered = message(`{"schema_version":${JSON.stringify(emoji)}}`)
    expect(rendered).toMatch(/a{39}/)
    expect(lone.test(rendered)).toBe(false)
  })
})
