import { curvatureAt, pathLength } from './geometry'
import type { Point } from './types'

/**
 * Geometric racing line: out-in-out around every corner of a closed lap.
 *
 * Out-in-out is a property of a whole corner, not of a single station, so any
 * rule that maps the local curvature to a lateral offset cannot express it: it
 * sees the same curvature on entry and on exit and has no way to know which is
 * which. The line is therefore built from a handful of anchors — one per apex,
 * one release point per pair of corners — and interpolated between them.
 */

/** 1-2-1 kernel over a closed lap. Attenuates sampling noise without shifting peaks. */
function smoothCircular(values: number[], passes: number): number[] {
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

const CURVATURE_SMOOTHING_PASSES = 4

/**
 * An apex only counts as a corner if it is this fraction of the lap's tightest
 * curvature, and if it stands this far above the shallowest point separating it
 * from a tighter neighbour. The first test drops the ripple of a quasi-straight;
 * the second stops a wobble halfway through one long corner from splitting it.
 * Both are expressed relative to the lap so that detection does not depend on
 * the absolute scale of the track.
 */
const APEX_MIN_PEAK_FRACTION = 0.18
const APEX_MIN_PROMINENCE_FRACTION = 0.45

/** How far the line releases towards the outside between two corners. */
const RELEASE_CURVATURE_RATIO = 0.55
/** Release anchors sit this far either side of the shallowest point, as a fraction of the gap. */
const RELEASE_SPREAD = 0.45
const MIN_RELEASE_SPREAD_SAMPLES = 0.75
/** Curvature under which the road counts as straight enough to change sides on. */
const STRAIGHT_CURVATURE_FRACTION = 0.25
/** Metres of road needed per metre of lateral movement when crossing the track. */
const CROSSOVER_SLOPE = 3
/** Curvature a transition may add, as a multiple of the curvature of the corner it serves. */
const TRANSITION_CURVATURE_BUDGET = 1
const TRANSITION_PASSES = 8

export interface Corner {
  /** Shallowest station before the apex: where the entry release anchor sits. */
  startIndex: number
  apexIndex: number
  /** Shallowest station after the apex; equal to the next corner's `startIndex`. */
  endIndex: number
  /** +1 for a left-hander, -1 for a right-hander. */
  turn: 1 | -1
  apexCurvature: number
}

interface Anchor {
  station: number
  offset: number
  /** Curvature of the corner this anchor serves; scales its transition budget. */
  curvature: number
}

const wrap = (index: number, count: number) => ((index % count) + count) % count

const forward = (from: number, to: number, count: number) => wrap(to - from, count)

function maximum(values: number[]): number {
  return values.reduce((best, value) => (value > best ? value : best), Number.NEGATIVE_INFINITY)
}

/**
 * Depth of the shallowest point between `index` and the first tighter sample in
 * `direction`, or `null` when no sample of the lap is tighter.
 */
function colDepth(magnitude: number[], index: number, direction: 1 | -1): number | null {
  const count = magnitude.length
  const height = magnitude[index]
  let col = height
  for (let step = 1; step < count; step += 1) {
    const value = magnitude[wrap(index + direction * step, count)]
    if (value > height) return col
    col = Math.min(col, value)
  }
  return null
}

/** Topographic prominence of a curvature peak. */
function apexProminence(magnitude: number[], index: number): number {
  const before = colDepth(magnitude, index, -1)
  const after = colDepth(magnitude, index, 1)
  if (before === null || after === null) return magnitude[index]
  return magnitude[index] - Math.max(before, after)
}

/** Shallowest station strictly between two apexes; ties resolve to the earlier one. */
function shallowestBetween(magnitude: number[], from: number, to: number): number {
  const count = magnitude.length
  const span = forward(from, to, count) || count
  let best = wrap(from + 1, count)
  for (let step = 2; step < span; step += 1) {
    const index = wrap(from + step, count)
    if (magnitude[index] < magnitude[best]) best = index
  }
  return best
}

/**
 * Split a closed lap into corners at its curvature peaks.
 *
 * Thresholding the curvature itself cannot do this: on a real kart circuit the
 * road between two hairpins is rarely straight enough to fall under any single
 * threshold, so consecutive corners merge into one region. Peak prominence
 * separates them because it asks how far the curvature *drops* between peaks
 * rather than how low it gets.
 */
export function detectCorners(curvature: number[]): Corner[] {
  const count = curvature.length
  if (count < 8) return []
  const magnitude = curvature.map(Math.abs)
  const peak = maximum(magnitude)
  if (!(peak > 0)) return []
  const minimumHeight = APEX_MIN_PEAK_FRACTION * peak
  const apexes: number[] = []
  for (let index = 0; index < count; index += 1) {
    const value = magnitude[index]
    // Strict on one side only, so a plateau yields exactly one apex.
    if (
      value >= minimumHeight &&
      value > magnitude[wrap(index - 1, count)] &&
      value >= magnitude[wrap(index + 1, count)] &&
      apexProminence(magnitude, index) >= APEX_MIN_PROMINENCE_FRACTION * value
    ) {
      apexes.push(index)
    }
  }
  if (!apexes.length) return []
  return apexes.map((apexIndex, position) => {
    const previous = apexes[(position - 1 + apexes.length) % apexes.length]
    const next = apexes[(position + 1) % apexes.length]
    return {
      startIndex: shallowestBetween(magnitude, previous, apexIndex),
      apexIndex,
      endIndex: shallowestBetween(magnitude, apexIndex, next),
      turn: curvature[apexIndex] >= 0 ? 1 : -1,
      apexCurvature: curvature[apexIndex],
    } satisfies Corner
  })
}

/** Length of the run of near-straight road centred on the shallowest station. */
function straightRunSamples(magnitude: number[], col: number, threshold: number): number {
  const count = magnitude.length
  if (magnitude[col] > threshold) return 0
  let run = 1
  for (let step = 1; step < count && magnitude[wrap(col - step, count)] <= threshold; step += 1) run += 1
  for (let step = 1; step < count && magnitude[wrap(col + step, count)] <= threshold; step += 1) run += 1
  return run
}

interface Release {
  spread: number
  exitOffset: number
  entryOffset: number
  /** False when the gap is crossed in one move, straight from apex to apex. */
  anchored: boolean
}

function planReleases(
  corners: Corner[],
  magnitude: number[],
  halfUsableWidth: number,
  spacingM: number,
  count: number,
): Release[] {
  return corners.map((corner, position) => {
    const next = corners[(position + 1) % corners.length]
    const col = corner.endIndex
    const reference = Math.min(Math.abs(corner.apexCurvature), Math.abs(next.apexCurvature))
    // How far towards the outside the line may run between the two corners, from
    // 0 (stay on the inside) to 1 (full width). Corners linked by road that still
    // curves — a double apex, or two hairpins joined by a fast kink — leave no
    // time to reach the outside and come back.
    const fraction =
      reference > 0 ? Math.max(0, Math.min(1, 1 - magnitude[col] / (RELEASE_CURVATURE_RATIO * reference))) : 1
    // `1 - 2 * fraction` runs from the inside edge to the outside edge; the sign
    // convention follows the left-hand normal, so the inside of a left-hander is
    // positive.
    const exitOffset = corner.turn * halfUsableWidth * (1 - 2 * fraction)
    const entryOffset = next.turn * halfUsableWidth * (1 - 2 * fraction)
    // Corners of opposite hand want opposite release sides, so honouring both
    // costs a full change of side on top of the crossing that has to happen
    // anyway. The curvature between them always passes through zero, so the depth
    // of that crossing says nothing about whether there is room for it: what
    // matters is how much of the gap is actually straight. A continuous S reads
    // as almost no straight at all, and is then crossed once, from apex to apex.
    const straight = straightRunSamples(magnitude, col, STRAIGHT_CURVATURE_FRACTION * reference)
    // Holding a position only makes sense for as long as the road stays straight;
    // past that the line has to be already turning back in.
    const spread = Math.min(
      straight / 2,
      RELEASE_SPREAD *
        Math.min(forward(corner.apexIndex, col, count), forward(col, next.apexIndex, count) || count),
    )
    const anchored =
      spread >= MIN_RELEASE_SPREAD_SAMPLES &&
      straight * spacingM >= CROSSOVER_SLOPE * Math.abs(exitOffset - entryOffset)
    return { spread, exitOffset, entryOffset, anchored }
  })
}

/**
 * Trim anchor pairs the line has no room to reach.
 *
 * A cubic between two anchors `d` apart laterally and `L` apart along the road
 * adds up to `6d/L^2` of curvature, and that adds to the corner the kart is
 * already taking. Using the full corridor is only worth it while the swerve to
 * get there stays a fraction of the corner's own curvature — on a wide, gently
 * curved lap it is not, and a textbook out-in-out is slower than the centreline.
 * Shrinking both anchors towards each other preserves the sign of every step, so
 * apexes stay apexes.
 */
function limitTransitions(anchors: Anchor[], spacingM: number, count: number): void {
  for (let pass = 0; pass < TRANSITION_PASSES; pass += 1) {
    anchors.forEach((anchor, index) => {
      const next = anchors[(index + 1) % anchors.length]
      const spanM = (forward(anchor.station, next.station, count) || count) * spacingM
      const reference = Math.max(anchor.curvature, next.curvature)
      const allowed = (TRANSITION_CURVATURE_BUDGET * reference * spanM ** 2) / 6
      const delta = next.offset - anchor.offset
      const excess = Math.abs(delta) - allowed
      if (excess <= 0) return
      const shift = (Math.sign(delta) * excess) / 2
      anchor.offset += shift
      next.offset -= shift
    })
  }
}

function buildAnchors(
  corners: Corner[],
  magnitude: number[],
  halfUsableWidth: number,
  spacingM: number,
  count: number,
): Anchor[] {
  const releases = planReleases(corners, magnitude, halfUsableWidth, spacingM, count)
  const anchors: Anchor[] = []
  corners.forEach((corner, position) => {
    const curvature = Math.abs(corner.apexCurvature)
    anchors.push({ station: corner.apexIndex, offset: corner.turn * halfUsableWidth, curvature })
    const release = releases[position]
    if (!release.anchored) return
    anchors.push({
      station: wrap(corner.endIndex - release.spread, count),
      offset: release.exitOffset,
      curvature,
    })
    anchors.push({
      station: wrap(corner.endIndex + release.spread, count),
      offset: release.entryOffset,
      curvature: Math.abs(corners[(position + 1) % corners.length].apexCurvature),
    })
  })
  anchors.sort((a, b) => a.station - b.station)
  limitTransitions(anchors, spacingM, count)
  return anchors
}

/**
 * Periodic monotone cubic Hermite (Fritsch-Carlson) through the anchors.
 *
 * Monotone tangents matter twice over: they keep the interpolant inside the
 * corridor without clamping, and they guarantee the line only ever moves one way
 * between two anchors, so a corner cannot wobble between its entry and its apex.
 */
function samplePeriodicSpline(anchors: Anchor[], count: number): number[] {
  const size = anchors.length
  if (size === 1) return new Array<number>(count).fill(anchors[0].offset)
  const spans = anchors.map((anchor, index) => {
    const span = forward(anchor.station, anchors[(index + 1) % size].station, count)
    return span > 0 ? span : count
  })
  const secants = anchors.map(
    (anchor, index) => (anchors[(index + 1) % size].offset - anchor.offset) / spans[index],
  )
  const tangents = anchors.map((_, index) => {
    const previous = (index - 1 + size) % size
    const before = secants[previous]
    const after = secants[index]
    if (before * after <= 0) return 0
    const weightBefore = 2 * spans[index] + spans[previous]
    const weightAfter = spans[index] + 2 * spans[previous]
    return (weightBefore + weightAfter) / (weightBefore / before + weightAfter / after)
  })
  const offsets: number[] = []
  for (let station = 0; station < count; station += 1) {
    let segment = size - 1
    for (let index = 0; index < size; index += 1) {
      if (anchors[index].station <= station) segment = index
    }
    const start = anchors[segment]
    const end = anchors[(segment + 1) % size]
    const span = spans[segment]
    const t = wrap(station - start.station, count) / span
    const t2 = t * t
    const t3 = t2 * t
    offsets.push(
      (2 * t3 - 3 * t2 + 1) * start.offset +
        (t3 - 2 * t2 + t) * span * tangents[segment] +
        (-2 * t3 + 3 * t2) * end.offset +
        (t3 - t2) * span * tangents[(segment + 1) % size],
    )
  }
  return offsets
}

/**
 * Lateral offset of the racing line from the centreline, per station.
 *
 * Positive is towards the left-hand normal, matching `normalAt`. The result is
 * clamped to `halfUsableWidth`, which is the corridor left once half a kart and
 * the safety margin are taken off each edge.
 */
export function racingLineOffsets(center: Point[], halfUsableWidth: number): number[] {
  const count = center.length
  if (halfUsableWidth <= 0 || count < 8) return center.map(() => 0)
  const curvature = smoothCircular(
    center.map((_, index) => curvatureAt(center, index)),
    CURVATURE_SMOOTHING_PASSES,
  )
  const corners = detectCorners(curvature)
  if (!corners.length) return center.map(() => 0)
  const spacingM = pathLength(center) / count
  const anchors = buildAnchors(corners, curvature.map(Math.abs), halfUsableWidth, spacingM, count)
  return samplePeriodicSpline(anchors, count).map((offset) =>
    Math.max(-halfUsableWidth, Math.min(halfUsableWidth, offset)),
  )
}
