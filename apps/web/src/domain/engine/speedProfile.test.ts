import { describe, expect, it } from 'vitest'
import {
  AIR_DENSITY_KGPM3,
  GRAVITY_MPS2,
  HP_TO_WATTS,
  ROLLING_RESISTANCE,
  type KartEnvelope,
} from '../kartModel'
import { integrateLapTime, solveSpeedProfile } from './speedProfile'

/**
 * Mirrors ``tests/python/test_physics.py``. The kart below is the ``kart``
 * fixture from ``tests/python/conftest.py`` (defaults drivetrain efficiency
 * 0.82, drag area 0.8 m², rolling resistance 0.015) mapped onto KartEnvelope.
 */
const TEST_KART: KartEnvelope = {
  totalMassKg: 175,
  powerW: 13 * HP_TO_WATTS,
  topSpeedMps: 24,
  maxAccelMps2: 3,
  maxBrakeMps2: 7,
  maxLateralAccelMps2: 10,
  dragAreaM2: 0.8,
}

// Straight-line layout: a long constant-radius-free straight into a tight corner.
const STRAIGHT_NODES = 360
const CORNER_NODES = 40
const SEGMENT_LENGTH_M = 1
const CORNER_CURVATURE_1PM = 0.15

function straightIntoCorner(): { curvature: number[]; segmentLengths: number[] } {
  const count = STRAIGHT_NODES + CORNER_NODES
  const curvature = new Array<number>(count).fill(0)
  for (let index = STRAIGHT_NODES; index < count; index += 1) {
    curvature[index] = CORNER_CURVATURE_1PM
  }
  return { curvature, segmentLengths: new Array<number>(count).fill(SEGMENT_LENGTH_M) }
}

// Gentle sweeper with a tight section: the surrounding 0.005 curvature keeps
// the lateral grip fraction strictly between 0 and 1 on the acceleration zone,
// which is where the friction exponent actually moves the fixed point.
function tightSectionLayout(): { curvature: number[]; segmentLengths: number[] } {
  const count = 240
  const curvature = new Array<number>(count).fill(0.005)
  for (let index = 100; index < 130; index += 1) {
    curvature[index] = 0.12
  }
  return { curvature, segmentLengths: new Array<number>(count).fill(0.75) }
}

describe('integrateLapTime', () => {
  it('uses the trapezoidal identity from nodal speeds', () => {
    const speed = [4, 6, 8, 5]
    const lengths = [2, 3, 4, 5]
    const { elapsed, lapTimeS } = integrateLapTime(speed, lengths)
    const segments = lengths.map((ds, index) => (2 * ds) / (speed[index] + speed[(index + 1) % speed.length]))
    const expectedElapsed = [0]
    for (let index = 0; index < segments.length - 1; index += 1) {
      expectedElapsed.push(expectedElapsed[index] + segments[index])
    }
    expect(elapsed).toEqual(expectedElapsed)
    expect(lapTimeS).toBe(segments.reduce((total, dt) => total + dt, 0))
  })

  it('is undefined for a zero-speed segment', () => {
    expect(() => integrateLapTime([0, 0, 5], [1, 1, 1])).toThrow(
      'lap time is undefined for a zero-speed segment',
    )
  })

  it.each([
    { speed: [4, 6], lengths: [2, 3, 4], label: 'mismatched lengths' },
    { speed: [4, -1, 5], lengths: [2, 3, 4], label: 'negative speed' },
    { speed: [4, Number.NaN, 5], lengths: [2, 3, 4], label: 'non-finite speed' },
    { speed: [4, 6, 8], lengths: [2, 3, Number.POSITIVE_INFINITY], label: 'non-finite length' },
  ])('rejects invalid input: $label', ({ speed, lengths }) => {
    expect(() => integrateLapTime(speed, lengths)).toThrow(
      'speed and segment lengths must be equal, finite, and non-negative',
    )
  })
})

describe('solveSpeedProfile', () => {
  it('holds a constant-radius lap at the lateral grip ceiling', () => {
    const count = 200
    const radius = 10
    const curvature = new Array<number>(count).fill(1 / radius)
    const segmentLengths = new Array<number>(count).fill((2 * Math.PI * radius) / count)
    const result = solveSpeedProfile(curvature, segmentLengths, TEST_KART, { frictionExponent: 2 })
    const expectedSpeed = Math.sqrt(TEST_KART.maxLateralAccelMps2 * radius)
    result.speed.forEach((v) => expect(v).toBeCloseTo(expectedSpeed, 12))
    expect(result.lapTimeS).toBeCloseTo((2 * Math.PI * radius) / expectedSpeed, 12)
    result.longitudinalAccel.forEach((a) => expect(Math.abs(a)).toBeLessThan(1e-9))
    // Holding the pure-lateral ceiling costs slightly more than the tires have,
    // because they must also cancel drag and rolling resistance.
    const resistance =
      (0.5 * AIR_DENSITY_KGPM3 * TEST_KART.dragAreaM2 * expectedSpeed ** 2) / TEST_KART.totalMassKg +
      ROLLING_RESISTANCE * GRAVITY_MPS2
    const expectedFriction = Math.hypot(1, resistance / TEST_KART.maxAccelMps2)
    expect(expectedFriction).toBeGreaterThan(1)
    expect(Math.max(...result.frictionUtilization)).toBeCloseTo(expectedFriction, 10)
  })

  it('lets an oversized engine reach the declared top speed on a long straight', () => {
    const monster = { ...TEST_KART, powerW: 250 * HP_TO_WATTS }
    const { curvature, segmentLengths } = straightIntoCorner()
    const result = solveSpeedProfile(curvature, segmentLengths, monster, { frictionExponent: 2 })
    const maxSpeed = Math.max(...result.speed)
    expect(maxSpeed).toBeLessThanOrEqual(monster.topSpeedMps + 1e-12)
    // Without a taper the straight is long enough to actually reach the cap.
    expect(maxSpeed).toBeCloseTo(monster.topSpeedMps, 9)
    expect(result.maxConstraintViolation).toBeLessThan(2e-4)
  })

  it('shortens the braking distance because resistance helps the tires', () => {
    const { curvature, segmentLengths } = straightIntoCorner()
    const result = solveSpeedProfile(curvature, segmentLengths, TEST_KART, { frictionExponent: 2 })

    const entry = STRAIGHT_NODES - 1
    const brakingDistanceM = 20
    const start = entry - brakingDistanceM / SEGMENT_LENGTH_M
    const entrySpeed = result.speed[entry]
    const startSpeed = result.speed[start]
    expect(startSpeed).toBeLessThan(TEST_KART.topSpeedMps) // the braking limit binds, not the cap

    // Same speed change, but assuming the tires are the only thing slowing the kart.
    const tireOnlyDistanceM = (startSpeed ** 2 - entrySpeed ** 2) / (2 * TEST_KART.maxBrakeMps2)
    expect(brakingDistanceM).toBeLessThan(0.95 * tireOnlyDistanceM)

    // Equivalently: the kart may still be going faster than the tires alone allow.
    expect(startSpeed).toBeGreaterThan(
      Math.sqrt(entrySpeed ** 2 + 2 * TEST_KART.maxBrakeMps2 * brakingDistanceM),
    )
  })

  it('brakes upstream of a tight section and respects the pedal limits', () => {
    const { curvature, segmentLengths } = tightSectionLayout()
    const result = solveSpeedProfile(curvature, segmentLengths, TEST_KART, { frictionExponent: 2 })
    expect(Math.min(...result.speed.slice(100, 130))).toBeLessThan(Math.max(...result.speed.slice(0, 60)))
    // Braking happens on the approach, before the corner nodes.
    expect(result.brake.slice(0, 100).some((b) => b > 0.1)).toBe(true)
    expect(result.throttle.some((t) => t > 0.1)).toBe(true)
    result.throttle.forEach((t) => {
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(1)
    })
    result.brake.forEach((b) => {
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
    })
    expect(result.maxConstraintViolation).toBeLessThan(2e-4)
    expect(result.iterations).toBeGreaterThan(0)
  })

  it('treats the friction exponent as a parameter, not a hardcoded constant', () => {
    const { curvature, segmentLengths } = tightSectionLayout()
    const quadratic = solveSpeedProfile(curvature, segmentLengths, TEST_KART, { frictionExponent: 2 })
    const cubic = solveSpeedProfile(curvature, segmentLengths, TEST_KART, { frictionExponent: 3 })
    expect(cubic.speed).not.toEqual(quadratic.speed)
    expect(cubic.lapTimeS).not.toBe(quadratic.lapTimeS)
  })

  it('throws when the iteration budget runs out before convergence', () => {
    const { curvature, segmentLengths } = straightIntoCorner()
    expect(() =>
      solveSpeedProfile(curvature, segmentLengths, TEST_KART, { frictionExponent: 2, maxIterations: 1 }),
    ).toThrow('speed profile did not converge')
  })

  it('is deterministic for identical numeric inputs', () => {
    const { curvature, segmentLengths } = tightSectionLayout()
    const first = solveSpeedProfile(curvature, segmentLengths, TEST_KART, { frictionExponent: 2 })
    const second = solveSpeedProfile(curvature, segmentLengths, TEST_KART, { frictionExponent: 2 })
    expect(second).toEqual(first)
  })

  it.each([
    { curvature: [0, 0], lengths: [1, 1], message: 'equal length' },
    { curvature: [0, 0, 0, 0], lengths: [1, 1, 0, 1], message: 'segment lengths' },
    { curvature: [0, 0, Number.NaN, 0], lengths: [1, 1, 1, 1], message: 'curvature' },
  ])('rejects invalid numeric input: $message', ({ curvature, lengths, message }) => {
    expect(() => solveSpeedProfile(curvature, lengths, TEST_KART, { frictionExponent: 2 })).toThrow(message)
  })
})
