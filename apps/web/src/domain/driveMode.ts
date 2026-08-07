import type { DriveMode } from './types'

/**
 * Minimum number of consecutive samples a drive mode must hold to be shown.
 *
 * At 200 samples a lap this is a little over 1% of the distance, which is far
 * shorter than any real brake or throttle application.
 */
export const MIN_MODE_RUN = 4

/**
 * Collapse drive-mode runs that are too short to be a real driver input.
 *
 * Longitudinal acceleration is a finite difference of a speed profile that sits
 * on top of a discretely sampled curvature, so it changes sign over single
 * samples in fast corners. Classifying each sample independently turns that
 * numerical chatter into dozens of one-sample brake/throttle bands: the racing
 * line reads as a dashed, uneven ribbon rather than a driveable plan, and the
 * marker derivation inherits the same noise.
 *
 * Runs shorter than `minRun` are absorbed into the longer of their two
 * neighbours. The pass repeats until nothing changes, because absorbing one
 * short run can leave another one adjacent to a new neighbour.
 */
export function stabiliseDriveModes(modes: DriveMode[], minRun = MIN_MODE_RUN): DriveMode[] {
  if (modes.length < minRun * 2) return [...modes]
  let current = [...modes]

  // Each pass removes exactly one run, so the bound has to scale with how many
  // runs the raw classification can produce, not be a small fixed number.
  for (let pass = 0; pass < modes.length; pass += 1) {
    const runs = closedRuns(current)
    if (runs.length < 3) return current
    const shortest = runs.reduce((best, run) => (run.length < best.length ? run : best))
    if (shortest.length >= minRun) return current

    const position = runs.indexOf(shortest)
    const previous = runs[(position - 1 + runs.length) % runs.length]
    const next = runs[(position + 1) % runs.length]
    const winner = previous.length >= next.length ? previous.mode : next.mode
    const updated = [...current]
    for (let step = 0; step < shortest.length; step += 1) {
      updated[(shortest.start + step) % updated.length] = winner
    }
    current = updated
  }
  return current
}

interface ModeRun {
  mode: DriveMode
  start: number
  length: number
}

/** Runs of equal modes around a closed lap, with the seam joined. */
function closedRuns(modes: DriveMode[]): ModeRun[] {
  // Start counting at a real boundary so the lap seam does not split one run in
  // two and make it look artificially short.
  let origin = 0
  while (origin < modes.length && modes[origin] === modes[(origin - 1 + modes.length) % modes.length]) {
    origin += 1
  }
  if (origin === modes.length) return [{ mode: modes[0], start: 0, length: modes.length }]

  const runs: ModeRun[] = []
  for (let step = 0; step < modes.length; step += 1) {
    const index = (origin + step) % modes.length
    const last = runs[runs.length - 1]
    if (last && last.mode === modes[index]) last.length += 1
    else runs.push({ mode: modes[index], start: index, length: 1 })
  }
  return runs
}
