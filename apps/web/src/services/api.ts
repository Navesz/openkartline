import { coalesceSimulationEvents } from '../domain/events'
import { curvatureAt } from '../domain/geometry'
import { simulateInBrowser } from '../domain/simulator'
import { buildCanonicalTrackGeometry } from '../domain/trackGeometry'
import type { SimulationRequest, SimulationResult } from '../domain/types'

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
): Promise<SimulationResult> {
  if (!preferApi) return simulateInBrowser(request)

  const body = JSON.stringify(toApiRequest(request))
  let response: Response
  try {
    response = await fetchWithTimeout(`${API_BASE}/v1/simulations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } catch (error) {
    if (isAvailabilityFailure(error)) return simulateInBrowser(request)
    throw error
  }
  if (!response.ok) {
    let detail = ''
    try {
      const payload = (await response.json()) as { detail?: unknown }
      detail = typeof payload.detail === 'string' ? payload.detail : ''
    } catch {
      // The HTTP status remains the authoritative error when the body is not JSON.
    }
    throw new ScientificSimulationError(detail || `O motor físico MVP respondeu com HTTP ${response.status}.`)
  }
  return fromApiResult((await response.json()) as ApiResult, request)
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
  throttle: number
  brake: number
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
      total_mass_kg: kart.kartMassKg + kart.driverMassKg,
      power_hp: kart.powerHp,
      top_speed_mps: kart.topSpeedKph / 3.6,
      max_accel_mps2: Math.min(5, kart.gripCoefficient * 9.80665 * 0.52),
      max_brake_mps2: kart.brakeDecelMps2,
      max_lateral_accel_mps2: kart.gripCoefficient * 9.80665,
      drivetrain_efficiency: 0.82,
    },
    settings: {
      schema_version: '1.0',
      sample_count: settings.sampleCount,
      safety_margin_m: settings.safetyMarginM,
    },
  }
}

export function fromApiResult(result: ApiResult, request: SimulationRequest): SimulationResult {
  if (result.status.state !== 'success' || !result.summary || !result.samples.length) {
    const reasons = result.validation.errors.map((issue) => issue.message).join(' ')
    throw new ScientificSimulationError(
      reasons || result.status.message || 'O motor físico MVP não concluiu a simulação.',
    )
  }
  const canonical = buildCanonicalTrackGeometry(request.track, result.samples.length)
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
            ? `Frear em ${marker.s_m.toFixed(0)} m`
            : marker.kind === 'apex'
              ? `Ápice · ${(marker.speed_mps * 3.6).toFixed(0)} km/h`
              : `Acelerar em ${marker.s_m.toFixed(0)} m`,
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
    samples: result.samples.map((sample, index) => {
      const throttle = Math.max(0, Math.min(1, sample.throttle))
      const brake = Math.max(0, Math.min(1, sample.brake))
      return {
        index,
        position: { x: sample.x_m, y: sample.y_m },
        center: canonical.center[index],
        distanceM: sample.s_m,
        leftBoundary: canonical.left[index],
        rightBoundary: canonical.right[index],
        speedMps: sample.speed_mps,
        throttle,
        brake,
        curvature: Number.isFinite(sample.curvature_1pm)
          ? sample.curvature_1pm
          : curvatureAt(canonical.center, index),
        mode:
          brake > 0.08 ? ('brake' as const) : throttle > 0.08 ? ('throttle' as const) : ('coast' as const),
      }
    }),
  }
}
