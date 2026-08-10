from __future__ import annotations

import numpy as np
import pytest

from openkartline_engine.physics import (
    AIR_DENSITY_KGPM3,
    GRAVITY_MPS2,
    _brake_accel,
    _drive_accel,
    _resistance_decel,
    integrate_lap_time,
    solve_speed_profile,
)
from openkartline_engine.schemas import KartV1

#: Straight-line layout: a long constant-radius-free straight into a tight corner.
_STRAIGHT_NODES = 360
_CORNER_NODES = 40
_SEGMENT_LENGTH_M = 1.0
_CORNER_CURVATURE_1PM = 0.15


def _straight_into_corner() -> tuple[np.ndarray, np.ndarray]:
    count = _STRAIGHT_NODES + _CORNER_NODES
    curvature = np.zeros(count)
    curvature[_STRAIGHT_NODES:] = _CORNER_CURVATURE_1PM
    return curvature, np.full(count, _SEGMENT_LENGTH_M)


def test_lap_time_uses_trapezoidal_identity_from_nodal_speeds() -> None:
    speed = np.asarray([4.0, 6.0, 8.0, 5.0])
    lengths = np.asarray([2.0, 3.0, 4.0, 5.0])
    elapsed, lap_time = integrate_lap_time(speed, lengths)
    expected_segments = 2 * lengths / (speed + np.roll(speed, -1))
    assert elapsed == pytest.approx(
        np.concatenate((np.asarray([0.0]), np.cumsum(expected_segments[:-1])))
    )
    assert lap_time == pytest.approx(float(np.sum(expected_segments)))


def test_acceleration_is_intersection_of_power_and_grip_envelopes() -> None:
    low_power = KartV1(
        name="Low power",
        total_mass_kg=175,
        power_hp=5,
        top_speed_mps=30,
        max_accel_mps2=3,
        max_brake_mps2=7,
        max_lateral_accel_mps2=10,
    )
    resistance = _resistance_decel(10.0, low_power)
    power_limited = (
        low_power.power_w * low_power.drivetrain_efficiency / (low_power.total_mass_kg * 10.0)
    )
    assert _drive_accel(10.0, 5.0, low_power, 2) == pytest.approx(power_limited - resistance)

    high_power = low_power.model_copy(update={"name": "High power", "power_hp": 250.0})
    tire_limit = high_power.max_accel_mps2 * np.sqrt(1 - (9 / 10) ** 2)
    assert _drive_accel(10.0, 9.0, high_power, 2) == pytest.approx(tire_limit - resistance)

    # An envelope smaller than the resistance leaves nothing, never a negative
    # drive acceleration: the browser model clamps at zero and so must this one.
    anaemic = low_power.model_copy(update={"name": "Anaemic", "power_hp": 0.5})
    assert _drive_accel(10.0, 5.0, anaemic, 2) == 0.0


def test_resistance_matches_the_browser_constants(kart: KartV1) -> None:
    """The Python engine must use the same drag law as ``kartModel.ts``."""

    assert AIR_DENSITY_KGPM3 == 1.225
    assert kart.drag_area_m2 == 0.8
    assert kart.rolling_resistance == 0.015
    expected = 0.5 * 1.225 * 0.8 * 18.0**2 / kart.total_mass_kg + 0.015 * GRAVITY_MPS2
    assert _resistance_decel(18.0, kart) == pytest.approx(expected)
    assert _resistance_decel(0.0, kart) == pytest.approx(0.015 * GRAVITY_MPS2)


def test_drag_lowers_drive_acceleration_and_grows_with_speed_squared(kart: KartV1) -> None:
    """The gap to the pure power/traction envelope is the resistance itself."""

    strong = kart.model_copy(update={"name": "Strong", "power_hp": 60.0})
    rolling = strong.rolling_resistance * GRAVITY_MPS2

    def gap(speed: float) -> float:
        power_limited = (
            strong.power_w * strong.drivetrain_efficiency / (strong.total_mass_kg * speed)
        )
        pure = min(power_limited, strong.max_accel_mps2)
        available = _drive_accel(speed, 0.0, strong, 2)
        assert available > 0.0
        assert available < pure
        return pure - available

    # At a realistic mid-corner-exit speed the loss is already a fifth of a g.
    assert gap(16.0) == pytest.approx(_resistance_decel(16.0, strong))
    assert gap(16.0) > 0.8
    # Doubling the speed quadruples the aerodynamic part; rolling stays constant.
    assert gap(16.0) - rolling == pytest.approx(4 * (gap(8.0) - rolling))
    assert gap(8.0) - rolling == pytest.approx(4 * (gap(4.0) - rolling))


def test_drive_acceleration_has_no_top_speed_taper(kart: KartV1) -> None:
    """The declared top speed is a hard cap, not a multiplicative fudge."""

    monster = kart.model_copy(update={"name": "Monster", "power_hp": 250.0})
    speed = 0.9 * monster.top_speed_mps
    power_limited = (
        monster.power_w * monster.drivetrain_efficiency / (monster.total_mass_kg * speed)
    )
    untapered = min(power_limited, monster.max_accel_mps2) - _resistance_decel(speed, monster)
    assert _drive_accel(speed, 0.0, monster, 2) == pytest.approx(untapered)
    # The removed taper would have cut this by a factor of 1 - 0.9**4 here.
    assert _drive_accel(speed, 0.0, monster, 2) > 2.5 * untapered * (1 - 0.9**4)

    assert _drive_accel(monster.top_speed_mps, 0.0, monster, 2) == 0.0
    assert _drive_accel(2 * monster.top_speed_mps, 0.0, monster, 2) == 0.0


def test_oversized_engine_still_respects_the_declared_top_speed(kart: KartV1) -> None:
    monster = kart.model_copy(update={"name": "Monster", "power_hp": 250.0})
    curvature, lengths = _straight_into_corner()
    result = solve_speed_profile(curvature, lengths, monster, friction_exponent=2)
    assert float(np.max(result.speed)) <= monster.top_speed_mps + 1e-12
    # Without the taper the straight is long enough to actually reach the cap.
    assert float(np.max(result.speed)) == pytest.approx(monster.top_speed_mps)
    assert result.max_constraint_violation < 2e-4


def test_resistance_shortens_the_braking_distance(kart: KartV1) -> None:
    """Drag and rolling resistance add to the tire-limited deceleration."""

    curvature, lengths = _straight_into_corner()
    result = solve_speed_profile(curvature, lengths, kart, friction_exponent=2)

    entry = _STRAIGHT_NODES - 1
    braking_distance_m = 20.0
    start = entry - int(braking_distance_m / _SEGMENT_LENGTH_M)
    entry_speed = float(result.speed[entry])
    start_speed = float(result.speed[start])
    assert start_speed < kart.top_speed_mps  # the braking limit binds here, not the cap

    # Same speed change, but assuming the tires are the only thing slowing the kart.
    tire_only_distance_m = (start_speed**2 - entry_speed**2) / (2 * kart.max_brake_mps2)
    assert braking_distance_m < 0.95 * tire_only_distance_m

    # Equivalently: the kart may still be going faster than the tires alone allow.
    assert start_speed > np.sqrt(entry_speed**2 + 2 * kart.max_brake_mps2 * braking_distance_m)
    assert _brake_accel(start_speed, 0.0, kart, 2) == pytest.approx(
        kart.max_brake_mps2 + _resistance_decel(start_speed, kart)
    )


def test_constant_radius_is_lateral_grip_limited(kart) -> None:  # type: ignore[no-untyped-def]
    count = 200
    radius = 10.0
    curvature = np.full(count, 1 / radius)
    lengths = np.full(count, 2 * np.pi * radius / count)
    result = solve_speed_profile(curvature, lengths, kart, friction_exponent=2)
    expected = np.sqrt(kart.max_lateral_accel_mps2 * radius)
    assert result.speed == pytest.approx(np.full(count, expected), rel=1e-8)
    assert result.lap_time_s == pytest.approx(2 * np.pi * radius / expected)
    assert result.longitudinal_accel == pytest.approx(np.zeros(count), abs=1e-9)
    # Holding the pure-lateral ceiling now costs slightly more than the tires
    # have, because they must also cancel drag and rolling resistance.
    expected_friction = float(
        np.hypot(1.0, _resistance_decel(float(expected), kart) / kart.max_accel_mps2)
    )
    assert expected_friction > 1.0
    assert float(np.max(result.friction_utilization)) == pytest.approx(expected_friction)


def test_speed_profile_brakes_for_tight_section_and_respects_limits(kart) -> None:  # type: ignore[no-untyped-def]
    count = 240
    curvature = np.full(count, 0.005)
    curvature[100:130] = 0.12
    lengths = np.full(count, 0.75)
    result = solve_speed_profile(curvature, lengths, kart, friction_exponent=2)
    assert float(np.min(result.speed[100:130])) < float(np.max(result.speed[:60]))
    assert np.any(result.brake > 0.1)
    assert np.any(result.throttle > 0.1)
    assert result.max_constraint_violation < 2e-4
    assert result.iterations > 0


@pytest.mark.parametrize(
    ("curvature", "lengths", "message"),
    [
        (np.zeros(2), np.ones(2), "equal length"),
        (np.zeros(4), np.asarray([1, 1, 0, 1]), "segment lengths"),
        (np.asarray([0, 0, np.nan, 0]), np.ones(4), "curvature"),
    ],
)
def test_invalid_numeric_inputs_fail_cleanly(curvature, lengths, message, kart) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError, match=message):
        solve_speed_profile(curvature, lengths, kart, friction_exponent=2)
