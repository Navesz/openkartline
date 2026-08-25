import { distance, signedArea } from '../geometry'
import type { Direction, Point } from '../types'

/**
 * Track-geometry preparation ported from `engine/openkartline_engine/geometry.py`.
 *
 * Both sides compute in IEEE float64, so keeping the Python operation order,
 * constants, and guards makes the browser demo reproduce the engine's numbers
 * to roundoff (~1e-12). Where numpy leans on an FFT (the periodic spline solve
 * and the circular cross-correlation) this port uses the mathematically
 * equivalent direct algorithm, noted at each site.
 */

const EPS = 1e-9
const MAX_DENSE_SAMPLES = 16_000
const DENSE_OVERSAMPLING = 8
/** Mirrors `_GRADIENT_SMOOTHING_REFERENCE_SAMPLES`; the scale both filters measure against. */
export const SMOOTHING_REFERENCE_SAMPLES = 300
/** Mirrors `_CORRIDOR_CENTERING_PASSES`. The seed is a chord midpoint, off-center in a corner. */
const CORRIDOR_CENTERING_PASSES = 2
/**
 * Mirrors `_CORRIDOR_SMOOTHING_PASSES`. Point-to-polyline distance is only
 * piecewise smooth: its slope jumps at every facet, and while the amplitude of
 * that noise is sub-millimetre, its curvature rivals the track's own - which is
 * exactly what the bending objective integrates.
 */
const CORRIDOR_SMOOTHING_PASSES = 2

/** Aligned, equally sampled corridor geometry used by the solver. */
export interface PreparedTrack {
  left: Point[]
  right: Point[]
  center: Point[]
  widths: number[]
  lengthM: number
}

/** Remove an explicit closure point and consecutive zero-length segments. */
function cleanClosed(points: Point[]): Point[] {
  let cleaned = points
  if (cleaned.length > 1 && distance(cleaned[0], cleaned[cleaned.length - 1]) <= EPS) {
    cleaned = cleaned.slice(0, -1)
  }
  if (cleaned.length === 0) return cleaned
  const kept = [cleaned[0]]
  for (let index = 1; index < cleaned.length; index += 1) {
    if (distance(cleaned[index], cleaned[index - 1]) > EPS) kept.push(cleaned[index])
  }
  if (kept.length > 1 && distance(kept[0], kept[kept.length - 1]) <= EPS) {
    kept.pop()
  }
  return kept
}

function closedLength(points: Point[]): number {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    total += distance(points[index], points[(index + 1) % points.length])
  }
  return total
}

/** Equal-arc resampling helper for an already prepared closed polyline. */
function linearResampleClosed(points: Point[], sampleCount: number): Point[] {
  if (points.length < 3) {
    throw new Error('TOO_FEW_POINTS: a closed curve needs at least three distinct points')
  }
  const count = points.length
  const segmentLengths = points.map((point, index) => distance(point, points[(index + 1) % count]))
  if (segmentLengths.some((length) => length <= EPS)) {
    throw new Error('ZERO_LENGTH_SEGMENT: closed curve contains a zero-length segment')
  }
  const cumulative = new Array<number>(count + 1)
  cumulative[0] = 0
  for (let index = 0; index < count; index += 1) {
    cumulative[index + 1] = cumulative[index] + segmentLengths[index]
  }
  const total = cumulative[count]
  const step = total / sampleCount
  const result: Point[] = []
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const target = sample * step
    // numpy `searchsorted(cumulative, target, side='right') - 1`: the last
    // vertex whose arc position does not pass the target.
    let low = 0
    let high = cumulative.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (target < cumulative[middle]) high = middle
      else low = middle + 1
    }
    const index = Math.min(Math.max(low - 1, 0), count - 1)
    const fraction = (target - cumulative[index]) / segmentLengths[index]
    const start = points[index]
    const end = points[(index + 1) % count]
    result.push({
      x: start.x + fraction * (end.x - start.x),
      y: start.y + fraction * (end.y - start.y),
    })
  }
  return result
}

/**
 * Second derivatives of the C2 periodic interpolating cubic spline.
 *
 * The Python original solves the circulant system
 * `M[i-1] + 4*M[i] + M[i+1] = 6*(y[i-1] - 2*y[i] + y[i+1])` with an FFT pair,
 * using eigenvalues `4 + 2*cos(2*pi*k/n)`. The same system is cyclic
 * tridiagonal, so it is solved here exactly in O(n) with the Thomas algorithm
 * plus the Sherman–Morrison correction for the corner entries. The matrix is
 * strictly diagonally dominant, so the direct solve is stable.
 */
function splineSecondDerivatives(values: number[]): number[] {
  const count = values.length
  const rhs = values.map((value, index) => {
    const previous = values[(index - 1 + count) % count]
    const following = values[(index + 1) % count]
    return 6 * (following - 2 * value + previous)
  })
  // Cyclic reduction with gamma = -1: strip the corner 1s from the matrix and
  // compensate with A[0][0] = 4 - gamma = 5 and A[n-1][n-1] = 4 - 1/gamma = 5.
  const pivots = new Array<number>(count)
  const superRatio = new Array<number>(count - 1)
  pivots[0] = 5
  superRatio[0] = 1 / 5
  for (let index = 1; index < count - 1; index += 1) {
    pivots[index] = 4 - superRatio[index - 1]
    superRatio[index] = 1 / pivots[index]
  }
  pivots[count - 1] = 5 - superRatio[count - 2]

  const solve = (rightHandSide: number[]): number[] => {
    const forward = new Array<number>(count)
    forward[0] = rightHandSide[0] / pivots[0]
    for (let index = 1; index < count; index += 1) {
      forward[index] = (rightHandSide[index] - forward[index - 1]) / pivots[index]
    }
    const solution = new Array<number>(count)
    solution[count - 1] = forward[count - 1]
    for (let index = count - 2; index >= 0; index -= 1) {
      solution[index] = forward[index] - superRatio[index] * solution[index + 1]
    }
    return solution
  }

  const y = solve(rhs)
  const u = new Array<number>(count).fill(0)
  u[0] = -1
  u[count - 1] = 1
  const z = solve(u)
  // v = [1, 0, ..., 0, -1], so the Sherman–Morrison factor only reads endpoints.
  const factor = (y[0] - y[count - 1]) / (1 + z[0] - z[count - 1])
  return y.map((value, index) => value - factor * z[index])
}

/** Evaluate the C2 periodic interpolating cubic spline for equal-spaced controls. */
function periodicCubicSpline(points: Point[], sampleCount: number): Point[] {
  const count = points.length
  const secondX = splineSecondDerivatives(points.map((point) => point.x))
  const secondY = splineSecondDerivatives(points.map((point) => point.y))
  const result: Point[] = []
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const position = (sample * count) / sampleCount
    const floored = Math.floor(position)
    const t = position - floored
    const start = floored % count
    const end = (floored + 1) % count
    const oneMinusT = 1 - t
    const t3 = t * t * t
    const oneMinusT3 = oneMinusT * oneMinusT * oneMinusT
    result.push({
      x:
        (secondX[start] * oneMinusT3) / 6 +
        (secondX[end] * t3) / 6 +
        (points[start].x - secondX[start] / 6) * oneMinusT +
        (points[end].x - secondX[end] / 6) * t,
      y:
        (secondY[start] * oneMinusT3) / 6 +
        (secondY[end] * t3) / 6 +
        (points[start].y - secondY[start] / 6) * oneMinusT +
        (points[end].y - secondY[end] / 6) * t,
    })
  }
  return result
}

/**
 * Periodically spline and equal-arc resample a non-repeated closed curve.
 *
 * Input vertices are first put on an equal-distance parameter. This avoids the
 * speed/curvature instability caused by directly differentiating a piecewise
 * linear drawing and makes results substantially less sensitive to sample count.
 */
export function resampleClosedSpline(points: Point[], sampleCount: number): Point[] {
  const cleaned = cleanClosed(points)
  if (cleaned.length < 3) {
    throw new Error('TOO_FEW_POINTS: a closed curve needs at least three distinct points')
  }
  const controlCount = cleaned.length
  const controls = linearResampleClosed(cleaned, controlCount)
  const denseCount = Math.min(
    MAX_DENSE_SAMPLES,
    Math.max(sampleCount * DENSE_OVERSAMPLING, controlCount * DENSE_OVERSAMPLING),
  )
  const dense = periodicCubicSpline(controls, denseCount)
  return linearResampleClosed(dense, sampleCount)
}

/**
 * Rotate equally directed samples to minimize whole-lap pairing distance.
 *
 * Minimizing `sum |reference - roll(candidate, -offset)|**2` is equivalent to
 * maximizing their circular cross-correlation, because the two squared-norm
 * terms do not depend on the offset. The Python original evaluates the
 * correlation with an FFT; the direct O(n^2) evaluation below computes the
 * same sum (to roundoff) and runs once per track, so n up to 2,000 is fine.
 * The first maximizer wins, matching `np.argmax` tie behaviour. Both inputs
 * must share a sample count, as in the Python call sites.
 */
export function alignSamples(reference: Point[], candidate: Point[]): Point[] {
  const count = candidate.length
  let bestOffset = 0
  let bestCorrelation = Number.NEGATIVE_INFINITY
  for (let offset = 0; offset < count; offset += 1) {
    let correlation = 0
    for (let index = 0; index < count; index += 1) {
      const shifted = candidate[(index + offset) % count]
      correlation += reference[index].x * shifted.x + reference[index].y * shifted.y
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestOffset = offset
    }
  }
  return candidate.map((_, index) => candidate[(index + bestOffset) % count])
}

function normalizedOrientation(points: Point[], direction: Direction): Point[] {
  const wantsPositiveArea = direction === 'counterclockwise'
  if (signedArea(points) > 0 !== wantsPositiveArea) return [...points].reverse()
  return points
}

/**
 * Apply the `[1, 2, 1]/4` circular filter `passes` times.
 *
 * One pass scales Fourier mode `f` (in cycles per sample) by `cos(pi f)**2`,
 * so `passes` of them scale it by `cos(pi f)**(2 * passes)`. numpy evaluates
 * that multiplier in one FFT pair; applying the kernel directly is the same
 * circular convolution and costs O(n * passes), trivial at this app's sizes.
 */
export function smoothPeriodic(values: number[], passes: number): number[] {
  if (passes <= 0) return values
  let current = values
  for (let pass = 0; pass < passes; pass += 1) {
    const count = current.length
    const next = new Array<number>(count)
    for (let index = 0; index < count; index += 1) {
      next[index] =
        (current[(index - 1 + count) % count] + 2 * current[index] + current[(index + 1) % count]) / 4
    }
    current = next
  }
  return current
}

/** Left-hand unit normals of a closed curve, from central differences. */
function unitNormals(curve: Point[]): Point[] {
  const count = curve.length
  const normals = new Array<Point>(count)
  for (let index = 0; index < count; index += 1) {
    const following = curve[(index + 1) % count]
    const previous = curve[(index - 1 + count) % count]
    const tangentX = following.x - previous.x
    const tangentY = following.y - previous.y
    const length = Math.hypot(tangentX, tangentY)
    const safe = length < EPS ? 1 : length
    normals[index] = { x: -tangentY / safe, y: tangentX / safe }
  }
  return normals
}

/**
 * Distance from each point to the nearest point of a closed boundary.
 *
 * This is the quantity a safety margin is about - how far the wall is - and
 * unlike casting a ray along the normal it stays defined when the reference has
 * drifted outside the corridor, which is precisely when a ray escapes and
 * answers with a hit from the far side of the track.
 */
function boundaryClearance(points: Point[], boundary: Point[]): number[] {
  const segments = boundary.length
  const clearances = new Array<number>(points.length)
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    let best = Infinity
    for (let segment = 0; segment < segments; segment += 1) {
      const start = boundary[segment]
      const end = boundary[(segment + 1) % segments]
      const edgeX = end.x - start.x
      const edgeY = end.y - start.y
      const lengthSq = edgeX * edgeX + edgeY * edgeY
      const offsetX = point.x - start.x
      const offsetY = point.y - start.y
      const safe = lengthSq < EPS ? 1 : lengthSq
      let projection = (offsetX * edgeX + offsetY * edgeY) / safe
      projection = projection < 0 ? 0 : projection > 1 ? 1 : projection
      const deltaX = offsetX - projection * edgeX
      const deltaY = offsetY - projection * edgeY
      const candidate = Math.hypot(deltaX, deltaY)
      if (candidate < best) best = candidate
    }
    clearances[index] = best
  }
  return clearances
}

/**
 * Hold the clearance filter's width fixed in arc length, not in samples.
 *
 * Same square-law scaling as the gradient filter: the filter diffuses, so its
 * width grows with the square root of the pass count. Without this the corridor
 * is measured differently at every resolution and the lap estimate drifts with
 * `sampleCount`.
 */
export function corridorSmoothingPasses(sampleCount: number): number {
  const scale = sampleCount / SMOOTHING_REFERENCE_SAMPLES
  // `Math.floor(x + 0.5)`, spelled out so it visibly matches the engine.
  // `Math.round` is half-up and Python's `round` is half-to-even, so the
  // two disagreed wherever this landed on .5.
  return Math.max(1, Math.floor(CORRIDOR_SMOOTHING_PASSES * scale * scale + 0.5))
}

/**
 * Measure the corridor from a centered reference instead of by paired index.
 *
 * Equal-arc resampling walks the inner and outer edge at different rates, so
 * station `i` of one does not face station `i` of the other. The chord between
 * them is the hypotenuse of a skewed pair: longer than the width the driver
 * has, and in a tight corner it leaves the corridor entirely, so no fraction of
 * it is safe. Measuring each wall's clearance from a centered reference
 * restores the invariant the solver depends on - `left - right` spans the
 * corridor, and a fraction of it is a real distance from the edge.
 */
function perpendicularCorridor(
  seed: Point[],
  leftBoundary: Point[],
  rightBoundary: Point[],
  sampleCount: number,
): Pick<PreparedTrack, 'left' | 'right' | 'center' | 'widths'> {
  const passes = corridorSmoothingPasses(sampleCount)
  const clearances = (curve: Point[]): [number[], number[]] => [
    smoothPeriodic(boundaryClearance(curve, leftBoundary), passes),
    smoothPeriodic(boundaryClearance(curve, rightBoundary), passes),
  ]

  let reference = resampleClosedSpline(seed, sampleCount)
  let measured = clearances(reference)

  for (let pass = 0; pass < CORRIDOR_CENTERING_PASSES; pass += 1) {
    const [toLeft, toRight] = measured
    const normals = unitNormals(reference)
    reference = resampleClosedSpline(
      reference.map((point, index) => {
        const shift = (toLeft[index] - toRight[index]) * 0.5
        return { x: point.x + normals[index].x * shift, y: point.y + normals[index].y * shift }
      }),
      sampleCount,
    )
    measured = clearances(reference)
  }

  const [toLeft, toRight] = measured
  const normals = unitNormals(reference)
  const left = reference.map((point, index) => ({
    x: point.x + normals[index].x * toLeft[index],
    y: point.y + normals[index].y * toLeft[index],
  }))
  const right = reference.map((point, index) => ({
    x: point.x - normals[index].x * toRight[index],
    y: point.y - normals[index].y * toRight[index],
  }))
  const center = left.map((point, index) => ({
    x: (point.x + right[index].x) * 0.5,
    y: (point.y + right[index].y) * 0.5,
  }))
  return { left, right, center, widths: toLeft.map((value, index) => value + toRight[index]) }
}

/**
 * Normalize a corridor into aligned, equally sampled boundaries.
 *
 * Lean port of the Python `prepare_track`: the browser client pre-validates
 * tracks, so only the degenerate cases that can still occur for browser-built
 * corridors raise (fewer than three distinct points, or a zero-length segment
 * left after cleaning); the full validation suite stays server-side. The
 * numeric pipeline itself — orientation normalization, spline resampling,
 * rotation alignment, and station pairing — mirrors the engine exactly.
 */
export function prepareTrackGeometry(
  leftBoundary: Point[],
  rightBoundary: Point[],
  direction: Direction,
  options: { sampleCount: number; safetyMarginM: number },
): PreparedTrack {
  const normalizedLeft = normalizedOrientation(cleanClosed(leftBoundary), direction)
  const normalizedRight = normalizedOrientation(cleanClosed(rightBoundary), direction)

  // The walls are sampled denser than the stations measured against them,
  // matching `validation_count` in the Python engine. Facet error in the
  // clearance falls as the square of this spacing.
  const denseCount = Math.min(
    2_000,
    Math.max(256, options.sampleCount, normalizedLeft.length * 2, normalizedRight.length * 2),
  )
  const leftDense = resampleClosedSpline(normalizedLeft, denseCount)
  const rightDense = resampleClosedSpline(normalizedRight, denseCount)

  const pairedLeft = resampleClosedSpline(normalizedLeft, options.sampleCount)
  const pairedRight = alignSamples(pairedLeft, resampleClosedSpline(normalizedRight, options.sampleCount))
  const seed = pairedLeft.map((point, index) => ({
    x: (point.x + pairedRight[index].x) * 0.5,
    y: (point.y + pairedRight[index].y) * 0.5,
  }))

  const { left, right, center, widths } = perpendicularCorridor(
    seed,
    leftDense,
    rightDense,
    options.sampleCount,
  )
  return { left, right, center, widths, lengthM: closedLength(center) }
}

/**
 * Station, segment length, heading, and signed discrete (Menger) curvature.
 *
 * Neighbour rolls match the Python original: station `i` looks at samples
 * `i - 1` and `i + 1` modulo the lap, the heading follows the chord between
 * them, and the curvature is zeroed where the triplet degenerates.
 */
export function pathChannels(path: Point[]): {
  station: number[]
  segmentLengths: number[]
  heading: number[]
  curvature: number[]
} {
  const count = path.length
  const segmentLengths = new Array<number>(count)
  const heading = new Array<number>(count)
  const curvature = new Array<number>(count)
  for (let index = 0; index < count; index += 1) {
    const previous = path[(index - 1 + count) % count]
    const current = path[index]
    const following = path[(index + 1) % count]
    const incomingX = current.x - previous.x
    const incomingY = current.y - previous.y
    const outgoingX = following.x - current.x
    const outgoingY = following.y - current.y
    const chordX = following.x - previous.x
    const chordY = following.y - previous.y
    const incomingLength = Math.hypot(incomingX, incomingY)
    const outgoingLength = Math.hypot(outgoingX, outgoingY)
    const chordLength = Math.hypot(chordX, chordY)
    const denominator = incomingLength * outgoingLength * chordLength
    const cross = incomingX * outgoingY - incomingY * outgoingX
    curvature[index] = denominator > EPS ? (2 * cross) / denominator : 0
    segmentLengths[index] = outgoingLength
    heading[index] = Math.atan2(chordY, chordX)
  }
  const station = new Array<number>(count)
  station[0] = 0
  for (let index = 1; index < count; index += 1) {
    station[index] = station[index - 1] + segmentLengths[index - 1]
  }
  return { station, segmentLengths, heading, curvature }
}
