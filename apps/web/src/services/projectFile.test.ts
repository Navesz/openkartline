import { describe, expect, it } from 'vitest'
import { DEFAULT_KART, PRESETS } from '../domain/presets'
import { parseProject, toProject } from './projectFile'

describe('.okl.json project files', () => {
  it('round-trips canonical meters and kart parameters', () => {
    const settings = { safetyMarginM: 0.65, sampleCount: 240 }
    const parsed = parseProject(JSON.stringify(toProject(PRESETS.hairpin, DEFAULT_KART, settings)))
    expect(parsed.track).toEqual(PRESETS.hairpin)
    expect(parsed.kart).toEqual(DEFAULT_KART)
    expect(parsed.settings).toEqual(settings)
  })

  it('rejects unsupported versions with an actionable error', () => {
    expect(() => parseProject('{"schema_version":"9.0"}')).toThrow(/não suportada/i)
  })

  it('rejects oversized and out-of-contract project input', () => {
    expect(() => parseProject(' '.repeat(1024 * 1024 + 1))).toThrow(/1 MiB/)
    const invalid = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    invalid.simulation.settings.sample_count = 32.5
    expect(() => parseProject(JSON.stringify(invalid))).toThrow(/inteiro/)
  })

  it('rejects incompatible project constants and inconsistent derived values', () => {
    const valid = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    expect(() =>
      parseProject(JSON.stringify({ ...valid, track: { ...valid.track, direction: 'sideways' } })),
    ).toThrow(/sentido/i)
    expect(() =>
      parseProject(JSON.stringify({ ...valid, kart: { ...valid.kart, total_mass_kg: 999 } })),
    ).toThrow(/massa total/i)
  })
})
