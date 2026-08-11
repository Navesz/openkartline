import type { Point } from '../types'
import type { SpeedProfileResult } from './speedProfile'

/**
 * Driving markers ported 1:1 from `_driving_markers` in
 * `engine/openkartline_engine/simulation.py`, so the browser demo announces
 * the same braking, acceleration, and apex references as the Python engine.
 */

export type DrivingMarkerKind = 'brake_start' | 'brake_end' | 'acceleration_start' | 'apex'

export interface DrivingMarker {
  kind: DrivingMarkerKind
  sampleIndex: number
  sM: number
  position: Point
  speedMps: number
}

/** Pedal activity thresholds, identical to the Python engine. */
const PEDAL_ACTIVE = 0.05
/** A curvature peak below this magnitude is not an apex worth announcing. */
const APEX_MIN_CURVATURE = 0.01
/** At most this many apexes are reported per lap. */
const APEX_LIMIT = 20

export function buildDrivingMarkers(
  station: number[],
  path: Point[],
  curvature: number[],
  profile: Pick<SpeedProfileResult, 'speed' | 'throttle' | 'brake'>,
  trackLengthM: number,
): DrivingMarker[] {
  const count = path.length
  const markers: DrivingMarker[] = []
  const at = (kind: DrivingMarkerKind, index: number): DrivingMarker => ({
    kind,
    sampleIndex: index,
    sM: station[index],
    position: path[index],
    speedMps: profile.speed[index],
  })

  for (let index = 0; index < count; index += 1) {
    const previous = (index - 1 + count) % count
    const brakeActive = profile.brake[index] > PEDAL_ACTIVE
    const brakeWasActive = profile.brake[previous] > PEDAL_ACTIVE
    const accelActive = profile.throttle[index] > PEDAL_ACTIVE
    const accelWasActive = profile.throttle[previous] > PEDAL_ACTIVE
    if (brakeActive && !brakeWasActive) markers.push(at('brake_start', index))
    if (!brakeActive && brakeWasActive) markers.push(at('brake_end', index))
    if (accelActive && !accelWasActive) markers.push(at('acceleration_start', index))
  }

  const magnitude = curvature.map((value) => Math.abs(value))
  const candidates: number[] = []
  for (let index = 0; index < count; index += 1) {
    if (
      magnitude[index] >= magnitude[(index - 1 + count) % count] &&
      magnitude[index] > magnitude[(index + 1) % count] &&
      magnitude[index] > APEX_MIN_CURVATURE
    ) {
      candidates.push(index)
    }
  }
  // Greedy selection from the tightest apex down, keeping a minimum circular
  // station gap so one corner cannot announce a cluster of near-duplicate apexes.
  const minimumGap = Math.max(4, trackLengthM / 100)
  const selected: number[] = []
  for (const index of candidates.sort((a, b) => magnitude[b] - magnitude[a])) {
    const clear = selected.every((other) => {
      const gap = Math.abs(station[index] - station[other])
      return Math.min(gap, trackLengthM - gap) >= minimumGap
    })
    if (clear) selected.push(index)
    if (selected.length >= APEX_LIMIT) break
  }
  for (const index of selected.sort((a, b) => a - b)) {
    markers.push(at('apex', index))
  }

  const kindOrder: Record<DrivingMarkerKind, string> = {
    acceleration_start: 'acceleration_start',
    apex: 'apex',
    brake_end: 'brake_end',
    brake_start: 'brake_start',
  }
  return markers.sort((a, b) => a.sM - b.sM || kindOrder[a.kind].localeCompare(kindOrder[b.kind]))
}
