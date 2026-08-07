from __future__ import annotations

import numpy as np
import pytest

from openkartline_engine.physics import (
    _available_acceleration,
    _drive_accel,
    integrate_lap_time,
    solve_speed_profile,
)
from openkartline_engine.schemas import KartV1


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
        power_hp=0.5,
        top_speed_mps=30,
        max_accel_mps2=3,
        max_brake_mps2=7,
        max_lateral_accel_mps2=10,
    )
    engine_limit = _drive_accel(10.0, low_power)
    assert _available_acceleration(10.0, 5.0, low_power, 2) == pytest.approx(engine_limit)

    high_power = low_power.model_copy(update={"name": "High power", "power_hp": 250.0})
    tire_limit = high_power.max_accel_mps2 * np.sqrt(1 - (9 / 10) ** 2)
    assert _drive_accel(10.0, high_power) > tire_limit
    assert _available_acceleration(10.0, 9.0, high_power, 2) == pytest.approx(tire_limit)


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
    assert float(np.max(result.friction_utilization)) <= 1 + 1e-9


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
