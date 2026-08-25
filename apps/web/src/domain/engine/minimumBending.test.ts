import { describe, expect, it } from 'vitest'
import type { Direction, Point } from '../types'
import { minimumBendingPath } from './minimumBending'
import { pathChannels, prepareTrackGeometry } from './prepareTrack'

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

describe('minimumBendingPath', () => {
  it('moves the line towards the outer radius of a circular corridor', () => {
    const { left, right, direction } = ovalBoundaries({ radiusX: 20, radiusY: 20, width: 4, count: 360 })
    const prepared = prepareTrackGeometry(left, right, direction, { sampleCount: 192, safetyMarginM: 0.35 })
    const { path, diagnostics } = minimumBendingPath(prepared, { safetyMarginM: 0.35, iterations: 20 })
    const { station, segmentLengths, curvature } = pathChannels(path)

    expect(station[0]).toBe(0)
    expect(segmentLengths.every((length) => length > 0)).toBe(true)
    expect(median(curvature.map((value) => Math.abs(value)))).toBeLessThan(1 / 20)
    expect(diagnostics.finalObjective).toBeLessThan(diagnostics.initialObjective)
    expect(diagnostics.minCorridorFraction).toBeGreaterThanOrEqual(0.35 / 4 - 1e-8)
    expect(diagnostics.maxCorridorFraction).toBeLessThanOrEqual(1 - 0.35 / 4 + 1e-8)
    // For counterclockwise travel the right boundary is the outer circle. A
    // minimum-bending circle should use its larger permitted radius.
    expect(mean(path.map((point) => Math.hypot(point.x, point.y)))).toBeGreaterThan(21)
  })

  it('reduces the bending objective monotonically over iterations', () => {
    const { left, right, direction } = ovalBoundaries({ radiusX: 20, radiusY: 20, width: 4, count: 180 })
    const prepared = prepareTrackGeometry(left, right, direction, { sampleCount: 96, safetyMarginM: 0.35 })
    let previousObjective = Infinity
    for (const iterations of [0, 1, 2, 3, 4, 5, 6]) {
      const { diagnostics } = minimumBendingPath(prepared, { safetyMarginM: 0.35, iterations })
      expect(diagnostics.finalObjective).toBeLessThanOrEqual(previousObjective)
      previousObjective = diagnostics.finalObjective
    }
  })

  it('respects the corridor bounds at every station', () => {
    const { left, right, direction } = ovalBoundaries({ radiusX: 40, radiusY: 20, width: 4, count: 180 })
    const prepared = prepareTrackGeometry(left, right, direction, { sampleCount: 96, safetyMarginM: 0.2 })
    const { diagnostics } = minimumBendingPath(prepared, { safetyMarginM: 0.2, iterations: 40 })
    const lowestBound = Math.min(...prepared.widths.map((width) => 0.2 / width))
    expect(diagnostics.minCorridorFraction).toBeGreaterThanOrEqual(lowestBound - 1e-8)
    expect(diagnostics.maxCorridorFraction).toBeLessThanOrEqual(1 - lowestBound + 1e-8)
  })

  it('is deterministic across repeated runs', () => {
    const { left, right, direction } = ovalBoundaries({ count: 180 })
    const prepared = prepareTrackGeometry(left, right, direction, { sampleCount: 96, safetyMarginM: 0.2 })
    const options = { safetyMarginM: 0.2, iterations: 25 }
    expect(minimumBendingPath(prepared, options)).toEqual(minimumBendingPath(prepared, options))
  })

  it('skips cleanly with zero iterations', () => {
    const { left, right, direction } = ovalBoundaries({ radiusX: 20, radiusY: 20, width: 4, count: 180 })
    const prepared = prepareTrackGeometry(left, right, direction, { sampleCount: 96, safetyMarginM: 0.35 })
    const { path, diagnostics } = minimumBendingPath(prepared, { safetyMarginM: 0.35, iterations: 0 })

    expect(diagnostics.terminationReason).toBe('skipped')
    expect(diagnostics.iterations).toBe(0)
    expect(diagnostics.converged).toBe(false)
    expect(diagnostics.finalObjective).toBe(diagnostics.initialObjective)
    expect(diagnostics.maxFractionStep).toBe(0)
    expect(diagnostics.minCorridorFraction).toBe(0.5)
    expect(diagnostics.maxCorridorFraction).toBe(0.5)
    // A uniform 0.5 corridor fraction is the centreline, up to float roundoff.
    path.forEach((point, index) => {
      expect(point.x).toBeCloseTo(prepared.center[index].x, 12)
      expect(point.y).toBeCloseTo(prepared.center[index].y, 12)
    })
  })
})

/** A ring, whose minimum-bending optimum is the largest circle the margin allows. */
function annulusBoundaries(innerM = 18, outerM = 22, count = 360) {
  const ring = (radius: number): Point[] =>
    Array.from({ length: count }, (_, index) => {
      const angle = (2 * Math.PI * index) / count
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
    })
  return { left: ring(innerM), right: ring(outerM), direction: 'counterclockwise' as Direction }
}

describe('minimumBendingPath at the analytic optimum', () => {
  it.each([20, 60, 200])('reports convergence rather than no_progress (%i iterations)', (iterations) => {
    // A stalled line search at the optimum is convergence. The search tries
    // both directions with 16 halvings from `0.08 / max|free|`, so its smallest
    // offer is ≈1.2e-6 — below the 1e-5 step tolerance this same function
    // trusts. Gating on the KKT residual reported failure here, because that
    // residual comes from a finite-difference gradient and a flat objective
    // makes it roundoff.
    const margin = 0.35
    const { left, right, direction } = annulusBoundaries()
    const prepared = prepareTrackGeometry(left, right, direction, {
      sampleCount: 300,
      safetyMarginM: margin,
    })

    const { path, diagnostics } = minimumBendingPath(prepared, {
      safetyMarginM: margin,
      iterations,
    })

    const optimumRadius = 22 - margin
    const worstError = Math.max(
      ...path.map((point) => Math.abs(Math.hypot(point.x, point.y) - optimumRadius)),
    )
    expect(worstError).toBeLessThan(1e-3)
    expect(diagnostics.finalObjective).toBeCloseTo((2 * Math.PI) / optimumRadius, 4)

    expect(diagnostics.converged).toBe(true)
    expect(diagnostics.terminationReason).toBe('step_tolerance')
  })
})
