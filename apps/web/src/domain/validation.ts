import { validateTrack } from './geometry'
import { KART_WIDTH_M } from './kartModel'
import type { Translate } from '../i18n/context'
import type { KartInput, SimulationSettings, TrackInput, ValidationIssue } from './types'

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

function error(message: string): ValidationIssue {
  return { level: 'error', message }
}

function finite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateSimulationInput(
  track: TrackInput,
  kart: KartInput,
  settings: SimulationSettings,
  t: Translate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const limits = INPUT_LIMITS

  if (!track.name.trim() || track.name.trim().length > limits.projectNameMax) {
    issues.push(error(t('validation.trackName', { max: limits.projectNameMax })))
  }
  if (
    track.centerline.length < limits.controlPointsMin ||
    track.centerline.length > limits.controlPointsMax
  ) {
    issues.push(
      error(
        t('validation.controlPoints', { min: limits.controlPointsMin, max: limits.controlPointsMax }),
      ),
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
      error(
        t('validation.invalidCoordinate', {
          index: invalidCoordinate + 1,
          max: limits.coordinateAbsM,
        }),
      ),
    )
  }
  if (!finite(track.widthM) || track.widthM <= 0 || track.widthM > limits.trackWidthMaxM) {
    issues.push(error(t('validation.width', { max: limits.trackWidthMaxM })))
  }
  if (
    track.centerline.length >= limits.controlPointsMin &&
    track.centerline.length <= limits.controlPointsMax &&
    invalidCoordinate < 0 &&
    finite(track.widthM)
  ) {
    issues.push(...validateTrack(track.centerline, track.widthM, t))
  }

  // An uncalibrated background means the drawing is still in pixel units; a
  // lap time computed over pixels would look plausible and be entirely wrong.
  if (track.background && track.background.scaleMPerPx === undefined) {
    issues.push(error(t('validation.backgroundUncalibrated')))
  }

  if (
    !finite(kart.kartMassKg) ||
    kart.kartMassKg < limits.kartMassKgMin ||
    kart.kartMassKg > limits.kartMassKgMax
  ) {
    issues.push(
      error(t('validation.kartMass', { min: limits.kartMassKgMin, max: limits.kartMassKgMax })),
    )
  }
  if (
    !finite(kart.driverMassKg) ||
    kart.driverMassKg < limits.driverMassKgMin ||
    kart.driverMassKg > limits.driverMassKgMax
  ) {
    issues.push(
      error(t('validation.driverMass', { min: limits.driverMassKgMin, max: limits.driverMassKgMax })),
    )
  }
  if (!finite(kart.powerHp) || kart.powerHp < limits.powerHpMin || kart.powerHp > limits.powerHpMax) {
    issues.push(error(t('validation.power', { min: limits.powerHpMin, max: limits.powerHpMax })))
  }
  if (
    !finite(kart.topSpeedKph) ||
    kart.topSpeedKph < limits.topSpeedKphMin ||
    kart.topSpeedKph > limits.topSpeedKphMax
  ) {
    issues.push(
      error(t('validation.topSpeed', { min: limits.topSpeedKphMin, max: limits.topSpeedKphMax })),
    )
  }
  if (
    !finite(kart.gripCoefficient) ||
    kart.gripCoefficient < limits.gripCoefficientMin ||
    kart.gripCoefficient > limits.gripCoefficientMax
  ) {
    issues.push(
      error(
        t('validation.grip', { min: limits.gripCoefficientMin, max: limits.gripCoefficientMax }),
      ),
    )
  }
  if (
    !finite(kart.brakeDecelMps2) ||
    kart.brakeDecelMps2 < limits.brakeDecelMinMps2 ||
    kart.brakeDecelMps2 > limits.brakeDecelMaxMps2
  ) {
    issues.push(
      error(
        t('validation.braking', { min: limits.brakeDecelMinMps2, max: limits.brakeDecelMaxMps2 }),
      ),
    )
  }

  if (
    !finite(settings.sampleCount) ||
    !Number.isInteger(settings.sampleCount) ||
    settings.sampleCount < limits.sampleCountMin ||
    settings.sampleCount > limits.sampleCountMax
  ) {
    issues.push(
      error(
        t('validation.sampleCount', { min: limits.sampleCountMin, max: limits.sampleCountMax }),
      ),
    )
  }
  if (
    !finite(settings.safetyMarginM) ||
    settings.safetyMarginM < 0 ||
    settings.safetyMarginM > limits.safetyMarginMaxM
  ) {
    issues.push(error(t('validation.safetyMargin', { max: limits.safetyMarginMaxM })))
  } else if (finite(track.widthM) && KART_WIDTH_M + settings.safetyMarginM * 2 + 0.05 >= track.widthM) {
    issues.push(error(t('validation.noUsableCorridor', { kartWidth: KART_WIDTH_M.toFixed(2) })))
  }
  return issues.filter(
    (issue, index, all) => all.findIndex((candidate) => candidate.message === issue.message) === index,
  )
}

export function validationErrorMessage(issues: ValidationIssue[]): string {
  return issues
    .filter((issue) => issue.level === 'error')
    .map((issue) => issue.message)
    .join(' ')
}
