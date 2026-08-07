import { validateTrack } from './geometry'
import { KART_WIDTH_M } from './kartModel'
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
  powerHpMax: 80,
  kartMassKgMin: 20,
  kartMassKgMax: 250,
  driverMassKgMin: 20,
  driverMassKgMax: 180,
  topSpeedKphMin: 10,
  topSpeedKphMax: 180,
  brakeDecelMinMps2: 0.5,
  brakeDecelMaxMps2: 15,
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
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const limits = INPUT_LIMITS

  if (!track.name.trim() || track.name.trim().length > limits.projectNameMax) {
    issues.push(error(`O nome da pista deve ter entre 1 e ${limits.projectNameMax} caracteres.`))
  }
  if (
    track.centerline.length < limits.controlPointsMin ||
    track.centerline.length > limits.controlPointsMax
  ) {
    issues.push(
      error(`Use entre ${limits.controlPointsMin} e ${limits.controlPointsMax} pontos de controle.`),
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
        `O ponto ${invalidCoordinate + 1} precisa ter coordenadas finitas de até ${limits.coordinateAbsM.toLocaleString('pt-BR')} m.`,
      ),
    )
  }
  if (!finite(track.widthM) || track.widthM <= 0 || track.widthM > limits.trackWidthMaxM) {
    issues.push(error(`A largura deve ser maior que zero e no máximo ${limits.trackWidthMaxM} m.`))
  }
  if (
    track.centerline.length >= limits.controlPointsMin &&
    track.centerline.length <= limits.controlPointsMax &&
    invalidCoordinate < 0 &&
    finite(track.widthM)
  ) {
    issues.push(...validateTrack(track.centerline, track.widthM))
  }

  if (
    !finite(kart.kartMassKg) ||
    kart.kartMassKg < limits.kartMassKgMin ||
    kart.kartMassKg > limits.kartMassKgMax
  ) {
    issues.push(
      error(`A massa do kart deve ficar entre ${limits.kartMassKgMin} e ${limits.kartMassKgMax} kg.`),
    )
  }
  if (
    !finite(kart.driverMassKg) ||
    kart.driverMassKg < limits.driverMassKgMin ||
    kart.driverMassKg > limits.driverMassKgMax
  ) {
    issues.push(
      error(`A massa do piloto deve ficar entre ${limits.driverMassKgMin} e ${limits.driverMassKgMax} kg.`),
    )
  }
  if (!finite(kart.powerHp) || kart.powerHp < limits.powerHpMin || kart.powerHp > limits.powerHpMax) {
    issues.push(error(`A potência deve ficar entre ${limits.powerHpMin} e ${limits.powerHpMax} hp.`))
  }
  if (
    !finite(kart.topSpeedKph) ||
    kart.topSpeedKph < limits.topSpeedKphMin ||
    kart.topSpeedKph > limits.topSpeedKphMax
  ) {
    issues.push(
      error(`A velocidade máxima deve ficar entre ${limits.topSpeedKphMin} e ${limits.topSpeedKphMax} km/h.`),
    )
  }
  if (
    !finite(kart.gripCoefficient) ||
    kart.gripCoefficient < limits.gripCoefficientMin ||
    kart.gripCoefficient > limits.gripCoefficientMax
  ) {
    issues.push(
      error(`A aderência deve ficar entre ${limits.gripCoefficientMin} e ${limits.gripCoefficientMax}.`),
    )
  }
  if (
    !finite(kart.brakeDecelMps2) ||
    kart.brakeDecelMps2 < limits.brakeDecelMinMps2 ||
    kart.brakeDecelMps2 > limits.brakeDecelMaxMps2
  ) {
    issues.push(
      error(`A frenagem deve ficar entre ${limits.brakeDecelMinMps2} e ${limits.brakeDecelMaxMps2} m/s².`),
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
        `A quantidade de amostras deve ser um inteiro entre ${limits.sampleCountMin} e ${limits.sampleCountMax}.`,
      ),
    )
  }
  if (
    !finite(settings.safetyMarginM) ||
    settings.safetyMarginM < 0 ||
    settings.safetyMarginM > limits.safetyMarginMaxM
  ) {
    issues.push(error(`A margem de segurança deve ficar entre 0 e ${limits.safetyMarginMaxM} m.`))
  } else if (finite(track.widthM) && KART_WIDTH_M + settings.safetyMarginM * 2 + 0.05 >= track.widthM) {
    issues.push(
      error(
        `Com um kart de ${KART_WIDTH_M.toFixed(2)} m, essa margem deixa a pista sem corredor utilizável.`,
      ),
    )
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
