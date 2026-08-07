import type { KartInput } from './types'

/**
 * Single source of truth for the point-mass kart envelope.
 *
 * The browser fallback and the Python engine adapter both derive their inputs
 * here so that switching engines cannot silently change the modelled kart. Any
 * constant used by only one of them is a divergence waiting to happen.
 */

export const GRAVITY_MPS2 = 9.80665
export const HP_TO_WATTS = 745.699872
export const FRICTION_EXPONENT = 2
export const DRIVETRAIN_EFFICIENCY = 0.82
export const AIR_DENSITY_KGPM3 = 1.225

/**
 * Resistance and traction constants for a kart with an upright driver.
 *
 * A kart has no bodywork and the driver sits in clean air, so its drag area is
 * large for the frontal size. Wheelbase follows the CIK-FIA 1010-1070 mm range;
 * the centre of gravity is low because the driver sits on the floor pan.
 * These describe the chassis class, not a measured kart: see docs/PHYSICS.md.
 */
export const DRAG_AREA_M2 = 0.8
export const ROLLING_RESISTANCE = 0.015
export const REAR_WEIGHT_FRACTION = 0.56
export const COG_HEIGHT_M = 0.28
export const WHEELBASE_M = 1.05

/**
 * Overall kart width, from the CIK-FIA 1400 mm maximum that rental chassis follow.
 *
 * The racing line is the path of the kart's centre, so the usable corridor is
 * the track width less half a kart on each side. Chapter 2 of the KTips guide
 * describes the racing line as using the full width of the track, with the apex
 * on the inside edge: what actually stops the line there is the kart's body,
 * not a buffer chosen by hand.
 */
export const KART_WIDTH_M = 1.4
export const KART_HALF_WIDTH_M = KART_WIDTH_M / 2

/**
 * Tyre load sensitivity: the friction coefficient falls as vertical load rises.
 *
 * Without it a point-mass kart corners at `sqrt(mu*g/kappa)` regardless of mass,
 * so ballast could only ever cost time in the acceleration zones. Field testing
 * at Lusail found roughly 0.7-0.8 s per 10 kg, far more than acceleration alone
 * explains. The exponent is a literature value for racing tyres, not a fit to
 * that measurement; see docs/PHYSICS.md.
 */
export const LOAD_SENSITIVITY_EXPONENT = 0.15
export const REFERENCE_TOTAL_MASS_KG = 190

/** Speed below which the power-limited force is capped, avoiding a 1/v blow-up. */
const MIN_TRACTION_SPEED_MPS = 1

export interface KartEnvelope {
  totalMassKg: number
  powerW: number
  topSpeedMps: number
  /** Rear-axle traction ceiling under power, including longitudinal load transfer. */
  maxAccelMps2: number
  maxBrakeMps2: number
  maxLateralAccelMps2: number
  dragAreaM2: number
}

/**
 * Longitudinal traction ceiling of a rear-wheel-drive kart.
 *
 * Accelerating transfers load rearwards, which raises the very limit that is
 * being used, so the ceiling is the fixed point of
 * `a = mu*g*(rear + a*h/(g*L))`. Using a flat fraction of `mu*g` instead — the
 * previous `0.52` — made the ceiling the single most influential number in the
 * model while having no physical derivation.
 */
export function tractionCeilingMps2(maxLateralAccelMps2: number): number {
  const gripCoefficient = maxLateralAccelMps2 / GRAVITY_MPS2
  const transfer = (gripCoefficient * COG_HEIGHT_M) / WHEELBASE_M
  // Load transfer cannot recover more grip than the axle can hold; the guard
  // keeps absurd grip inputs from producing an infinite ceiling.
  return (maxLateralAccelMps2 * REAR_WEIGHT_FRACTION) / Math.max(0.2, 1 - transfer)
}

export function kartEnvelope(kart: KartInput): KartEnvelope {
  const totalMassKg = kart.kartMassKg + kart.driverMassKg
  // `gripCoefficient` describes the tyre at the reference mass; heavier karts
  // get proportionally less of it back.
  const loaded = kart.gripCoefficient * (REFERENCE_TOTAL_MASS_KG / totalMassKg) ** LOAD_SENSITIVITY_EXPONENT
  const maxLateralAccelMps2 = loaded * GRAVITY_MPS2
  return {
    totalMassKg,
    powerW: kart.powerHp * HP_TO_WATTS,
    topSpeedMps: kart.topSpeedKph / 3.6,
    maxAccelMps2: tractionCeilingMps2(maxLateralAccelMps2),
    maxBrakeMps2: kart.brakeDecelMps2,
    maxLateralAccelMps2,
    dragAreaM2: DRAG_AREA_M2,
  }
}

/** Fraction of grip left for one axis once the other is already using some. */
export function remainingGripFraction(lateralAccelerationMps2: number, maximumLateral: number): number {
  const lateralFraction = Math.min(1, Math.abs(lateralAccelerationMps2) / maximumLateral)
  return Math.max(0, 1 - lateralFraction ** FRICTION_EXPONENT) ** (1 / FRICTION_EXPONENT)
}

/**
 * Deceleration from aerodynamic drag and rolling resistance, always opposing motion.
 *
 * Without these the declared top speed had to be forced with an arbitrary taper,
 * and engine power stopped mattering: every kart above roughly 30 hp produced
 * exactly the same lap. Real resistance makes power buy speed again, and makes
 * mass matter because the power-limited term scales with 1/m.
 */
export function resistanceDecelMps2(speedMps: number, envelope: KartEnvelope): number {
  const drag = 0.5 * AIR_DENSITY_KGPM3 * envelope.dragAreaM2 * speedMps ** 2
  return drag / envelope.totalMassKg + ROLLING_RESISTANCE * GRAVITY_MPS2
}

/** Net acceleration available under power, after resistance and the grip budget. */
export function driveAccelMps2(
  speedMps: number,
  lateralAccelerationMps2: number,
  envelope: KartEnvelope,
): number {
  if (speedMps >= envelope.topSpeedMps) return 0
  const powerLimited =
    (envelope.powerW * DRIVETRAIN_EFFICIENCY) /
    (envelope.totalMassKg * Math.max(speedMps, MIN_TRACTION_SPEED_MPS))
  const tractionLimited =
    envelope.maxAccelMps2 * remainingGripFraction(lateralAccelerationMps2, envelope.maxLateralAccelMps2)
  return Math.max(0, Math.min(powerLimited, tractionLimited) - resistanceDecelMps2(speedMps, envelope))
}

/** Net deceleration under braking; drag and rolling resistance help here. */
export function brakeAccelMps2(
  speedMps: number,
  lateralAccelerationMps2: number,
  envelope: KartEnvelope,
): number {
  const tyreLimited =
    envelope.maxBrakeMps2 * remainingGripFraction(lateralAccelerationMps2, envelope.maxLateralAccelMps2)
  return tyreLimited + resistanceDecelMps2(speedMps, envelope)
}
