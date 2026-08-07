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

/** Share of the friction circle available longitudinally under power. */
export const LONGITUDINAL_GRIP_SHARE = 0.52

export interface KartEnvelope {
  totalMassKg: number
  powerW: number
  topSpeedMps: number
  maxAccelMps2: number
  maxBrakeMps2: number
  maxLateralAccelMps2: number
}

export function kartEnvelope(kart: KartInput): KartEnvelope {
  const maxLateralAccelMps2 = kart.gripCoefficient * GRAVITY_MPS2
  return {
    totalMassKg: kart.kartMassKg + kart.driverMassKg,
    powerW: kart.powerHp * HP_TO_WATTS,
    topSpeedMps: kart.topSpeedKph / 3.6,
    maxAccelMps2: maxLateralAccelMps2 * LONGITUDINAL_GRIP_SHARE,
    maxBrakeMps2: kart.brakeDecelMps2,
    maxLateralAccelMps2,
  }
}

/** Fraction of grip left for one axis once the other is already using some. */
export function remainingGripFraction(lateralAccelerationMps2: number, maximumLateral: number): number {
  const lateralFraction = Math.min(1, Math.abs(lateralAccelerationMps2) / maximumLateral)
  return Math.max(0, 1 - lateralFraction ** FRICTION_EXPONENT) ** (1 / FRICTION_EXPONENT)
}
