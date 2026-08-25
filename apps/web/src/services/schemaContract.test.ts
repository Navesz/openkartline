import { describe, expect, it } from 'vitest'
import schema010 from '../../../../packages/schemas/okl-project-0.1.0.schema.json'
import schema020 from '../../../../packages/schemas/okl-project-0.2.0.schema.json'
import { KART_PRESETS, PRESETS, toKartInput } from '../domain/presets'
import { INPUT_LIMITS, validateSimulationInput } from '../domain/validation'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import { toProject } from './projectFile'

const t: Translate = (key, params) => translate('en', key, params)

interface Bound {
  minimum?: number
  maximum?: number
}

/**
 * The published bound and the editor limit that has to agree with it. These
 * drifted apart unnoticed -- the schema allowed 80 hp and 15 m/s2 while the
 * editor allowed 100 and 20 -- so the shipped Superkart preset exported a file
 * that failed the project's own schema.
 */
const PINNED: [string, keyof typeof INPUT_LIMITS, 'minimum' | 'maximum'][] = [
  ['power_hp', 'powerHpMax', 'maximum'],
  ['kart_mass_kg', 'kartMassKgMin', 'minimum'],
  ['kart_mass_kg', 'kartMassKgMax', 'maximum'],
  ['driver_mass_kg', 'driverMassKgMin', 'minimum'],
  ['driver_mass_kg', 'driverMassKgMax', 'maximum'],
  ['top_speed_kph', 'topSpeedKphMin', 'minimum'],
  ['top_speed_kph', 'topSpeedKphMax', 'maximum'],
  ['grip_coefficient', 'gripCoefficientMin', 'minimum'],
  ['grip_coefficient', 'gripCoefficientMax', 'maximum'],
  ['brake_decel_mps2', 'brakeDecelMinMps2', 'minimum'],
  ['brake_decel_mps2', 'brakeDecelMaxMps2', 'maximum'],
]

const kartParameters = (schema: unknown): Record<string, Bound> =>
  (schema as { properties: { kart: { properties: { parameters: { properties: Record<string, Bound> } } } } })
    .properties.kart.properties.parameters.properties

describe.each([
  ['0.1.0', schema010],
  ['0.2.0', schema020],
])('published schema %s agrees with the editor', (_version, schema) => {
  const parameters = kartParameters(schema)

  it.each(PINNED)('%s.%s matches INPUT_LIMITS.%s', (field, limit, bound) => {
    expect(parameters[field][bound]).toBe(INPUT_LIMITS[limit])
  })
})

describe('every shipped preset satisfies the contract it exports into', () => {
  const parameters = kartParameters(schema020)

  it.each(Object.keys(KART_PRESETS))('kart preset %s fits the published bounds', (key) => {
    const kart = KART_PRESETS[key as keyof typeof KART_PRESETS]
    const fields: [string, number][] = [
      ['power_hp', kart.powerHp],
      ['kart_mass_kg', kart.kartMassKg],
      ['driver_mass_kg', kart.driverMassKg],
      ['top_speed_kph', kart.topSpeedKph],
      ['grip_coefficient', kart.gripCoefficient],
      ['brake_decel_mps2', kart.brakeDecelMps2],
    ]
    for (const [field, value] of fields) {
      expect(value, `${field} = ${value}`).toBeGreaterThanOrEqual(parameters[field].minimum!)
      expect(value, `${field} = ${value}`).toBeLessThanOrEqual(parameters[field].maximum!)
    }
  })

  it.each(Object.keys(KART_PRESETS))('kart preset %s passes the editor validator', (key) => {
    const issues = validateSimulationInput(
      PRESETS.oval,
      toKartInput(KART_PRESETS[key as keyof typeof KART_PRESETS]),
      { safetyMarginM: 0.5, sampleCount: 200 },
      t,
    )
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([])
  })
})

describe('licence attribution survives a save', () => {
  it('writes the ODbL credit an OpenStreetMap preset carries', () => {
    const track = PRESETS.voltaRedonda
    expect(track.attribution).toBeTruthy()

    const { project } = toProject(track, toKartInput(KART_PRESETS.rentalIndoor), {
      safetyMarginM: 0.5,
      sampleCount: 200,
    })

    // Sharing the file redistributes ODbL-derived geometry; dropping the credit
    // here is the part that is not ours to drop.
    expect(project.track.attribution).toBe(track.attribution)
  })
})

describe('the compatibility ADR 0004 actually claims', () => {
  const parameters = kartParameters(schema020)

  /** The bounds published before ADR 0004 relaxed them. */
  const PREVIOUS_BOUNDS: Record<string, [number, number]> = {
    power_hp: [1, 80],
    kart_mass_kg: [20, 250],
    driver_mass_kg: [20, 180],
    top_speed_kph: [10, 180],
    grip_coefficient: [0.2, 2],
    brake_decel_mps2: [0.5, 15],
  }

  it.each(Object.entries(PREVIOUS_BOUNDS))(
    '%s accepts everything the previous schema did',
    (field, [low, high]) => {
      // The relaxation direction is the half of the ADR's claim that holds: a
      // kart valid under the old bounds is still valid. Tightening either end
      // would break files already in the wild, which is why this is pinned
      // rather than left to review.
      expect(parameters[field].minimum!).toBeLessThanOrEqual(low)
      expect(parameters[field].maximum!).toBeGreaterThanOrEqual(high)
    },
  )

  it('publishes exactly the background fields the reader consumes', () => {
    // The other half of the claim does NOT hold, and the ADR now says so:
    // `origin_x_px` / `origin_y_px` were removed from a schema with
    // `additionalProperties: false`, so a hand-authored file carrying them
    // stops validating. Nothing this app wrote can be in that position --
    // `toProject` never emitted them. This pins the set so the schema cannot
    // drift back into advertising a field no reader honours.
    const background = (
      schema020 as {
        properties: {
          track: { properties: { background: { properties: Record<string, unknown> } } }
        }
      }
    ).properties.track.properties.background.properties

    expect(Object.keys(background).sort()).toEqual([
      'image_data_url',
      'image_height_px',
      'image_width_px',
      'scale_m_per_px',
    ])
  })
})
