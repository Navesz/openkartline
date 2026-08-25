import type { Translate } from '../i18n/context'
import { coalesceSimulationEvents } from './events'
import { stabiliseDriveModes } from './driveMode'
import { curvatureAt, distance, normalAt, pathLength } from './geometry'
import {
  brakeAccelMps2,
  driveAccelMps2,
  FRICTION_EXPONENT,
  KART_HALF_WIDTH_M,
  kartEnvelope,
} from './kartModel'
import { buildDrivingMarkers } from './engine/markers'
import { minimumBendingPath } from './engine/minimumBending'
import { pathChannels, prepareTrackGeometry } from './engine/prepareTrack'
import { solveSpeedProfile } from './engine/speedProfile'
import { racingLineOffsets } from './racingLine'
import { buildCanonicalTrackGeometry } from './trackGeometry'
import type { KartInput, LapSample, SimulationEvent, SimulationRequest, SimulationResult } from './types'

export function availableDriveAcceleration(
  speedMps: number,
  lateralAccelerationMps2: number,
  kart: KartInput,
): number {
  return driveAccelMps2(speedMps, lateralAccelerationMps2, kartEnvelope(kart))
}

export function availableBrakingAcceleration(
  lateralAccelerationMps2: number,
  kart: KartInput,
  speedMps = 0,
): number {
  return brakeAccelMps2(speedMps, lateralAccelerationMps2, kartEnvelope(kart))
}

const modeOf = (brake: number, throttle: number): LapSample['mode'] =>
  brake > 0.08 ? 'brake' : throttle > 0.08 ? 'throttle' : 'coast'

/** Default iterations of the minimum-bending optimizer, matching the engine schema. */
const DEFAULT_PATH_SMOOTHING_ITERATIONS = 20

/**
 * Map the engine's driving markers onto the UI's event kinds and labels —
 * the same mapping `fromApiResult` applies to API results.
 */
function eventsFromMarkers(
  markers: ReturnType<typeof buildDrivingMarkers>,
  sampleCount: number,
  t: Translate,
): SimulationEvent[] {
  return coalesceSimulationEvents(
    markers
      .filter((marker) => marker.kind !== 'brake_end')
      .map((marker) => ({
        kind:
          marker.kind === 'brake_start'
            ? ('brake' as const)
            : marker.kind === 'apex'
              ? ('apex' as const)
              : ('throttle' as const),
        sampleIndex: marker.sampleIndex,
        label:
          marker.kind === 'brake_start'
            ? t('project.eventBrake', { distance: marker.sM.toFixed(0) })
            : marker.kind === 'apex'
              ? t('project.eventApex', { speed: (marker.speedMps * 3.6).toFixed(0) })
              : t('project.eventThrottle', { distance: marker.sM.toFixed(0) }),
      })),
    sampleCount,
  )
}

/**
 * Browser pipeline equivalent to the Python engine: the same corridor
 * preparation, the same minimum-bending line optimizer, and the same iterative
 * speed-profile solver, ported module by module under `domain/engine/`.
 *
 * The input corridor is exactly the one `toApiRequest` would send to the local
 * API, so the demo and the engine solve identical geometry; the parity gate in
 * `engine/engineParity.test.ts` holds the two implementations together.
 */
function simulateWithMinimumBending(request: SimulationRequest, t: Translate): SimulationResult {
  const { track, kart, settings } = request
  const canonical = buildCanonicalTrackGeometry(track, settings.sampleCount)
  // The engine constrains the line's centre, so the margin it receives has to
  // include half a kart on top of the driver's own buffer — as in toApiRequest.
  const engineSafetyMarginM = settings.safetyMarginM + KART_HALF_WIDTH_M
  const prepared = prepareTrackGeometry(canonical.left, canonical.right, track.direction, {
    sampleCount: settings.sampleCount,
    safetyMarginM: engineSafetyMarginM,
  })
  const { path, diagnostics } = minimumBendingPath(prepared, {
    safetyMarginM: engineSafetyMarginM,
    iterations: settings.pathSmoothingIterations ?? DEFAULT_PATH_SMOOTHING_ITERATIONS,
  })
  const { station, segmentLengths, heading, curvature } = pathChannels(path)
  const profile = solveSpeedProfile(curvature, segmentLengths, kartEnvelope(kart), {
    frictionExponent: FRICTION_EXPONENT,
  })

  const samples: LapSample[] = path.map((position, index) => ({
    index,
    position,
    center: prepared.center[index],
    leftBoundary: prepared.left[index],
    rightBoundary: prepared.right[index],
    distanceM: station[index],
    elapsedS: profile.elapsed[index],
    speedMps: profile.speed[index],
    throttle: profile.throttle[index],
    brake: profile.brake[index],
    curvature: curvature[index],
    mode: modeOf(profile.brake[index], profile.throttle[index]),
    headingRad: heading[index],
    longitudinalAccelMps2: profile.longitudinalAccel[index],
    lateralAccelMps2: profile.lateralAccel[index],
    frictionUtilization: profile.frictionUtilization[index],
  }))
  const stableModes = stabiliseDriveModes(samples.map((sample) => sample.mode))
  stableModes.forEach((mode, index) => {
    samples[index].mode = mode
  })

  const warnings = [
    t('project.warningMvpEstimate'),
    ...(track.widthM < 5 ? [t('project.warningNarrowTrack')] : []),
    ...(diagnostics.converged ? [] : [t('project.warningNotConverged')]),
  ]
  // The apex spacing rule wraps with `trackLengthM - gap`, so this has to be
  // the length of the racing line the stations sit on -- `simulation.py:233`
  // passes `path_length`. Passing the centerline's length made that term
  // negative for apex pairs straddling s = 0 and changed which apexes survived.
  const pathLengthM = segmentLengths.reduce((sum, length) => sum + length, 0)
  return {
    source: 'browser',
    solver: 'browser-minimum-bending-v1',
    lapTimeS: profile.lapTimeS,
    trackLengthM: pathLengthM,
    maxSpeedMps: Math.max(...profile.speed),
    minSpeedMps: Math.min(...profile.speed),
    samples,
    events: eventsFromMarkers(
      buildDrivingMarkers(station, path, curvature, profile, pathLengthM),
      samples.length,
      t,
    ),
    warnings,
  }
}

function buildEvents(samples: LapSample[], t: Translate): SimulationEvent[] {
  const events: SimulationEvent[] = []
  samples.forEach((sample, index) => {
    const previous = samples[(index - 1 + samples.length) % samples.length]
    if (sample.brake > 0.2 && previous.brake <= 0.2) {
      events.push({
        kind: 'brake',
        sampleIndex: index,
        label: t('project.eventBrake', { distance: sample.distanceM.toFixed(0) }),
      })
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
        label: t('project.eventApex', { speed: (sample.speedMps * 3.6).toFixed(0) }),
      })
    }
    if (sample.throttle > 0.35 && previous.throttle <= 0.35) {
      events.push({
        kind: 'throttle',
        sampleIndex: index,
        label: t('project.eventThrottle', { distance: sample.distanceM.toFixed(0) }),
      })
    }
  })
  return coalesceSimulationEvents(events, samples.length)
}

/**
 * Original anchor-heuristic browser solver, kept as the defensive fallback: if
 * the ported engine ever rejects a corridor the editor itself accepted, the
 * demo still answers with a driveable baseline instead of an error screen.
 */
function simulateWithAnchorHeuristic(request: SimulationRequest, t: Translate): SimulationResult {
  const { track, kart, settings } = request
  const canonical = buildCanonicalTrackGeometry(track, settings.sampleCount)
  const center = canonical.center
  // The line is the kart's centre, so half a kart never fits outside the edge.
  const halfUsableWidth = Math.max(0, track.widthM / 2 - KART_HALF_WIDTH_M - settings.safetyMarginM)
  const offsets = racingLineOffsets(center, halfUsableWidth)
  const line = center.map((point, index) => {
    const normal = normalAt(center, index)
    return { x: point.x + normal.x * offsets[index], y: point.y + normal.y * offsets[index] }
  })
  const curvature = line.map((_, index) => curvatureAt(line, index))
  const envelope = kartEnvelope(kart)
  const { topSpeedMps: topSpeed, maxLateralAccelMps2: maximumLateral } = envelope
  const speeds = curvature.map((value) =>
    Math.min(topSpeed, Math.sqrt(maximumLateral / Math.max(0.0005, Math.abs(value)))),
  )
  const segmentLengths = line.map((point, index) => distance(point, line[(index + 1) % line.length]))

  for (let pass = 0; pass < 6; pass += 1) {
    for (let index = 0; index < line.length; index += 1) {
      const next = (index + 1) % line.length
      const lateralAcceleration = speeds[index] ** 2 * Math.abs(curvature[index])
      const acceleration = driveAccelMps2(speeds[index], lateralAcceleration, envelope)
      speeds[next] = Math.min(
        speeds[next],
        Math.sqrt(speeds[index] ** 2 + 2 * acceleration * segmentLengths[index]),
      )
    }
    for (let index = line.length - 1; index >= 0; index -= 1) {
      const next = (index + 1) % line.length
      const lateralAcceleration = speeds[next] ** 2 * Math.abs(curvature[next])
      const brakingAvailable = brakeAccelMps2(speeds[next], lateralAcceleration, envelope)
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
  // Trapezoidal segment times, accumulated once so that the per-sample clock and
  // the reported lap time cannot drift apart.
  const segmentTimes = segmentLengths.map(
    (length, index) => length / Math.max(0.01, (speeds[index] + speeds[(index + 1) % line.length]) / 2),
  )
  let elapsed = 0
  const samples: LapSample[] = line.map((position, index) => {
    const acceleration = longitudinalAcceleration[index]
    const driveAvailable = driveAccelMps2(
      speeds[index],
      speeds[index] ** 2 * Math.abs(curvature[index]),
      envelope,
    )
    const next = (index + 1) % line.length
    const brakingAvailable = brakeAccelMps2(
      speeds[next],
      speeds[next] ** 2 * Math.abs(curvature[next]),
      envelope,
    )
    const throttle = acceleration > 0.08 ? Math.min(1, acceleration / Math.max(0.1, driveAvailable)) : 0
    const brake = acceleration < -0.08 ? Math.min(1, -acceleration / Math.max(0.1, brakingAvailable)) : 0
    const sample: LapSample = {
      index,
      position,
      center: center[index],
      leftBoundary: canonical.left[index],
      rightBoundary: canonical.right[index],
      distanceM: cumulative,
      elapsedS: elapsed,
      speedMps: speeds[index],
      throttle,
      brake,
      curvature: curvature[index],
      mode: brake > 0.08 ? 'brake' : throttle > 0.08 ? 'throttle' : 'coast',
    }
    cumulative += segmentLengths[index]
    elapsed += segmentTimes[index]
    return sample
  })

  // Classify each sample first, then drop bands too short to be a real input.
  const stableModes = stabiliseDriveModes(samples.map((sample) => sample.mode))
  stableModes.forEach((mode, index) => {
    samples[index].mode = mode
  })

  const lapTimeS = segmentTimes.reduce((sum, time) => sum + time, 0)
  const warnings = [
    t('project.warningMvpEstimate'),
    ...(track.widthM < 5 ? [t('project.warningNarrowTrack')] : []),
  ]
  return {
    source: 'browser',
    solver: 'browser-point-mass-v1',
    lapTimeS,
    trackLengthM: pathLength(line),
    maxSpeedMps: Math.max(...speeds),
    minSpeedMps: Math.min(...speeds),
    samples,
    events: buildEvents(samples, t),
    warnings,
  }
}

export function simulateInBrowser(request: SimulationRequest, t: Translate): SimulationResult {
  try {
    return simulateWithMinimumBending(request, t)
  } catch (error) {
    // The ported engine mirrors the API's strictness; the demo must still
    // answer when an edge case slips past client-side validation. But the
    // answer comes from a different model -- measured 6.7% apart on the shipped
    // presets -- so it is marked here, at the failure, rather than inside the
    // heuristic, which is a legitimate solver in its own right.
    console.warn('Minimum-bending engine unavailable, using anchor heuristic:', error)
    const fallback = simulateWithAnchorHeuristic(request, t)
    return { ...fallback, warnings: [t('project.warningSolverFallback'), ...fallback.warnings] }
  }
}
