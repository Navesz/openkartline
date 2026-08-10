import { describe, expect, it } from 'vitest'
import { distance, signedArea } from '../geometry'
import type { Direction, Point } from '../types'
import { alignSamples, pathChannels, prepareTrackGeometry, resampleClosedSpline } from './prepareTrack'

function circlePoints(radius: number, count: number): Point[] {
  const step = (2 * Math.PI) / count
  return Array.from({ length: count }, (_, index) => ({
    x: radius * Math.cos(index * step),
    y: radius * Math.sin(index * step),
  }))
}

/** Radially offset oval boundaries, mirroring the Python `track_factory` fixture. */
function ovalBoundaries(options: {
  radiusX?: number
  radiusY?: number
  width?: number
  count?: number
  direction?: Direction
}): { left: Point[]; right: Point[]; direction: Direction } {
  const radiusX = options.radiusX ?? 40
  const radiusY = options.radiusY ?? 20
  const width = options.width ?? 4
  const count = options.count ?? 80
  const direction = options.direction ?? 'counterclockwise'
  const innerScale = 1 - width / (2 * Math.min(radiusX, radiusY))
  const outerScale = 1 + width / (2 * Math.min(radiusX, radiusY))
  const step = (2 * Math.PI) / count
  const inner: Point[] = []
  const outer: Point[] = []
  for (let index = 0; index < count; index += 1) {
    const theta = index * step
    inner.push({ x: radiusX * innerScale * Math.cos(theta), y: radiusY * innerScale * Math.sin(theta) })
    outer.push({ x: radiusX * outerScale * Math.cos(theta), y: radiusY * outerScale * Math.sin(theta) })
  }
  if (direction === 'counterclockwise') return { left: inner, right: outer, direction }
  return { left: [...outer].reverse(), right: [...inner].reverse(), direction }
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function closedSegmentLengths(points: Point[]): number[] {
  return points.map((point, index) => distance(point, points[(index + 1) % points.length]))
}

describe('resampleClosedSpline', () => {
  it('resamples a closed curve uniformly without repeating the endpoint', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]
    const sampled = resampleClosedSpline(square, 8)
    expect(sampled).toHaveLength(8)
    expect(sampled[0]).not.toEqual(sampled[sampled.length - 1])
    const lengths = closedSegmentLengths(sampled)
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(1e-10)
  })

  it.each([64, 128, 512])('matches an analytic circle at %i samples', (sampleCount) => {
    const controls = circlePoints(20, 32)
    const sampled = resampleClosedSpline(controls, sampleCount)
    const radii = sampled.map((point) => Math.hypot(point.x, point.y))
    const { segmentLengths, curvature } = pathChannels(sampled)
    const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0)

    expect(sampled).toHaveLength(sampleCount)
    expect(sampled[0]).not.toEqual(sampled[sampled.length - 1])
    expect(Math.max(...segmentLengths) / Math.min(...segmentLengths)).toBeLessThan(1.002)
    expect(Math.abs(mean(radii) - 20)).toBeLessThan(0.01)
    expect(Math.abs(totalLength / (40 * Math.PI) - 1)).toBeLessThan(5e-4)
    expect(Math.abs(median(curvature) / (1 / 20) - 1)).toBeLessThan(0.01)
  })

  it('passes back through the control points of an equal-arc input', () => {
    const controls = circlePoints(20, 32)
    const sampled = resampleClosedSpline(controls, controls.length)
    expect(sampled).toHaveLength(controls.length)
    sampled.forEach((point, index) => {
      expect(distance(point, controls[index])).toBeLessThan(1e-6)
    })
  })

  it('rejects a curve with fewer than three distinct points', () => {
    expect(() =>
      resampleClosedSpline(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 0, y: 0 },
        ],
        8,
      ),
    ).toThrow(/TOO_FEW_POINTS/)
    expect(() =>
      resampleClosedSpline(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        8,
      ),
    ).toThrow(/TOO_FEW_POINTS/)
  })
})

describe('alignSamples', () => {
  it('rotates a shifted candidate back onto the reference', () => {
    const reference = circlePoints(20, 64)
    const offset = 17
    const candidate = reference.map((_, index) => reference[(index + offset) % reference.length])
    expect(alignSamples(reference, candidate)).toEqual(reference)
  })
})

describe('prepareTrackGeometry', () => {
  it('prepares a circular corridor with the expected width', () => {
    const { left, right, direction } = ovalBoundaries({ radiusX: 20, radiusY: 20, width: 4, count: 360 })
    const prepared = prepareTrackGeometry(left, right, direction, { sampleCount: 192, safetyMarginM: 0.35 })
    expect(prepared.left).toHaveLength(192)
    expect(prepared.right).toHaveLength(192)
    expect(Math.abs(mean(prepared.widths) - 4)).toBeLessThan(0.08)
    expect(Math.abs(prepared.lengthM / (40 * Math.PI) - 1)).toBeLessThan(5e-4)
  })

  it('normalizes the travel direction onto the centerline', () => {
    const clockwise = ovalBoundaries({ direction: 'clockwise' })
    const counterclockwise = ovalBoundaries({ direction: 'counterclockwise' })
    const options = { sampleCount: 128, safetyMarginM: 0.2 }
    expect(
      signedArea(prepareTrackGeometry(clockwise.left, clockwise.right, clockwise.direction, options).center),
    ).toBeLessThan(0)
    expect(
      signedArea(
        prepareTrackGeometry(
          counterclockwise.left,
          counterclockwise.right,
          counterclockwise.direction,
          options,
        ).center,
      ),
    ).toBeGreaterThan(0)
  })

  it('is deterministic across repeated runs', () => {
    const { left, right, direction } = ovalBoundaries({ count: 180 })
    const options = { sampleCount: 96, safetyMarginM: 0.2 }
    expect(prepareTrackGeometry(left, right, direction, options)).toEqual(
      prepareTrackGeometry(left, right, direction, options),
    )
  })

  it('rejects a boundary with fewer than three distinct points', () => {
    const { right } = ovalBoundaries({})
    expect(() =>
      prepareTrackGeometry(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        right,
        'counterclockwise',
        {
          sampleCount: 64,
          safetyMarginM: 0.2,
        },
      ),
    ).toThrow(/TOO_FEW_POINTS/)
  })
})

describe('pathChannels', () => {
  it('reports zero-based cumulative station and positive segment lengths', () => {
    const count = 96
    const { station, segmentLengths, heading } = pathChannels(circlePoints(20, count))
    expect(station[0]).toBe(0)
    expect(segmentLengths.every((length) => length > 0)).toBe(true)
    // A raw polygon's closed length is its chord perimeter, not the circle's.
    const polygonPerimeter = 2 * count * 20 * Math.sin(Math.PI / count)
    expect(station[station.length - 1] + segmentLengths[segmentLengths.length - 1]).toBeCloseTo(
      polygonPerimeter,
      9,
    )
    expect(heading.every((angle) => Number.isFinite(angle))).toBe(true)
  })
})
