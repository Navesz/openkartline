/**
 * Quasi-steady point-mass speed-profile solver for a closed path.
 *
 * Faithful port of ``solve_speed_profile`` and ``integrate_lap_time`` from
 * ``engine/openkartline_engine/physics.py``. Both sides compute in IEEE
 * float64, so keeping the same constants, operation order, and guards makes
 * the browser demo reproduce the Python engine bit-for-bit (within ~1e-15).
 */

import {
  AIR_DENSITY_KGPM3,
  DRIVETRAIN_EFFICIENCY,
  GRAVITY_MPS2,
  ROLLING_RESISTANCE,
  type KartEnvelope,
} from '../kartModel'

const MIN_TIME_DENOMINATOR_MPS = 1e-6
/** Speed below which the power-limited force is capped, avoiding a 1/v blow-up. */
const MIN_TRACTION_SPEED_MPS = 1
/**
 * Floor for the pedal-demand denominators, so a residual acceleration of 1e-9
 * against a vanishing envelope cannot be reported as full throttle at an apex.
 */
const MIN_CONTROL_DENOMINATOR_MPS2 = 0.1
const DEFAULT_TOLERANCE_MPS = 1e-5
const DEFAULT_MAX_ITERATIONS = 100

export interface SpeedProfileResult {
  speed: number[]
  elapsed: number[]
  longitudinalAccel: number[]
  lateralAccel: number[]
  throttle: number[]
  brake: number[]
  frictionUtilization: number[]
  lapTimeS: number
  iterations: number
  maxConstraintViolation: number
}

/** Fraction of grip left for the longitudinal axis once lateral uses some. */
function gripFraction(lateral: number, maximum: number, exponent: number): number {
  const lateralFraction = Math.min(Math.abs(lateral) / maximum, 1)
  return Math.max(0, 1 - lateralFraction ** exponent) ** (1 / exponent)
}

/**
 * Deceleration from aerodynamic drag and rolling resistance, always opposing motion.
 *
 * Without these the declared top speed had to be forced with an arbitrary
 * taper, and engine power stopped mattering above roughly 30 hp. Real
 * resistance makes power buy speed again and makes mass matter, because the
 * power-limited term scales with 1/m while the rolling term does not.
 */
function resistanceDecel(speed: number, envelope: KartEnvelope): number {
  const drag = 0.5 * AIR_DENSITY_KGPM3 * envelope.dragAreaM2 * speed ** 2
  return drag / envelope.totalMassKg + ROLLING_RESISTANCE * GRAVITY_MPS2
}

/**
 * Net acceleration under power, after resistance and the grip budget.
 *
 * Mirrors ``driveAccelMps2`` in ``apps/web/src/domain/kartModel.ts``: the
 * power and tire envelopes are intersected rather than multiplied, resistance
 * is subtracted from the intersection, and the declared top speed is a hard
 * cap instead of a taper. Unlike kartModel, the friction exponent is a real
 * parameter so the port matches the Python solver for any exponent.
 */
function driveAccel(
  speed: number,
  lateral: number,
  envelope: KartEnvelope,
  frictionExponent: number,
): number {
  if (speed >= envelope.topSpeedMps) return 0
  const powerLimited =
    (envelope.powerW * DRIVETRAIN_EFFICIENCY) /
    (envelope.totalMassKg * Math.max(speed, MIN_TRACTION_SPEED_MPS))
  const tractionLimited =
    envelope.maxAccelMps2 * gripFraction(lateral, envelope.maxLateralAccelMps2, frictionExponent)
  return Math.max(0, Math.min(powerLimited, tractionLimited) - resistanceDecel(speed, envelope))
}

/** Net deceleration under braking; drag and rolling resistance help here. */
function brakeAccel(
  speed: number,
  lateral: number,
  envelope: KartEnvelope,
  frictionExponent: number,
): number {
  const tyreLimited =
    envelope.maxBrakeMps2 * gripFraction(lateral, envelope.maxLateralAccelMps2, frictionExponent)
  return tyreLimited + resistanceDecel(speed, envelope)
}

/** Integrate time exactly from the returned nodal speeds and path segments. */
export function integrateLapTime(
  speed: number[],
  segmentLengths: number[],
): { elapsed: number[]; lapTimeS: number } {
  const valid =
    speed.length === segmentLengths.length &&
    speed.every((v) => Number.isFinite(v) && v >= 0) &&
    segmentLengths.every((ds) => Number.isFinite(ds) && ds >= 0)
  if (!valid) {
    throw new Error('speed and segment lengths must be equal, finite, and non-negative')
  }
  const count = speed.length
  const denominator = speed.map((v, index) => v + speed[(index + 1) % count])
  if (denominator.some((d) => d <= MIN_TIME_DENOMINATOR_MPS)) {
    throw new Error('lap time is undefined for a zero-speed segment')
  }
  const deltaTime = segmentLengths.map((ds, index) => (2 * ds) / denominator[index])
  const elapsed: number[] = [0]
  for (let index = 1; index < count; index += 1) {
    elapsed.push(elapsed[index - 1] + deltaTime[index - 1])
  }
  let lapTimeS = 0
  for (const dt of deltaTime) {
    lapTimeS += dt
  }
  return { elapsed, lapTimeS }
}

/**
 * Solve the cyclic speed envelope with forward acceleration and backward braking.
 *
 * The calculation starts at the lateral-grip ceiling and monotonically tightens
 * it, so every successful result is deterministic for identical numeric inputs.
 */
export function solveSpeedProfile(
  curvature: number[],
  segmentLengths: number[],
  envelope: KartEnvelope,
  options: { frictionExponent: number; toleranceMps?: number; maxIterations?: number },
): SpeedProfileResult {
  const {
    frictionExponent,
    toleranceMps = DEFAULT_TOLERANCE_MPS,
    maxIterations = DEFAULT_MAX_ITERATIONS,
  } = options

  if (curvature.length !== segmentLengths.length || curvature.length < 3) {
    throw new Error('curvature and segment lengths must have equal length >= 3')
  }
  if (segmentLengths.some((ds) => ds <= 0 || !Number.isFinite(ds))) {
    throw new Error('path contains invalid segment lengths')
  }
  if (curvature.some((kappa) => !Number.isFinite(kappa))) {
    throw new Error('path contains invalid curvature')
  }

  const count = curvature.length
  const absoluteCurvature = curvature.map((kappa) => Math.abs(kappa))
  const lateralCeiling = absoluteCurvature.map((kappa) =>
    kappa > 1e-10 ? Math.sqrt(envelope.maxLateralAccelMps2 / kappa) : envelope.topSpeedMps,
  )
  const speed = lateralCeiling.map((ceiling) => Math.min(ceiling, envelope.topSpeedMps))

  let iterations = 0
  let converged = false
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const before = speed.slice()
    for (let index = 0; index < count; index += 1) {
      const following = (index + 1) % count
      const lateral = speed[index] ** 2 * absoluteCurvature[index]
      const available = driveAccel(speed[index], lateral, envelope, frictionExponent)
      const reachable = Math.sqrt(Math.max(0, speed[index] ** 2 + 2 * available * segmentLengths[index]))
      speed[following] = Math.min(speed[following], reachable, envelope.topSpeedMps)
    }
    for (let index = count - 1; index >= 0; index -= 1) {
      const following = (index + 1) % count
      const lateral = speed[following] ** 2 * absoluteCurvature[following]
      const available = brakeAccel(speed[following], lateral, envelope, frictionExponent)
      const reachable = Math.sqrt(Math.max(0, speed[following] ** 2 + 2 * available * segmentLengths[index]))
      speed[index] = Math.min(speed[index], reachable, lateralCeiling[index], envelope.topSpeedMps)
    }
    iterations = iteration
    let maxDelta = 0
    for (let index = 0; index < count; index += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(speed[index] - before[index]))
    }
    if (maxDelta < toleranceMps) {
      converged = true
      break
    }
  }
  if (!converged) {
    throw new Error('speed profile did not converge')
  }

  const longitudinal = new Array<number>(count)
  const lateral = new Array<number>(count)
  for (let index = 0; index < count; index += 1) {
    const following = (index + 1) % count
    longitudinal[index] = (speed[following] ** 2 - speed[index] ** 2) / (2 * segmentLengths[index])
    lateral[index] = speed[index] ** 2 * curvature[index]
  }
  const throttle = new Array<number>(count).fill(0)
  const brake = new Array<number>(count).fill(0)
  const friction = new Array<number>(count).fill(0)
  // The reported violation covers what the solver controls: the longitudinal
  // envelopes and the lateral ceiling. A separate "friction utilization > 1"
  // term is not added, because at the pure-lateral ceiling the tires have no
  // budget left for the resistance they must still cancel, so every apex would
  // report a fixed offset that no amount of solver iteration can remove. That
  // offset is a property of the quasi-steady ceiling shared with the Python
  // engine and is visible in ``frictionUtilization`` itself.
  let maxConstraintViolation = 0

  for (let index = 0; index < count; index += 1) {
    const following = (index + 1) % count
    const acceleration = longitudinal[index]
    const accelerating = acceleration >= 0
    // Braking is limited by the state the kart is braking *into*, so both the
    // grip budget and the resistance term are read at the following node.
    const lateralForControl = accelerating ? lateral[index] : lateral[following]
    const controlSpeed = accelerating ? speed[index] : speed[following]
    const lateralFraction = Math.min(Math.abs(lateralForControl) / envelope.maxLateralAccelMps2, 1)
    // The tires must also produce the force that cancels drag and rolling
    // resistance, so the longitudinal share of the friction budget is the
    // demanded acceleration plus (drive) or minus (braking) the resistance.
    const resistance = resistanceDecel(controlSpeed, envelope)
    let longitudinalFraction: number
    if (accelerating) {
      const available = driveAccel(speed[index], lateralForControl, envelope, frictionExponent)
      throttle[index] = Math.min(1, acceleration / Math.max(available, MIN_CONTROL_DENOMINATOR_MPS2))
      longitudinalFraction = (acceleration + resistance) / envelope.maxAccelMps2
      maxConstraintViolation = Math.max(
        maxConstraintViolation,
        Math.max(0, acceleration - available) / envelope.maxAccelMps2,
      )
    } else {
      const available = brakeAccel(controlSpeed, lateralForControl, envelope, frictionExponent)
      brake[index] = Math.min(1, -acceleration / Math.max(available, MIN_CONTROL_DENOMINATOR_MPS2))
      longitudinalFraction = (-acceleration - resistance) / envelope.maxBrakeMps2
      maxConstraintViolation = Math.max(
        maxConstraintViolation,
        Math.max(0, -acceleration - available) / envelope.maxBrakeMps2,
      )
    }
    friction[index] =
      (Math.max(0, longitudinalFraction) ** frictionExponent + lateralFraction ** frictionExponent) **
      (1 / frictionExponent)
    maxConstraintViolation = Math.max(
      maxConstraintViolation,
      Math.max(0, speed[index] - lateralCeiling[index]) / envelope.topSpeedMps,
    )
  }

  const { elapsed, lapTimeS } = integrateLapTime(speed, segmentLengths)
  const channels = [speed, elapsed, longitudinal, lateral, throttle, brake, friction]
  if (channels.some((channel) => channel.some((v) => !Number.isFinite(v))) || !Number.isFinite(lapTimeS)) {
    throw new Error('speed solver produced non-finite channels')
  }
  return {
    speed,
    elapsed,
    longitudinalAccel: longitudinal,
    lateralAccel: lateral,
    throttle,
    brake,
    frictionUtilization: friction,
    lapTimeS,
    iterations,
    maxConstraintViolation,
  }
}
