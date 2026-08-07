import { coalesceSimulationEvents } from './events'
import { curvatureAt, distance, normalAt, pathLength } from './geometry'
import { buildCanonicalTrackGeometry } from './trackGeometry'
import type {
  DriveMode,
  KartInput,
  LapSample,
  SimulationEvent,
  SimulationRequest,
  SimulationResult,
} from './types'

const G = 9.80665
const HP_TO_WATTS = 745.7
const FRICTION_EXPONENT = 2

function remainingGripFraction(lateralAcceleration: number, maximumLateral: number): number {
  const lateralFraction = Math.min(1, Math.abs(lateralAcceleration) / maximumLateral)
  return Math.max(0, 1 - lateralFraction ** FRICTION_EXPONENT) ** (1 / FRICTION_EXPONENT)
}

export function availableDriveAcceleration(
  speedMps: number,
  lateralAccelerationMps2: number,
  kart: KartInput,
): number {
  const topSpeedMps = kart.topSpeedKph / 3.6
  if (speedMps >= topSpeedMps) return 0
  const totalMass = kart.kartMassKg + kart.driverMassKg
  const powerLimited = (kart.powerHp * HP_TO_WATTS * 0.82) / (totalMass * Math.max(speedMps, 1))
  const topSpeedTaper = Math.max(0, 1 - (speedMps / topSpeedMps) ** 4)
  const driveEnvelope = powerLimited * topSpeedTaper
  const maximumLongitudinal = kart.gripCoefficient * G * 0.52
  const maximumLateral = kart.gripCoefficient * G
  const tireLimited = maximumLongitudinal * remainingGripFraction(lateralAccelerationMps2, maximumLateral)
  return Math.max(0, Math.min(driveEnvelope, tireLimited))
}

export function availableBrakingAcceleration(lateralAccelerationMps2: number, kart: KartInput): number {
  return kart.brakeDecelMps2 * remainingGripFraction(lateralAccelerationMps2, kart.gripCoefficient * G)
}

function smoothCircular(values: number[], passes = 3): number[] {
  let current = [...values]
  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map(
      (value, index) =>
        (current[(index - 1 + current.length) % current.length] +
          value * 2 +
          current[(index + 1) % current.length]) /
        4,
    )
  }
  return current
}

function buildEvents(samples: LapSample[]): SimulationEvent[] {
  const events: SimulationEvent[] = []
  samples.forEach((sample, index) => {
    const previous = samples[(index - 1 + samples.length) % samples.length]
    if (sample.brake > 0.2 && previous.brake <= 0.2) {
      events.push({ kind: 'brake', sampleIndex: index, label: `Frear em ${sample.distanceM.toFixed(0)} m` })
    }
    let isApex = Math.abs(sample.curvature) > 0.012
    for (let offset = -5; offset <= 5 && isApex; offset += 1) {
      if (
        offset !== 0 &&
        Math.abs(samples[(index + offset + samples.length) % samples.length].curvature) >
          Math.abs(sample.curvature)
      ) {
        isApex = false
      }
    }
    if (isApex) {
      events.push({
        kind: 'apex',
        sampleIndex: index,
        label: `Ápice · ${(sample.speedMps * 3.6).toFixed(0)} km/h`,
      })
    }
    if (sample.throttle > 0.35 && previous.throttle <= 0.35) {
      events.push({
        kind: 'throttle',
        sampleIndex: index,
        label: `Acelerar em ${sample.distanceM.toFixed(0)} m`,
      })
    }
  })
  return coalesceSimulationEvents(events, samples.length)
}

export function simulateInBrowser(request: SimulationRequest): SimulationResult {
  const { track, kart, settings } = request
  const canonical = buildCanonicalTrackGeometry(track, settings.sampleCount)
  const center = canonical.center
  const halfUsableWidth = Math.max(0.25, track.widthM / 2 - settings.safetyMarginM)
  const centerCurvature = center.map((_, index) => curvatureAt(center, index))
  const localPeak = centerCurvature.map((_, index) => {
    let peak = 0
    for (let offset = -8; offset <= 8; offset += 1) {
      peak = Math.max(peak, Math.abs(centerCurvature[(index + offset + center.length) % center.length]))
    }
    return peak
  })
  const rawOffsets = centerCurvature.map((curvature, index) => {
    if (Math.abs(curvature) < 0.0015) return 0
    const apexRatio = Math.min(1, Math.abs(curvature) / Math.max(0.0015, localPeak[index]))
    return Math.sign(curvature) * (apexRatio * 2 - 1) * halfUsableWidth * 0.62
  })
  const offsets = smoothCircular(rawOffsets, 6)
  const line = center.map((point, index) => {
    const normal = normalAt(center, index)
    return { x: point.x + normal.x * offsets[index], y: point.y + normal.y * offsets[index] }
  })
  const curvature = line.map((_, index) => curvatureAt(line, index))
  const topSpeed = kart.topSpeedKph / 3.6
  const maximumLateral = kart.gripCoefficient * G
  const speeds = curvature.map((value) =>
    Math.min(topSpeed, Math.sqrt(maximumLateral / Math.max(0.0005, Math.abs(value)))),
  )
  const segmentLengths = line.map((point, index) => distance(point, line[(index + 1) % line.length]))

  for (let pass = 0; pass < 6; pass += 1) {
    for (let index = 0; index < line.length; index += 1) {
      const next = (index + 1) % line.length
      const lateralAcceleration = speeds[index] ** 2 * Math.abs(curvature[index])
      const acceleration = availableDriveAcceleration(speeds[index], lateralAcceleration, kart)
      speeds[next] = Math.min(
        speeds[next],
        Math.sqrt(speeds[index] ** 2 + 2 * acceleration * segmentLengths[index]),
      )
    }
    for (let index = line.length - 1; index >= 0; index -= 1) {
      const next = (index + 1) % line.length
      const lateralAcceleration = speeds[next] ** 2 * Math.abs(curvature[next])
      const brakingAvailable = availableBrakingAcceleration(lateralAcceleration, kart)
      speeds[index] = Math.min(
        speeds[index],
        Math.sqrt(speeds[next] ** 2 + 2 * brakingAvailable * segmentLengths[index]),
      )
    }
  }

  let cumulative = 0
  const longitudinalAcceleration = speeds.map((speed, index) => {
    const next = (index + 1) % line.length
    return (speeds[next] ** 2 - speed ** 2) / Math.max(0.1, 2 * segmentLengths[index])
  })
  const samples: LapSample[] = line.map((position, index) => {
    const acceleration = longitudinalAcceleration[index]
    const driveAvailable = availableDriveAcceleration(
      speeds[index],
      speeds[index] ** 2 * Math.abs(curvature[index]),
      kart,
    )
    const next = (index + 1) % line.length
    const brakingAvailable = availableBrakingAcceleration(speeds[next] ** 2 * Math.abs(curvature[next]), kart)
    const throttle = acceleration > 0.08 ? Math.min(1, acceleration / Math.max(0.1, driveAvailable)) : 0
    const brake = acceleration < -0.08 ? Math.min(1, -acceleration / Math.max(0.1, brakingAvailable)) : 0
    const mode: DriveMode = brake > 0.08 ? 'brake' : throttle > 0.08 ? 'throttle' : 'coast'
    const sample: LapSample = {
      index,
      position,
      center: center[index],
      leftBoundary: canonical.left[index],
      rightBoundary: canonical.right[index],
      distanceM: cumulative,
      speedMps: speeds[index],
      throttle,
      brake,
      curvature: curvature[index],
      mode,
    }
    cumulative += segmentLengths[index]
    return sample
  })

  const lapTimeS = samples.reduce((sum, sample, index) => {
    const next = samples[(index + 1) % samples.length]
    return sum + segmentLengths[index] / Math.max(0.01, (sample.speedMps + next.speedMps) / 2)
  }, 0)
  const warnings = [
    'Estimativa do motor físico MVP; valide as referências gradualmente na pista.',
    ...(track.widthM < 5 ? ['Pista estreita: a margem disponível para ajustar a trajetória é pequena.'] : []),
  ]
  return {
    source: 'browser',
    solver: 'browser-point-mass-v1',
    lapTimeS,
    trackLengthM: pathLength(line),
    maxSpeedMps: Math.max(...speeds),
    minSpeedMps: Math.min(...speeds),
    samples,
    events: buildEvents(samples),
    warnings,
  }
}
