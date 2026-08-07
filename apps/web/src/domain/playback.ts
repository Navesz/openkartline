import type { DriveMode, Point, SimulationResult } from './types'

/**
 * Lap playback derived from the simulated clock.
 *
 * Playback rate scales the wall-clock speed of the replay only. The lap time,
 * the speed profile and the brake and throttle points are simulation output and
 * never change with the rate: at 3x a 30 s lap plays back in 10 s, and every
 * consumer reads the same `elapsedS` so the kart, the chart cursor and the
 * telemetry readout can never drift apart.
 */

export const PLAYBACK_RATES = [1, 2, 3] as const
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

export interface PlaybackFrame {
  /** Simulated seconds since the start line. */
  elapsedS: number
  /** Nearest sample, for the panels that work in sample indices. */
  index: number
  position: Point
  headingRad: number
  speedMps: number
  distanceM: number
  throttle: number
  brake: number
  mode: DriveMode
}

/** Wrap a time onto the closed lap so playback loops without a seam. */
export function wrapElapsed(elapsedS: number, lapTimeS: number): number {
  if (!(lapTimeS > 0) || !Number.isFinite(elapsedS)) return 0
  return ((elapsedS % lapTimeS) + lapTimeS) % lapTimeS
}

/** Index of the segment containing `elapsedS`, by binary search. */
function segmentAt(samples: SimulationResult['samples'], elapsedS: number): number {
  let low = 0
  let high = samples.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (samples[middle].elapsedS <= elapsedS) low = middle
    else high = middle - 1
  }
  return low
}

export function frameAtElapsed(result: SimulationResult | null, elapsedS: number): PlaybackFrame | null {
  if (!result || result.samples.length < 2 || !(result.lapTimeS > 0)) return null
  const time = wrapElapsed(elapsedS, result.lapTimeS)
  const index = segmentAt(result.samples, time)
  const current = result.samples[index]
  const next = result.samples[(index + 1) % result.samples.length]
  // The last segment closes the lap, so its end time is the lap time itself
  // rather than the wrapped-around zero stored on sample 0.
  const closing = index === result.samples.length - 1
  const endS = closing ? result.lapTimeS : next.elapsedS
  // Distance wraps to zero on sample 0, so the closing segment ends at the full
  // lap length instead of running backwards to the start line.
  const endDistanceM = closing ? result.trackLengthM : next.distanceM
  const span = endS - current.elapsedS
  const ratio = span > 0 ? Math.min(1, Math.max(0, (time - current.elapsedS) / span)) : 0
  const dx = next.position.x - current.position.x
  const dy = next.position.y - current.position.y
  return {
    elapsedS: time,
    index,
    position: { x: current.position.x + dx * ratio, y: current.position.y + dy * ratio },
    headingRad: Math.atan2(dy, dx),
    speedMps: current.speedMps + (next.speedMps - current.speedMps) * ratio,
    distanceM: current.distanceM + (endDistanceM - current.distanceM) * ratio,
    // Throttle, brake and mode describe the segment the kart is on, not its
    // endpoints, so they must not be interpolated into values never commanded.
    throttle: current.throttle,
    brake: current.brake,
    mode: current.mode,
  }
}
