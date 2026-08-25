import type { Point } from '../types'
import { SMOOTHING_REFERENCE_SAMPLES, smoothPeriodic } from './prepareTrack'
import type { PreparedTrack } from './prepareTrack'

/**
 * Minimum-bending racing-line optimizer ported 1:1 from the Python engine
 * (`minimum_bending_path` in `engine/openkartline_engine/geometry.py`).
 *
 * This lightweight projected-gradient method is deterministic and produces a
 * useful minimum-bending baseline without claiming a global minimum-time line.
 * Backtracking accepts only objective-decreasing steps. Constants, tolerances,
 * and control flow are identical to the Python original; the only deliberate
 * algorithm swap is `_smooth_periodic`, noted at its definition.
 */

const EPS = 1e-9
const GRADIENT_SMOOTHING_PASSES = 24
/** Central-difference step of the fraction gradient, in fraction units (times corridor). */
const GRADIENT_EPSILON = 1e-5
const GLOBAL_FRACTION_STEP = 0.05
const PRECONDITIONED_STEP_SCALE = 0.08
const BACKTRACKING_HALVINGS = 16
const GRADIENT_NORM_TOLERANCE = 1e-10
const STEP_TOLERANCE = 1e-5

export interface BendingDiagnostics {
  initialObjective: number
  finalObjective: number
  iterations: number
  converged: boolean
  terminationReason: 'skipped' | 'gradient_tolerance' | 'step_tolerance' | 'no_progress' | 'iteration_limit'
  maxFractionStep: number
  minCorridorFraction: number
  maxCorridorFraction: number
}

function maxAbs(values: number[]): number {
  let result = 0
  for (const value of values) {
    const magnitude = Math.abs(value)
    if (magnitude > result) result = magnitude
  }
  return result
}

function maxAbsDifference(first: number[], second: number[]): number {
  let result = 0
  for (let index = 0; index < first.length; index += 1) {
    const magnitude = Math.abs(first[index] - second[index])
    if (magnitude > result) result = magnitude
  }
  return result
}

const clip = (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper)

/** The bending term of the middle point of a triplet, exactly as in `_fraction_gradient`. */
function bendingTermAt(a: Point, b: Point, c: Point): number {
  const incomingX = b.x - a.x
  const incomingY = b.y - a.y
  const outgoingX = c.x - b.x
  const outgoingY = c.y - b.y
  const chordX = c.x - a.x
  const chordY = c.y - a.y
  const incomingLength = Math.hypot(incomingX, incomingY)
  const outgoingLength = Math.hypot(outgoingX, outgoingY)
  const denominator = incomingLength * outgoingLength * Math.hypot(chordX, chordY)
  const cross = incomingX * outgoingY - incomingY * outgoingX
  const curvature = denominator > EPS ? (2 * cross) / denominator : 0
  return curvature * curvature * 0.5 * (incomingLength + outgoingLength)
}

/** Discrete approximation of integral(curvature**2 ds) at every station. */
function bendingTerms(path: Point[]): number[] {
  const count = path.length
  const terms = new Array<number>(count)
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
    const denominator = incomingLength * outgoingLength * Math.hypot(chordX, chordY)
    const cross = incomingX * outgoingY - incomingY * outgoingX
    const curvature = denominator > EPS ? (2 * cross) / denominator : 0
    const localDistance = 0.5 * (incomingLength + outgoingLength)
    terms[index] = curvature * curvature * localDistance
  }
  return terms
}

function bendingObjective(path: Point[]): number {
  return bendingTerms(path).reduce((sum, term) => sum + term, 0)
}

/** Central-difference objective gradient from the three locally affected terms. */
function fractionGradient(path: Point[], corridor: Point[], epsilon = GRADIENT_EPSILON): number[] {
  const count = path.length
  const gradient = new Array<number>(count)
  for (let index = 0; index < count; index += 1) {
    const current = path[index]
    const deltaX = epsilon * corridor[index].x
    const deltaY = epsilon * corridor[index].y
    const plus = { x: current.x + deltaX, y: current.y + deltaY }
    const minus = { x: current.x - deltaX, y: current.y - deltaY }
    const previous = path[(index - 1 + count) % count]
    const previousTwo = path[(index - 2 + count) % count]
    const following = path[(index + 1) % count]
    const followingTwo = path[(index + 2) % count]
    const currentPlus = bendingTermAt(previous, plus, following)
    const currentMinus = bendingTermAt(previous, minus, following)
    const asPreviousPlus = bendingTermAt(plus, following, followingTwo)
    const asPreviousMinus = bendingTermAt(minus, following, followingTwo)
    const asFollowingPlus = bendingTermAt(previousTwo, previous, plus)
    const asFollowingMinus = bendingTermAt(previousTwo, previous, minus)
    gradient[index] =
      (currentPlus - currentMinus + asPreviousPlus - asPreviousMinus + asFollowingPlus - asFollowingMinus) /
      (2 * epsilon)
  }
  return gradient
}

/**
 * Keep the gradient filter's width constant in arc length, not in samples.
 *
 * The filter behaves like diffusion, so its width grows with the square root of
 * the pass count. Holding the physical width fixed therefore needs a pass count
 * that grows with the square of the resolution; otherwise the preconditioner
 * silently weakens as `sampleCount` rises and the same track converges to a
 * measurably different line.
 */
export function smoothingPasses(sampleCount: number): number {
  const scale = sampleCount / SMOOTHING_REFERENCE_SAMPLES
  // `Math.floor(x + 0.5)`, spelled out so it visibly matches the engine.
  // `Math.round` is half-up and Python's `round` is half-to-even, so the
  // two disagreed wherever this landed on .5.
  return Math.max(1, Math.floor(GRADIENT_SMOOTHING_PASSES * scale * scale + 0.5))
}

/**
 * Zero the components that the corridor bounds would immediately clip away.
 *
 * The step is `fraction - t * direction`, so a positive component is blocked
 * at the lower bound and a negative one at the upper bound. Clipping those
 * afterwards instead of removing them here can flip an otherwise descending
 * preconditioned step into an ascending one.
 */
function freeDirection(direction: number[], fraction: number[], lower: number[], upper: number[]): number[] {
  return direction.map((value, index) =>
    (fraction[index] <= lower[index] + EPS && value > 0) ||
    (fraction[index] >= upper[index] - EPS && value < 0)
      ? 0
      : value,
  )
}

function pathFromFraction(right: Point[], corridor: Point[], fraction: number[]): Point[] {
  return right.map((point, index) => ({
    x: point.x + fraction[index] * corridor[index].x,
    y: point.y + fraction[index] * corridor[index].y,
  }))
}

/** Minimize integrated squared curvature inside station-wise track bounds. */
export function minimumBendingPath(
  track: PreparedTrack,
  options: { safetyMarginM: number; iterations: number },
): { path: Point[]; diagnostics: BendingDiagnostics } {
  const count = track.center.length
  const corridor = track.left.map((point, index) => ({
    x: point.x - track.right[index].x,
    y: point.y - track.right[index].y,
  }))
  const lower = track.widths.map((width) => options.safetyMarginM / width)
  const upper = lower.map((bound) => 1 - bound)
  let fraction = new Array<number>(count).fill(0.5)
  let path = pathFromFraction(track.right, corridor, fraction)
  let objective = bendingObjective(path)
  const initialObjective = objective
  let converged = false
  let terminationReason: BendingDiagnostics['terminationReason'] =
    options.iterations === 0 ? 'skipped' : 'iteration_limit'
  let completed = 0
  let maxFractionStep = 0
  const passes = smoothingPasses(count)

  for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
    let gradient = fractionGradient(path, corridor)
    // First test the zero-frequency component explicitly. It efficiently
    // captures the analytically correct move toward the outer radius on a
    // circular corridor, while objective checking makes it safe elsewhere.
    const meanGradient = gradient.reduce((sum, value) => sum + value, 0) / count
    let globalAccepted = false
    if (Math.abs(meanGradient) >= GRADIENT_NORM_TOLERANCE) {
      const globalStep = meanGradient > 0 ? -GLOBAL_FRACTION_STEP : GLOBAL_FRACTION_STEP
      const globalFraction = fraction.map((value, index) =>
        clip(value + globalStep, lower[index], upper[index]),
      )
      const globalPath = pathFromFraction(track.right, corridor, globalFraction)
      const globalObjective = bendingObjective(globalPath)
      if (globalObjective < objective - 1e-12) {
        maxFractionStep = Math.max(maxFractionStep, maxAbsDifference(globalFraction, fraction))
        fraction = globalFraction
        path = globalPath
        objective = globalObjective
        globalAccepted = true
        gradient = fractionGradient(path, corridor)
      }
    }
    // The polyline representation produces high-frequency vertex noise in
    // curvature derivatives. A compact periodic low-pass is a deterministic
    // preconditioner and also favours driveable lateral-offset variation.
    const smoothed = smoothPeriodic(gradient, passes)
    const maximumGradient = maxAbs(smoothed)
    if (maximumGradient < GRADIENT_NORM_TOLERANCE) {
      converged = true
      terminationReason = 'gradient_tolerance'
      completed = iteration
      break
    }
    // A raw gradient can stay non-zero at a constrained optimum. This
    // projected step is the scale-independent KKT residual used to
    // distinguish convergence at a corridor edge from a stalled line search.
    const rawMagnitude = maxAbs(gradient)
    const projectedFraction = fraction.map((value, index) =>
      clip(value - (PRECONDITIONED_STEP_SCALE * gradient[index]) / rawMagnitude, lower[index], upper[index]),
    )
    const projectedResidual = maxAbsDifference(projectedFraction, fraction)
    // Accepting on an absolute epsilon rejects usable steps once the
    // objective is far from zero, so scale the tolerance with its magnitude.
    const acceptanceTolerance = 1e-12 * Math.max(1, Math.abs(objective))
    let accepted = false
    let candidateFraction = fraction
    let candidatePath = path
    let candidateObjective = objective
    // The smoothed direction is only a preconditioner and can stall while a
    // feasible descent step still exists, so fall back to the raw gradient
    // before reporting that the line search made no progress.
    for (const direction of [smoothed, gradient]) {
      const free = freeDirection(direction, fraction, lower, upper)
      const maximumFree = maxAbs(free)
      if (maximumFree < GRADIENT_NORM_TOLERANCE) continue
      let stepSize = PRECONDITIONED_STEP_SCALE / maximumFree
      for (let attempt = 0; attempt < BACKTRACKING_HALVINGS; attempt += 1) {
        candidateFraction = fraction.map((value, index) =>
          clip(value - stepSize * free[index], lower[index], upper[index]),
        )
        candidatePath = pathFromFraction(track.right, corridor, candidateFraction)
        candidateObjective = bendingObjective(candidatePath)
        if (candidateObjective <= objective - acceptanceTolerance) {
          accepted = true
          break
        }
        stepSize *= 0.5
      }
      if (accepted) break
    }
    if (!accepted) {
      completed = iteration
      if (globalAccepted) continue
      // Exhausting the line search is not the same as being stationary. It
      // halves *after* each failed try, so sixteen tries reach
      // `0.08 * 2**-15`, not `2**-16` — and a descent step exists at exactly
      // that next halving. Reporting it as convergence hid a real shortfall.
      // See the Python original and issue #45.
      if (projectedResidual < STEP_TOLERANCE) {
        converged = true
        terminationReason = 'step_tolerance'
      } else {
        terminationReason = 'no_progress'
      }
      break
    }
    const fractionStep = maxAbsDifference(candidateFraction, fraction)
    maxFractionStep = Math.max(maxFractionStep, fractionStep)
    fraction = candidateFraction
    path = candidatePath
    objective = candidateObjective
    completed = iteration
    if (fractionStep < STEP_TOLERANCE && projectedResidual < STEP_TOLERANCE) {
      converged = true
      terminationReason = 'step_tolerance'
      break
    }
  }

  let minCorridorFraction = Infinity
  let maxCorridorFraction = -Infinity
  for (const value of fraction) {
    if (value < minCorridorFraction) minCorridorFraction = value
    if (value > maxCorridorFraction) maxCorridorFraction = value
  }

  return {
    path,
    diagnostics: {
      initialObjective,
      finalObjective: objective,
      iterations: completed,
      converged,
      terminationReason,
      maxFractionStep,
      minCorridorFraction,
      maxCorridorFraction,
    },
  }
}
