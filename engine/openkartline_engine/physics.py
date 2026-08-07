"""Quasi-steady point-mass speed-profile solver for a closed path."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from openkartline_engine.schemas import KartV1

FloatArray = NDArray[np.float64]
_MIN_TIME_DENOMINATOR_MPS = 1e-6


@dataclass(frozen=True, slots=True)
class SpeedProfile:
    speed: FloatArray
    elapsed: FloatArray
    longitudinal_accel: FloatArray
    lateral_accel: FloatArray
    throttle: FloatArray
    brake: FloatArray
    friction_utilization: FloatArray
    lap_time_s: float
    iterations: int
    max_constraint_violation: float


def _grip_fraction(lateral_accel: float, maximum: float, exponent: float) -> float:
    lateral_fraction = min(abs(lateral_accel) / maximum, 1.0)
    return float(max(0.0, 1.0 - lateral_fraction**exponent) ** (1.0 / exponent))


def _drive_accel(speed: float, kart: KartV1) -> float:
    """Simple traction/power envelope tapering to zero at declared top speed."""

    if speed >= kart.top_speed_mps:
        return 0.0
    power_limited = (
        kart.power_w * kart.drivetrain_efficiency / (kart.total_mass_kg * max(speed, 1.0))
    )
    top_speed_taper = max(0.0, 1.0 - (speed / kart.top_speed_mps) ** 4)
    return float(min(kart.max_accel_mps2, power_limited) * top_speed_taper)


def _available_acceleration(
    speed: float,
    lateral_accel: float,
    kart: KartV1,
    friction_exponent: float,
) -> float:
    """Intersect, rather than multiply, the engine and tire envelopes."""

    engine_limit = _drive_accel(speed, kart)
    tire_limit = kart.max_accel_mps2 * _grip_fraction(
        lateral_accel,
        kart.max_lateral_accel_mps2,
        friction_exponent,
    )
    return min(engine_limit, tire_limit)


def integrate_lap_time(speed: FloatArray, segment_lengths: FloatArray) -> tuple[FloatArray, float]:
    """Integrate time exactly from the returned nodal speeds and path segments."""

    if (
        len(speed) != len(segment_lengths)
        or np.any(speed < 0)
        or np.any(segment_lengths < 0)
        or not np.all(np.isfinite(speed))
        or not np.all(np.isfinite(segment_lengths))
    ):
        raise ValueError("speed and segment lengths must be equal, finite, and non-negative")
    denominator = speed + np.roll(speed, -1)
    if np.any(denominator <= _MIN_TIME_DENOMINATOR_MPS):
        raise ArithmeticError("lap time is undefined for a zero-speed segment")
    delta_time = 2 * segment_lengths / denominator
    elapsed = np.concatenate((np.array([0.0]), np.cumsum(delta_time[:-1])))
    return elapsed, float(np.sum(delta_time))


def solve_speed_profile(
    curvature: FloatArray,
    segment_lengths: FloatArray,
    kart: KartV1,
    *,
    friction_exponent: float,
    tolerance_mps: float = 1e-5,
    max_iterations: int = 100,
) -> SpeedProfile:
    """Solve the cyclic speed envelope with forward acceleration and backward braking.

    The calculation starts at the lateral-grip ceiling and monotonically tightens
    it, so every successful result is deterministic for identical numeric inputs.
    """

    if len(curvature) != len(segment_lengths) or len(curvature) < 3:
        raise ValueError("curvature and segment lengths must have equal length >= 3")
    if np.any(segment_lengths <= 0) or not np.all(np.isfinite(segment_lengths)):
        raise ValueError("path contains invalid segment lengths")
    if not np.all(np.isfinite(curvature)):
        raise ValueError("path contains invalid curvature")

    absolute_curvature = np.abs(curvature)
    lateral_ceiling = np.full(len(curvature), kart.top_speed_mps, dtype=np.float64)
    curved = absolute_curvature > 1e-10
    lateral_ceiling[curved] = np.sqrt(kart.max_lateral_accel_mps2 / absolute_curvature[curved])
    speed = np.minimum(lateral_ceiling, kart.top_speed_mps)

    iterations = 0
    for iteration in range(1, max_iterations + 1):
        before = speed.copy()
        for index in range(len(speed)):
            following = (index + 1) % len(speed)
            lateral = speed[index] ** 2 * absolute_curvature[index]
            available = _available_acceleration(
                float(speed[index]),
                float(lateral),
                kart,
                friction_exponent,
            )
            reachable = np.sqrt(
                max(0.0, speed[index] ** 2 + 2 * available * segment_lengths[index])
            )
            speed[following] = min(speed[following], reachable, kart.top_speed_mps)

        for index in range(len(speed) - 1, -1, -1):
            following = (index + 1) % len(speed)
            lateral = speed[following] ** 2 * absolute_curvature[following]
            available = kart.max_brake_mps2 * _grip_fraction(
                float(lateral), kart.max_lateral_accel_mps2, friction_exponent
            )
            reachable = np.sqrt(
                max(0.0, speed[following] ** 2 + 2 * available * segment_lengths[index])
            )
            speed[index] = min(speed[index], reachable, lateral_ceiling[index], kart.top_speed_mps)

        iterations = iteration
        if float(np.max(np.abs(speed - before))) < tolerance_mps:
            break
    else:
        raise ArithmeticError("speed profile did not converge")

    following_speed = np.roll(speed, -1)
    longitudinal = (following_speed**2 - speed**2) / (2 * segment_lengths)
    lateral = speed**2 * curvature
    throttle = np.zeros_like(speed)
    brake = np.zeros_like(speed)
    friction = np.zeros_like(speed)
    violations: list[float] = []

    for index, acceleration in enumerate(longitudinal):
        lateral_for_control = (
            lateral[index] if acceleration >= 0 else lateral[(index + 1) % len(lateral)]
        )
        lateral_fraction = min(abs(lateral_for_control) / kart.max_lateral_accel_mps2, 1.0)
        grip = _grip_fraction(
            float(lateral_for_control), kart.max_lateral_accel_mps2, friction_exponent
        )
        if acceleration >= 0:
            engine_limit = _drive_accel(float(speed[index]), kart)
            available = min(engine_limit, kart.max_accel_mps2 * grip)
            throttle[index] = min(1.0, float(acceleration) / max(engine_limit, 1e-12))
            longitudinal_fraction = float(acceleration) / kart.max_accel_mps2
            violations.append(max(0.0, float(acceleration) - available) / kart.max_accel_mps2)
        else:
            available = kart.max_brake_mps2 * grip
            brake[index] = min(1.0, float(-acceleration) / max(available, 1e-12))
            longitudinal_fraction = float(-acceleration) / kart.max_brake_mps2
            violations.append(max(0.0, float(-acceleration) - available) / kart.max_brake_mps2)
        friction[index] = (
            max(0.0, longitudinal_fraction) ** friction_exponent
            + lateral_fraction**friction_exponent
        ) ** (1.0 / friction_exponent)
        violations.append(max(0.0, float(friction[index]) - 1.0))
        violations.append(
            max(0.0, float(speed[index]) - float(lateral_ceiling[index])) / kart.top_speed_mps
        )

    elapsed, lap_time = integrate_lap_time(speed, segment_lengths)
    arrays = (speed, elapsed, longitudinal, lateral, throttle, brake, friction)
    if not all(np.all(np.isfinite(array)) for array in arrays) or not np.isfinite(lap_time):
        raise ArithmeticError("speed solver produced non-finite channels")
    return SpeedProfile(
        speed=speed,
        elapsed=elapsed,
        longitudinal_accel=longitudinal,
        lateral_accel=lateral,
        throttle=throttle,
        brake=brake,
        friction_utilization=friction,
        lap_time_s=lap_time,
        iterations=iterations,
        max_constraint_violation=max(violations, default=0.0),
    )
