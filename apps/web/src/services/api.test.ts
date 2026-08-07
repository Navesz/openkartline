import { afterEach, describe, expect, it, vi } from 'vitest'
import { KART_HALF_WIDTH_M, kartEnvelope } from '../domain/kartModel'
import { DEFAULT_KART, PRESETS } from '../domain/presets'
import type { SimulationRequest } from '../domain/types'
import { ScientificSimulationError, runSimulation, toApiRequest } from './api'

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
    const result = await runSimulation(request, true)
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
    const result = await runSimulation(request, true)
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
    await expect(runSimulation(request, true)).rejects.toThrow(ScientificSimulationError)

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
    await expect(runSimulation(request, true)).rejects.toThrow(/did not converge/)
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
    const result = await runSimulation(request, true)
    expect(result.source).toBe('api')
    expect(result.solver).toBe('engine-0.1.0')
    expect(result.events[0]).toEqual(expect.objectContaining({ kind: 'throttle', sampleIndex: 1 }))
  })
})
