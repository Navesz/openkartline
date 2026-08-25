import { describe, expect, it } from 'vitest'
import { buildDrivingMarkers } from './markers'
import type { Point } from '../types'

/**
 * A circular lap of `count` stations, so station spacing and wrap-around are
 * both exact and the expected apex positions are known by construction.
 */
function circularLap(count: number, radius: number) {
  const path: Point[] = []
  const station: number[] = []
  const circumference = 2 * Math.PI * radius
  for (let index = 0; index < count; index += 1) {
    const angle = (2 * Math.PI * index) / count
    path.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
    station.push((circumference * index) / count)
  }
  return { path, station, lengthM: circumference }
}

/** Curvature that peaks at the given station indices and is flat elsewhere. */
function curvatureWithPeaksAt(count: number, peaks: number[], peak = 0.2, floor = 0.02) {
  const curvature = new Array<number>(count).fill(floor)
  for (const index of peaks) curvature[index] = peak
  return curvature
}

const flatProfile = (count: number) => ({
  speed: new Array<number>(count).fill(20),
  throttle: new Array<number>(count).fill(0),
  brake: new Array<number>(count).fill(0),
})

describe('apex spacing wraps across the start line', () => {
  it('rejects a second apex that is close to the first the short way round', () => {
    // The gap test is `Math.min(gap, trackLengthM - gap)`, so two apexes either
    // side of station 0 are near neighbours even though their station numbers
    // are far apart. Getting `trackLengthM` wrong makes the second term
    // negative and the pair looks adjacent regardless of where they are.
    // 400 stations on a 628.32 m lap: 1.571 m apart, against a minimum gap of
    // 6.283 m. Stations 1 and 399 are 3.14 m apart the short way, half the gap.
    //
    // At 200 stations the two were 6.2831853071795649 m apart against a
    // minimum of 6.2831853071795862 -- the same number, and the test passed on
    // 2.1e-14 of floating-point noise. Either side of that it decides nothing.
    const count = 400
    const { path, station, lengthM } = circularLap(count, 100)
    // Stations 1 and 399 are one step either side of the start line.
    const curvature = curvatureWithPeaksAt(count, [1, count - 1])

    const markers = buildDrivingMarkers(station, path, curvature, flatProfile(count), lengthM)
    const apexes = markers.filter((marker) => marker.kind === 'apex')

    expect(apexes).toHaveLength(1)
  })

  it('keeps two apexes that are genuinely far apart', () => {
    const count = 400
    const { path, station, lengthM } = circularLap(count, 100)
    // Half a lap apart: 314 m against the same 6.283 m minimum.
    const curvature = curvatureWithPeaksAt(count, [1, count / 2])

    const markers = buildDrivingMarkers(station, path, curvature, flatProfile(count), lengthM)

    expect(markers.filter((marker) => marker.kind === 'apex')).toHaveLength(2)
  })

  it('is sensitive to the length it is given, so passing the wrong one is observable', () => {
    // `simulator.ts` passes the racing line's length because `simulation.py`
    // does. The two differ by up to 25.7 m on the shipped circuits, and the
    // parity fixtures no longer happen to select different apexes when the
    // wrong one is used -- so this pins the sensitivity directly rather than
    // relying on a fixture to expose it.
    // A big lap so the `trackLengthM / 100` term dominates the floor of 4:
    // circumference 3141.6 m over 300 stations, so minimumGap is 31.4 m while
    // the two peaks sit 20.9 m apart. Two stations of separation is the
    // minimum, because a candidate has to be a strict local maximum and
    // neighbouring peaks of equal height are not.
    const count = 300
    const { path, station, lengthM } = circularLap(count, 500)
    const curvature = curvatureWithPeaksAt(count, [10, 12])

    const withCorrectLength = buildDrivingMarkers(
      station,
      path,
      curvature,
      flatProfile(count),
      lengthM,
    ).filter((marker) => marker.kind === 'apex')

    // A length far below the truth shrinks the minimum gap, so a pair the real
    // lap would merge survives.
    const withUnderstatedLength = buildDrivingMarkers(
      station,
      path,
      curvature,
      flatProfile(count),
      lengthM / 10,
    ).filter((marker) => marker.kind === 'apex')

    expect(withCorrectLength).toHaveLength(1)
    expect(withUnderstatedLength).toHaveLength(2)
  })
})

describe('pedal edges', () => {
  it('marks the transition, not every station the pedal is held', () => {
    const count = 40
    const { path, station, lengthM } = circularLap(count, 50)
    const profile = flatProfile(count)
    for (let index = 10; index < 20; index += 1) profile.brake[index] = 0.8
    for (let index = 25; index < 35; index += 1) profile.throttle[index] = 0.9

    const markers = buildDrivingMarkers(station, path, curvatureWithPeaksAt(count, []), profile, lengthM)

    expect(markers.filter((marker) => marker.kind === 'brake_start')).toHaveLength(1)
    expect(markers.filter((marker) => marker.kind === 'brake_end')).toHaveLength(1)
    expect(markers.filter((marker) => marker.kind === 'acceleration_start')).toHaveLength(1)
    expect(markers.find((marker) => marker.kind === 'brake_start')?.sampleIndex).toBe(10)
    expect(markers.find((marker) => marker.kind === 'acceleration_start')?.sampleIndex).toBe(25)
  })

  it('sees a pedal edge that straddles the start line', () => {
    const count = 40
    const { path, station, lengthM } = circularLap(count, 50)
    const profile = flatProfile(count)
    // Braking from station 38 through station 2, across the wrap.
    for (const index of [38, 39, 0, 1, 2]) profile.brake[index] = 0.8

    const markers = buildDrivingMarkers(station, path, curvatureWithPeaksAt(count, []), profile, lengthM)

    expect(markers.find((marker) => marker.kind === 'brake_start')?.sampleIndex).toBe(38)
    expect(markers.find((marker) => marker.kind === 'brake_end')?.sampleIndex).toBe(3)
  })
})

describe('apex count', () => {
  it('never returns more than the limit, however many corners there are', () => {
    const count = 400
    const { path, station, lengthM } = circularLap(count, 500)
    const peaks = Array.from({ length: 60 }, (_, index) => index * 6)

    const markers = buildDrivingMarkers(
      station,
      path,
      curvatureWithPeaksAt(count, peaks),
      flatProfile(count),
      lengthM,
    )

    // Exactly the limit, not merely within it. `toBeLessThanOrEqual` was
    // satisfied by any lower cap too, so lowering `APEX_LIMIT` to 5 -- or to
    // zero -- left this passing. All 60 peaks are 47.1 m apart against a
    // 31.4 m minimum gap, so every one of them is a candidate and the cap is
    // the only thing that decides the count.
    expect(markers.filter((marker) => marker.kind === 'apex')).toHaveLength(20)
  })

  it('ignores curvature below the apex threshold', () => {
    const count = 100
    const { path, station, lengthM } = circularLap(count, 100)
    // Every value under APEX_MIN_CURVATURE = 0.01.
    const curvature = curvatureWithPeaksAt(count, [10, 50], 0.009, 0.001)

    const markers = buildDrivingMarkers(station, path, curvature, flatProfile(count), lengthM)

    expect(markers.filter((marker) => marker.kind === 'apex')).toHaveLength(0)
  })
})
