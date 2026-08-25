import { afterEach, describe, expect, it, vi } from 'vitest'
import { KART_HALF_WIDTH_M, kartEnvelope } from '../domain/kartModel'
import { INPUT_LIMITS } from '../domain/validation'
import { DEFAULT_KART, PRESETS } from '../domain/presets'
import type { SimulationRequest } from '../domain/types'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import { ScientificSimulationError, runSimulation, toApiRequest } from './api'

const t: Translate = (key, params) => translate('en', key, params)

const request: SimulationRequest = {
  track: PRESETS.oval,
  kart: DEFAULT_KART,
  settings: { safetyMarginM: 0.5, sampleCount: 80 },
}

afterEach(() => vi.restoreAllMocks())

describe('engine API adapter', () => {
  it('converts the editor model into strict versioned SI inputs', () => {
    const body = toApiRequest(request)
    expect(body.track.schema_version).toBe('1.0')
    expect(body.track.left_boundary).toHaveLength(request.settings.sampleCount)
    expect(body.track.left_boundary[0]).toEqual(
      expect.objectContaining({ x_m: expect.any(Number), y_m: expect.any(Number) }),
    )
    expect(body.kart.total_mass_kg).toBe(DEFAULT_KART.kartMassKg + DEFAULT_KART.driverMassKg)
    expect(body.kart.top_speed_mps).toBeCloseTo(DEFAULT_KART.topSpeedKph / 3.6)
    // The engine constrains the line's centre, so the margin it receives has to
    // include half a kart on top of the driver's own buffer.
    expect(body.settings.safety_margin_m).toBe(0.5 + KART_HALF_WIDTH_M)
    expect(body).not.toHaveProperty('centerline')
  })

  it('uses the browser solver when the API request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const result = await runSimulation(request, true, t)
    expect(result.source).toBe('browser')
    expect(result.samples).toHaveLength(80)
  })

  it('falls back to the browser solver when the local compute slots are busy', async () => {
    // 429 is a capacity signal, not a rejected request: the deterministic
    // browser solver exists precisely to absorb it.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Local solver is busy' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const result = await runSimulation(request, true, t)
    expect(result.source).toBe('browser')
    expect(result.samples).toHaveLength(80)
  })

  it('derives the engine kart from the same envelope the browser solver uses', () => {
    const envelope = kartEnvelope(DEFAULT_KART)
    const { kart } = toApiRequest(request)
    expect(kart.total_mass_kg).toBe(envelope.totalMassKg)
    expect(kart.top_speed_mps).toBe(envelope.topSpeedMps)
    expect(kart.max_accel_mps2).toBe(envelope.maxAccelMps2)
    expect(kart.max_brake_mps2).toBe(envelope.maxBrakeMps2)
    expect(kart.max_lateral_accel_mps2).toBe(envelope.maxLateralAccelMps2)
    // The adapter used to clamp longitudinal grip at 5 m/s2 while the browser
    // solver did not, so the two engines disagreed at the default kart.
    expect(kart.max_accel_mps2).toBeGreaterThan(5)
  })

  it('does not hide HTTP or scientific failures behind the browser fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'invalid corridor' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await expect(runSimulation(request, true, t)).rejects.toThrow(ScientificSimulationError)

    const scientificFailure = {
      engine_version: '0.1.0',
      status: { state: 'numerical_failure', message: 'solver did not converge' },
      validation: { errors: [], warnings: [] },
      summary: null,
      samples: [],
      markers: [],
      assumptions: [],
      warnings: [],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(scientificFailure), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await expect(runSimulation(request, true, t)).rejects.toThrow(/did not converge/)
  })

  it('maps engine channels into the unified UI result', async () => {
    const response = {
      engine_version: '0.1.0',
      status: { state: 'success', message: 'ok' },
      validation: { errors: [], warnings: [] },
      summary: { track_length_m: 100, lap_time_s: 10, min_speed_mps: 8, max_speed_mps: 12 },
      samples: Array.from({ length: 4 }, (_, index) => ({
        s_m: index * 25,
        x_m: index,
        y_m: index,
        curvature_1pm: 0.01,
        speed_mps: 10,
        throttle: 0.5,
        brake: 0,
        heading_rad: 0.25,
        longitudinal_accel_mps2: 1.5,
        lateral_accel_mps2: 1.0,
        friction_utilization: 0.42,
      })),
      markers: [{ kind: 'acceleration_start', sample_index: 1, s_m: 25, speed_mps: 10 }],
      assumptions: [],
      warnings: [],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const result = await runSimulation(request, true, t)
    expect(result.source).toBe('api')
    expect(result.solver).toBe('engine-0.1.0')
    expect(result.events[0]).toEqual(expect.objectContaining({ kind: 'throttle', sampleIndex: 1 }))
    // The extended physics channels ride along when the engine provides them.
    expect(result.samples[2]).toEqual(
      expect.objectContaining({
        headingRad: 0.25,
        longitudinalAccelMps2: 1.5,
        lateralAccelMps2: 1.0,
        frictionUtilization: 0.42,
      }),
    )
  })
})

describe('engine validation errors reach the user', () => {
  // A FastAPI 422 body is a list of {type, loc, msg, input}, never a string.
  // The client read only the string branch, so the reason was always dropped
  // and the user saw a bare "HTTP 422" with no field and no bound. A mock that
  // sends a string passes either way and proves nothing about this branch.
  const validationBody = {
    detail: [
      {
        type: 'less_than_equal',
        loc: ['body', 'kart', 'max_accel_mps2'],
        msg: 'Input should be less than or equal to 50',
        input: 62.4,
      },
    ],
  }

  it('names the field the engine rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(validationBody), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await expect(runSimulation(request, true, t)).rejects.toThrow(/kart\.max_accel_mps2/)
  })

  it('still carries the plain-string detail the size middleware sends', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Request body is too large.' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await expect(runSimulation(request, true, t)).rejects.toThrow(/too large/)
  })
})

describe('every kart the editor accepts fits the engine contract', () => {
  // Checked as a class rather than per-field: `max_accel_mps2` was capped at 30
  // while its siblings allowed 50, and the editor's own extremes derive 42.53
  // through `tractionCeilingMps2`, so Simulate returned 422 on inputs the
  // browser solved happily and `validateSimulationInput` reported as fine.
  // [low, high, lowIsInclusive] -- mirrors the `ge`/`gt` split in KartV1.
  const KART_FIELD_BOUNDS = {
    total_mass_kg: [40, 600, true],
    power_hp: [0, 250, false],
    top_speed_mps: [1, 120, false],
    max_accel_mps2: [0, 50, false],
    max_brake_mps2: [0, 50, false],
    max_lateral_accel_mps2: [0, 50, false],
  } as const

  const corners = [
    { kartMassKg: 'kartMassKgMin', driverMassKg: 'driverMassKgMin' },
    { kartMassKg: 'kartMassKgMax', driverMassKg: 'driverMassKgMax' },
  ] as const

  it.each(corners)('holds at the mass extremes (%o)', (corner) => {
    const extreme = {
      powerHp: INPUT_LIMITS.powerHpMax,
      kartMassKg: INPUT_LIMITS[corner.kartMassKg],
      driverMassKg: INPUT_LIMITS[corner.driverMassKg],
      topSpeedKph: INPUT_LIMITS.topSpeedKphMax,
      gripCoefficient: INPUT_LIMITS.gripCoefficientMax,
      brakeDecelMps2: INPUT_LIMITS.brakeDecelMaxMps2,
    }
    const { kart } = toApiRequest({ ...request, kart: extreme })
    for (const [field, [low, high, lowInclusive]] of Object.entries(KART_FIELD_BOUNDS)) {
      const value = kart[field as keyof typeof kart] as number
      if (lowInclusive) expect(value, `${field} = ${value}`).toBeGreaterThanOrEqual(low)
      else expect(value, `${field} = ${value}`).toBeGreaterThan(low)
      expect(value, `${field} = ${value}`).toBeLessThanOrEqual(high)
    }
  })
})
