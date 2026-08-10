"""Quasi-steady point-mass speed-profile solver for a closed path."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from openkartline_engine.schemas import KartV1

FloatArray = NDArray[np.float64]

GRAVITY_MPS2 = 9.80665
AIR_DENSITY_KGPM3 = 1.225

_MIN_TIME_DENOMINATOR_MPS = 1e-6
#: Speed below which the power-limited force is capped, avoiding a 1/v blow-up.
_MIN_TRACTION_SPEED_MPS = 1.0
#: Floor for the pedal-demand denominators, so a residual acceleration of 1e-9
#: against a vanishing envelope cannot be reported as full throttle at an apex.
_MIN_CONTROL_DENOMINATOR_MPS2 = 0.1


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


def _resistance_decel(speed: float, kart: KartV1) -> float:
    """Deceleration from aerodynamic drag and rolling resistance, always opposing motion.

    Without these the declared top speed had to be forced with an arbitrary
    taper, and engine power stopped mattering above roughly 30 hp. Real
    resistance makes power buy speed again and makes mass matter, because the
    power-limited term scales with 1/m while the rolling term does not.
    """

    drag = 0.5 * AIR_DENSITY_KGPM3 * kart.drag_area_m2 * speed**2
    return float(drag / kart.total_mass_kg + kart.rolling_resistance * GRAVITY_MPS2)


def _drive_accel(
    speed: float,
    lateral_accel: float,
    kart: KartV1,
    friction_exponent: float,
) -> float:
    """Net acceleration under power, after resistance and the grip budget.

    Mirrors ``driveAccelMps2`` in ``apps/web/src/domain/kartModel.ts``: the
    power and tire envelopes are intersected rather than multiplied, resistance
    is subtracted from the intersection, and the declared top speed is a hard
    cap instead of a taper.
    """

    if speed >= kart.top_speed_mps:
        return 0.0
    power_limited = (
        kart.power_w
        * kart.drivetrain_efficiency
        / (kart.total_mass_kg * max(speed, _MIN_TRACTION_SPEED_MPS))
    )
    traction_limited = kart.max_accel_mps2 * _grip_fraction(
        lateral_accel,
        kart.max_lateral_accel_mps2,
        friction_exponent,
    )
    return float(max(0.0, min(power_limited, traction_limited) - _resistance_decel(speed, kart)))


def _brake_accel(
    speed: float,
    lateral_accel: float,
    kart: KartV1,
    friction_exponent: float,
) -> float:
    """Net deceleration under braking; drag and rolling resistance help here.

    Mirrors ``brakeAccelMps2`` in ``apps/web/src/domain/kartModel.ts``.
    """

    tyre_limited = kart.max_brake_mps2 * _grip_fraction(
        lateral_accel,
        kart.max_lateral_accel_mps2,
        friction_exponent,
    )
    return float(tyre_limited + _resistance_decel(speed, kart))


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
            available = _drive_accel(
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
            available = _brake_accel(
                float(speed[following]),
                float(lateral),
                kart,
                friction_exponent,
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
    # The reported violation covers what the solver controls: the longitudinal
    # envelopes and the lateral ceiling. A separate "friction utilization > 1"
    # term is not added, because at the pure-lateral ceiling the tires have no
    # budget left for the resistance they must still cancel, so every apex would
    # report a fixed offset that no amount of solver iteration can remove. That
    # offset is a property of the quasi-steady ceiling shared with the browser
    # engine and is visible in ``friction_utilization`` itself.
    violations: list[float] = []

    for index, acceleration in enumerate(longitudinal):
        following = (index + 1) % len(lateral)
        accelerating = acceleration >= 0
        # Braking is limited by the state the kart is braking *into*, so both the
        # grip budget and the resistance term are read at the following node.
        lateral_for_control = float(lateral[index] if accelerating else lateral[following])
        control_speed = float(speed[index] if accelerating else speed[following])
        lateral_fraction = min(abs(lateral_for_control) / kart.max_lateral_accel_mps2, 1.0)
        # The tires must also produce the force that cancels drag and rolling
        # resistance, so the longitudinal share of the friction budget is the
        # demanded acceleration plus (drive) or minus (braking) the resistance.
        resistance = _resistance_decel(control_speed, kart)
        if accelerating:
            available = _drive_accel(
                float(speed[index]), lateral_for_control, kart, friction_exponent
            )
            throttle[index] = min(
                1.0, float(acceleration) / max(available, _MIN_CONTROL_DENOMINATOR_MPS2)
            )
            longitudinal_fraction = (float(acceleration) + resistance) / kart.max_accel_mps2
            violations.append(max(0.0, float(acceleration) - available) / kart.max_accel_mps2)
        else:
            available = _brake_accel(control_speed, lateral_for_control, kart, friction_exponent)
            brake[index] = min(
                1.0, float(-acceleration) / max(available, _MIN_CONTROL_DENOMINATOR_MPS2)
            )
            longitudinal_fraction = (float(-acceleration) - resistance) / kart.max_brake_mps2
            violations.append(max(0.0, float(-acceleration) - available) / kart.max_brake_mps2)
        friction[index] = (
            max(0.0, longitudinal_fraction) ** friction_exponent
            + lateral_fraction**friction_exponent
        ) ** (1.0 / friction_exponent)
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
