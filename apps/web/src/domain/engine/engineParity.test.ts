import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toApiRequest } from '../../services/api'
import { parseProject } from '../../services/projectFile'
import { DRAG_AREA_M2, DRIVETRAIN_EFFICIENCY, FRICTION_EXPONENT, HP_TO_WATTS } from '../kartModel'
import { DEFAULT_KART, KART_PRESETS, toKartInput } from '../presets'
import type { KartInput, Point } from '../types'
import { buildDrivingMarkers } from './markers'
import { minimumBendingPath } from './minimumBending'
import { pathChannels, prepareTrackGeometry } from './prepareTrack'
import { solveSpeedProfile } from './speedProfile'

/**
 * Cross-engine parity gate between the ported TypeScript engine and the Python
 * reference engine.
 *
 * Request fixtures are exported here through the exact `toApiRequest` adapter
 * the client uses, so both engines are compared on byte-identical inputs.
 * Result fixtures are produced by `scripts/export_parity_fixtures.py`, which
 * runs the Python engine over those requests. Both are committed.
 *
 * This file only catches drift on the browser side: it compares the port
 * against the committed numbers, and a Python-only change with the export step
 * skipped would leave it green. `tests/python/test_parity_fixtures.py` closes
 * the other direction, holding the engine to the same fixtures and the same
 * tolerances.
 *
 * Regenerate after any intentional engine change:
 *   OKL_UPDATE_PARITY=1 pnpm --filter @openkartline/web exec vitest run src/domain/engine/engineParity.test.ts
 *   uv run python scripts/export_parity_fixtures.py
 */

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..')
const EXAMPLES_DIR = resolve(REPO_ROOT, 'examples/tracks')
const FIXTURES_DIR = resolve(import.meta.dirname, '__fixtures__')
const UPDATE = process.env.OKL_UPDATE_PARITY === '1'

/**
 * Parity tolerances. Both engines compute in IEEE float64 from identical
 * inputs, so the observed agreement is roundoff-level (lap time ~5 ns, line
 * ~0.5 nm, speed ~2e-7 m/s). The gates below sit orders of magnitude above
 * that to absorb cross-platform libm/FFT noise, while still failing on any
 * real algorithmic drift.
 */
const LAP_TIME_TOLERANCE = 1e-6 // relative to the Python lap time
const LINE_DEVIATION_TOLERANCE_M = 1e-5 // per-sample distance between the two lines
const SPEED_TOLERANCE_MPS = 1e-3 // per-sample absolute speed difference

const KARTS: Record<string, KartInput> = {
  default: DEFAULT_KART,
  senior: toKartInput(KART_PRESETS.senior),
}

interface ApiResultFixture {
  status: { state: string; code: string }
  summary: { lap_time_s: number; track_length_m: number } | null
  samples: {
    s_m: number
    x_m: number
    y_m: number
    speed_mps: number
    elapsed_time_s: number
    throttle: number
    brake: number
  }[]
  markers: { kind: string; sample_index: number }[]
}

function loadExampleProjects(): { slug: string; request: ReturnType<typeof parseProject> }[] {
  return readdirSync(EXAMPLES_DIR)
    .filter((name) => name.endsWith('.okl.json'))
    .sort()
    .map((name) => ({
      slug: name.replace(/\.okl\.json$/, ''),
      request: parseProject(readFileSync(resolve(EXAMPLES_DIR, name), 'utf-8')),
    }))
}

/** Run the ported engine on an API request body, mirroring `simulate()` in Python. */
function runTypeScriptEngine(body: ReturnType<typeof toApiRequest>) {
  const direction = body.track.direction
  const toPoints = (points: { x_m: number; y_m: number }[]): Point[] =>
    points.map((point) => ({ x: point.x_m, y: point.y_m }))
  const prepared = prepareTrackGeometry(
    toPoints(body.track.left_boundary),
    toPoints(body.track.right_boundary),
    direction,
    { sampleCount: body.settings.sample_count, safetyMarginM: body.settings.safety_margin_m },
  )
  const { path } = minimumBendingPath(prepared, {
    safetyMarginM: body.settings.safety_margin_m,
    // The adapter does not send path_smoothing_iterations, so both sides use
    // the schema default of 20.
    iterations: 20,
  })
  const { station, segmentLengths, curvature } = pathChannels(path)
  expect(body.kart.drivetrain_efficiency).toBe(DRIVETRAIN_EFFICIENCY)
  const profile = solveSpeedProfile(
    curvature,
    segmentLengths,
    {
      totalMassKg: body.kart.total_mass_kg,
      powerW: body.kart.power_hp * HP_TO_WATTS,
      topSpeedMps: body.kart.top_speed_mps,
      maxAccelMps2: body.kart.max_accel_mps2,
      maxBrakeMps2: body.kart.max_brake_mps2,
      maxLateralAccelMps2: body.kart.max_lateral_accel_mps2,
      dragAreaM2: DRAG_AREA_M2,
    },
    { frictionExponent: body.settings.friction_exponent },
  )
  expect(body.settings.friction_exponent).toBe(FRICTION_EXPONENT)
  // Same length the engine uses for the apex wrap: the racing line's, not the
  // centerline's. See `simulation.py:233`.
  const pathLengthM = segmentLengths.reduce((sum, length) => sum + length, 0)
  const markers = buildDrivingMarkers(station, path, curvature, profile, pathLengthM)
  return { path, profile, markers }
}

describe('engine parity: TypeScript port vs Python reference', () => {
  const projects = loadExampleProjects()
  const cases = projects.flatMap(({ slug, request }) =>
    Object.entries(KARTS).map(([kartSlug, kart]) => ({
      slug: `${slug}--${kartSlug}`,
      body: toApiRequest({ track: request.track, kart, settings: request.settings }),
    })),
  )

  it('exports the request fixtures (OKL_UPDATE_PARITY=1)', { skip: !UPDATE }, () => {
    mkdirSync(FIXTURES_DIR, { recursive: true })
    for (const { slug, body } of cases) {
      writeFileSync(
        resolve(FIXTURES_DIR, `parity-request-${slug}.json`),
        `${JSON.stringify(body, null, 2)}\n`,
      )
    }
  })

  it.each(cases)('%s stays within parity of the Python engine', ({ slug, body }) => {
    const resultPath = resolve(FIXTURES_DIR, `parity-result-${slug}.json`)
    if (!existsSync(resultPath)) {
      throw new Error(
        `Missing ${resultPath}. Regenerate fixtures: OKL_UPDATE_PARITY=1 vitest run ` +
          `src/domain/engine/engineParity.test.ts, then uv run python scripts/export_parity_fixtures.py`,
      )
    }
    const reference = JSON.parse(readFileSync(resultPath, 'utf-8')) as ApiResultFixture
    expect(reference.status.state).toBe('success')
    expect(reference.summary).not.toBeNull()

    const { path, profile, markers } = runTypeScriptEngine(body)
    const referenceSamples = reference.samples
    expect(path).toHaveLength(referenceSamples.length)

    // Lap time: the headline number of the demo.
    const lapTimeError = Math.abs(profile.lapTimeS - reference.summary!.lap_time_s)
    expect(lapTimeError).toBeLessThanOrEqual(reference.summary!.lap_time_s * LAP_TIME_TOLERANCE)

    // Racing line: per-sample distance between the two engines' lines.
    const deviations = path.map((point, index) =>
      Math.hypot(point.x - referenceSamples[index].x_m, point.y - referenceSamples[index].y_m),
    )
    expect(Math.max(...deviations)).toBeLessThanOrEqual(LINE_DEVIATION_TOLERANCE_M)

    // Speed profile: per-sample agreement and same channel count.
    const speedErrors = profile.speed.map((speed, index) =>
      Math.abs(speed - referenceSamples[index].speed_mps),
    )
    expect(Math.max(...speedErrors)).toBeLessThanOrEqual(SPEED_TOLERANCE_MPS)

    // Driving markers. Brake and throttle edges come from the (roundoff-equal)
    // pedal channels, so they must land on the exact same sample.
    //
    // Apexes are compared exactly too. The gate used to be a 0.9 match ratio,
    // on the theory that a ~1e-12 curvature tie could reshuffle the greedy
    // selection -- but that ratio is wide enough to absorb a real divergence,
    // and it did: passing the centerline's length where the engine passes the
    // racing line's made volta-redonda drop apex 7 and invent apex 79, at
    // 19/20 matched. Eight of the ten fixtures agreed by luck. If a libm
    // difference ever does flip a tie, the floor is a symmetric match at 1.0,
    // never a one-directional ratio.
    const actionable = reference.markers.filter((marker) => marker.kind !== 'apex')
    for (const marker of actionable) {
      const match = markers.some(
        (candidate) => candidate.kind === marker.kind && candidate.sampleIndex === marker.sample_index,
      )
      expect(match, `marker ${marker.kind} @ ${marker.sample_index} (${slug})`).toBe(true)
    }
    const referenceApexes = reference.markers
      .filter((marker) => marker.kind === 'apex')
      .map((marker) => marker.sample_index)
    const portApexes = markers.filter((marker) => marker.kind === 'apex').map((marker) => marker.sampleIndex)
    expect(portApexes).toEqual(referenceApexes)
  })
})
