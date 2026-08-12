import { coalesceSimulationEvents } from '../domain/events'
import { stabiliseDriveModes } from '../domain/driveMode'
import { curvatureAt } from '../domain/geometry'
import {
  DRIVETRAIN_EFFICIENCY,
  FRICTION_EXPONENT,
  KART_HALF_WIDTH_M,
  kartEnvelope,
} from '../domain/kartModel'
import { simulateInBrowser } from '../domain/simulator'
import { buildCanonicalTrackGeometry, matchCenterlineIndices } from '../domain/trackGeometry'
import type { LapSample, SimulationRequest, SimulationResult } from '../domain/types'
import type { Translate } from '../i18n/context'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'
const REQUEST_TIMEOUT_MS = 4_000

export class ScientificSimulationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScientificSimulationError'
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

function isAvailabilityFailure(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
  )
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/health`)
    return response.ok
  } catch {
    return false
  }
}

export async function runSimulation(
  request: SimulationRequest,
  preferApi: boolean,
  t: Translate,
): Promise<SimulationResult> {
  if (!preferApi) return simulateInBrowser(request, t)

  const body = JSON.stringify(toApiRequest(request))
  let response: Response
  try {
    response = await fetchWithTimeout(`${API_BASE}/v1/simulations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } catch (error) {
    if (isAvailabilityFailure(error)) return simulateInBrowser(request, t)
    throw error
  }
  if (!response.ok) {
    // 429 means the bounded local compute slots are busy, not that the request
    // is wrong. The deterministic browser solver is the intended relief valve,
    // so use it instead of surfacing a transient capacity error.
    if (response.status === 429) return simulateInBrowser(request, t)
    let detail = ''
    try {
      const payload = (await response.json()) as { detail?: unknown }
      detail = typeof payload.detail === 'string' ? payload.detail : ''
    } catch {
      // The HTTP status remains the authoritative error when the body is not JSON.
    }
    throw new ScientificSimulationError(detail || t('app.engineHttpError', { status: response.status }))
  }
  return fromApiResult((await response.json()) as ApiResult, request, t)
}

interface ApiPoint {
  x_m: number
  y_m: number
}
interface ApiSample {
  s_m: number
  x_m: number
  y_m: number
  curvature_1pm: number
  speed_mps: number
  elapsed_time_s: number
  throttle: number
  brake: number
  heading_rad?: number
  longitudinal_accel_mps2?: number
  lateral_accel_mps2?: number
  friction_utilization?: number
}
interface ApiResult {
  engine_version: string
  status: { state: 'success' | 'invalid_input' | 'numerical_failure'; message: string }
  validation: { errors: { message: string }[]; warnings: { message: string }[] }
  summary: null | { track_length_m: number; lap_time_s: number; min_speed_mps: number; max_speed_mps: number }
  samples: ApiSample[]
  markers: {
    kind: 'brake_start' | 'brake_end' | 'acceleration_start' | 'apex'
    sample_index: number
    s_m: number
    speed_mps: number
  }[]
  assumptions: string[]
  warnings: string[]
}

export function toApiRequest(request: SimulationRequest) {
  const { track, kart, settings } = request
  const canonical = buildCanonicalTrackGeometry(track, settings.sampleCount)
  const envelope = kartEnvelope(kart)
  const asApiPoints = (points: { x: number; y: number }[]): ApiPoint[] =>
    points.map((point) => ({ x_m: point.x, y_m: point.y }))
  return {
    track: {
      schema_version: '1.0',
      name: track.name,
      coordinate_system: 'local_cartesian_m',
      direction: track.direction,
      closed: true,
      left_boundary: asApiPoints(canonical.left),
      right_boundary: asApiPoints(canonical.right),
    },
    kart: {
      schema_version: '1.0',
      name: 'Kart personalizado',
      total_mass_kg: envelope.totalMassKg,
      power_hp: kart.powerHp,
      top_speed_mps: envelope.topSpeedMps,
      max_accel_mps2: envelope.maxAccelMps2,
      max_brake_mps2: envelope.maxBrakeMps2,
      max_lateral_accel_mps2: envelope.maxLateralAccelMps2,
      drivetrain_efficiency: DRIVETRAIN_EFFICIENCY,
    },
    settings: {
      schema_version: '1.0',
      sample_count: settings.sampleCount,
      // The engine keeps the line's centre inside the corridor, so half a kart
      // has to be part of the margin it is given.
      safety_margin_m: settings.safetyMarginM + KART_HALF_WIDTH_M,
      friction_exponent: FRICTION_EXPONENT,
    },
  }
}

export function fromApiResult(result: ApiResult, request: SimulationRequest, t: Translate): SimulationResult {
  if (result.status.state !== 'success' || !result.summary || !result.samples.length) {
    const reasons = result.validation.errors.map((issue) => issue.message).join(' ')
    throw new ScientificSimulationError(reasons || result.status.message || t('app.engineIncomplete'))
  }
  const canonical = buildCanonicalTrackGeometry(request.track, result.samples.length)
  const stations = matchCenterlineIndices(
    canonical.center,
    result.samples.map((sample) => ({ x: sample.x_m, y: sample.y_m })),
  )
  const events = coalesceSimulationEvents(
    result.markers
      .filter((marker) => marker.kind !== 'brake_end')
      .map((marker) => ({
        kind:
          marker.kind === 'brake_start'
            ? ('brake' as const)
            : marker.kind === 'apex'
              ? ('apex' as const)
              : ('throttle' as const),
        sampleIndex: marker.sample_index,
        label:
          marker.kind === 'brake_start'
            ? t('project.eventBrake', { distance: marker.s_m.toFixed(0) })
            : marker.kind === 'apex'
              ? t('project.eventApex', { speed: (marker.speed_mps * 3.6).toFixed(0) })
              : t('project.eventThrottle', { distance: marker.s_m.toFixed(0) }),
      })),
    result.samples.length,
  )
  return {
    source: 'api',
    solver: `engine-${result.engine_version}`,
    lapTimeS: result.summary.lap_time_s,
    trackLengthM: result.summary.track_length_m,
    maxSpeedMps: result.summary.max_speed_mps,
    minSpeedMps: result.summary.min_speed_mps,
    events,
    warnings: [
      ...result.validation.warnings.map((issue) => issue.message),
      ...result.warnings,
      ...result.assumptions,
    ],
    samples: withStableModes(
      result.samples.map((sample, index) => {
        const throttle = Math.max(0, Math.min(1, sample.throttle))
        const brake = Math.max(0, Math.min(1, sample.brake))
        const station = stations[index]
        return {
          index,
          position: { x: sample.x_m, y: sample.y_m },
          center: canonical.center[station],
          distanceM: sample.s_m,
          // The engine integrates the same trapezoidal clock the browser solver
          // uses; fall back to the station's share of the lap if it is absent.
          elapsedS: Number.isFinite(sample.elapsed_time_s)
            ? sample.elapsed_time_s
            : (index / result.samples.length) * result.summary!.lap_time_s,
          leftBoundary: canonical.left[station],
          rightBoundary: canonical.right[station],
          speedMps: sample.speed_mps,
          throttle,
          brake,
          curvature: Number.isFinite(sample.curvature_1pm)
            ? sample.curvature_1pm
            : curvatureAt(canonical.center, station),
          mode:
            brake > 0.08 ? ('brake' as const) : throttle > 0.08 ? ('throttle' as const) : ('coast' as const),
          ...(typeof sample.heading_rad === 'number' ? { headingRad: sample.heading_rad } : {}),
          ...(typeof sample.longitudinal_accel_mps2 === 'number'
            ? { longitudinalAccelMps2: sample.longitudinal_accel_mps2 }
            : {}),
          ...(typeof sample.lateral_accel_mps2 === 'number'
            ? { lateralAccelMps2: sample.lateral_accel_mps2 }
            : {}),
          ...(typeof sample.friction_utilization === 'number'
            ? { frictionUtilization: sample.friction_utilization }
            : {}),
        }
      }),
    ),
  }
}

/** Apply the same drive-mode stabilisation the browser solver uses. */
function withStableModes(samples: LapSample[]): LapSample[] {
  const modes = stabiliseDriveModes(samples.map((sample) => sample.mode))
  return samples.map((sample, index) => ({ ...sample, mode: modes[index] }))
}
