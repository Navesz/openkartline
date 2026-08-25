import { validateTrack } from './geometry'
import { KART_WIDTH_M } from './kartModel'
import type { KartInput, ResultNote, SimulationSettings, TrackInput, ValidationIssue } from './types'

export const INPUT_LIMITS = {
  projectBytes: 1024 * 1024,
  projectNameMax: 70,
  controlPointsMin: 4,
  controlPointsMax: 500,
  coordinateAbsM: 100_000,
  trackWidthMaxM: 20,
  sampleCountMin: 64,
  sampleCountMax: 500,
  safetyMarginMaxM: 3,
  powerHpMin: 1,
  powerHpMax: 100,
  kartMassKgMin: 20,
  kartMassKgMax: 250,
  driverMassKgMin: 20,
  driverMassKgMax: 180,
  topSpeedKphMin: 10,
  topSpeedKphMax: 180,
  brakeDecelMinMps2: 0.5,
  brakeDecelMaxMps2: 20,
  gripCoefficientMin: 0.2,
  gripCoefficientMax: 2,
} as const

function error(note: ResultNote): ValidationIssue {
  return { level: 'error', note }
}

/**
 * Two notes say the same thing. Used to collapse duplicates, which used to be
 * a string comparison -- available only because every message had already been
 * rendered, which is what froze an imported project's wording in whichever
 * language happened to be on screen when it was read.
 */
function sameNote(a: ResultNote, b: ResultNote): boolean {
  if ('key' in a !== 'key' in b) return false
  if (!('key' in a) || !('key' in b)) return (a as { text: string }).text === (b as { text: string }).text
  if (a.key !== b.key) return false
  const left = a.params ?? {}
  const right = b.params ?? {}
  const names = Object.keys(left)
  return (
    names.length === Object.keys(right).length &&
    names.every((name) => JSON.stringify(left[name]) === JSON.stringify(right[name]))
  )
}

function finite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateSimulationInput(
  track: TrackInput,
  kart: KartInput,
  settings: SimulationSettings,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const limits = INPUT_LIMITS

  if (!track.name.trim() || track.name.trim().length > limits.projectNameMax) {
    issues.push(error({ key: 'validation.trackName', params: { max: limits.projectNameMax } }))
  }
  if (
    track.centerline.length < limits.controlPointsMin ||
    track.centerline.length > limits.controlPointsMax
  ) {
    issues.push(
      error({
        key: 'validation.controlPoints',
        params: { min: limits.controlPointsMin, max: limits.controlPointsMax },
      }),
    )
  }
  const invalidCoordinate = track.centerline.findIndex(
    (point) =>
      !finite(point.x) ||
      !finite(point.y) ||
      Math.abs(point.x) > limits.coordinateAbsM ||
      Math.abs(point.y) > limits.coordinateAbsM,
  )
  if (invalidCoordinate >= 0) {
    issues.push(
      error({
        key: 'validation.invalidCoordinate',
        params: {
          index: invalidCoordinate + 1,
          max: limits.coordinateAbsM,
        },
      }),
    )
  }
  if (!finite(track.widthM) || track.widthM <= 0 || track.widthM > limits.trackWidthMaxM) {
    issues.push(error({ key: 'validation.width', params: { max: limits.trackWidthMaxM } }))
  }
  if (
    track.centerline.length >= limits.controlPointsMin &&
    track.centerline.length <= limits.controlPointsMax &&
    invalidCoordinate < 0 &&
    finite(track.widthM)
  ) {
    issues.push(...validateTrack(track.centerline, track.widthM))
  }

  // An uncalibrated background means the drawing is still in pixel units; a
  // lap time computed over pixels would look plausible and be entirely wrong.
  if (track.background && track.background.scaleMPerPx === undefined) {
    issues.push(error({ key: 'validation.backgroundUncalibrated' }))
  }

  if (
    !finite(kart.kartMassKg) ||
    kart.kartMassKg < limits.kartMassKgMin ||
    kart.kartMassKg > limits.kartMassKgMax
  ) {
    issues.push(
      error({ key: 'validation.kartMass', params: { min: limits.kartMassKgMin, max: limits.kartMassKgMax } }),
    )
  }
  if (
    !finite(kart.driverMassKg) ||
    kart.driverMassKg < limits.driverMassKgMin ||
    kart.driverMassKg > limits.driverMassKgMax
  ) {
    issues.push(
      error({
        key: 'validation.driverMass',
        params: { min: limits.driverMassKgMin, max: limits.driverMassKgMax },
      }),
    )
  }
  if (!finite(kart.powerHp) || kart.powerHp < limits.powerHpMin || kart.powerHp > limits.powerHpMax) {
    issues.push(
      error({ key: 'validation.power', params: { min: limits.powerHpMin, max: limits.powerHpMax } }),
    )
  }
  if (
    !finite(kart.topSpeedKph) ||
    kart.topSpeedKph < limits.topSpeedKphMin ||
    kart.topSpeedKph > limits.topSpeedKphMax
  ) {
    issues.push(
      error({
        key: 'validation.topSpeed',
        params: { min: limits.topSpeedKphMin, max: limits.topSpeedKphMax },
      }),
    )
  }
  if (
    !finite(kart.gripCoefficient) ||
    kart.gripCoefficient < limits.gripCoefficientMin ||
    kart.gripCoefficient > limits.gripCoefficientMax
  ) {
    issues.push(
      error({
        key: 'validation.grip',
        params: { min: limits.gripCoefficientMin, max: limits.gripCoefficientMax },
      }),
    )
  }
  if (
    !finite(kart.brakeDecelMps2) ||
    kart.brakeDecelMps2 < limits.brakeDecelMinMps2 ||
    kart.brakeDecelMps2 > limits.brakeDecelMaxMps2
  ) {
    issues.push(
      error({
        key: 'validation.braking',
        params: { min: limits.brakeDecelMinMps2, max: limits.brakeDecelMaxMps2 },
      }),
    )
  }

  if (
    !finite(settings.sampleCount) ||
    !Number.isInteger(settings.sampleCount) ||
    settings.sampleCount < limits.sampleCountMin ||
    settings.sampleCount > limits.sampleCountMax
  ) {
    issues.push(
      error({
        key: 'validation.sampleCount',
        params: { min: limits.sampleCountMin, max: limits.sampleCountMax },
      }),
    )
  }
  if (
    !finite(settings.safetyMarginM) ||
    settings.safetyMarginM < 0 ||
    settings.safetyMarginM > limits.safetyMarginMaxM
  ) {
    issues.push(error({ key: 'validation.safetyMargin', params: { max: limits.safetyMarginMaxM } }))
  } else if (finite(track.widthM) && KART_WIDTH_M + settings.safetyMarginM * 2 + 0.05 >= track.widthM) {
    issues.push(error({ key: 'validation.noUsableCorridor', params: { kartWidth: KART_WIDTH_M.toFixed(2) } }))
  }
  return issues.filter(
    (issue, index, all) => all.findIndex((candidate) => sameNote(candidate.note, issue.note)) === index,
  )
}

/** The errors among a set of issues, still unrendered. */
export function validationErrorNotes(issues: ValidationIssue[]): ResultNote[] {
  return issues.filter((issue) => issue.level === 'error').map((issue) => issue.note)
}
