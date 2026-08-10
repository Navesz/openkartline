from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from openkartline_engine.schemas import (
    KartV1,
    Point2D,
    SimulationRequestV1,
    SimulationResultV1,
    TrackV1,
)

FIXTURES = Path(__file__).parent / "fixtures"


def test_checked_in_contract_fixtures_are_schema_valid() -> None:
    request = json.loads((FIXTURES / "simulation_request.circle.json").read_text(encoding="utf-8"))
    result = json.loads((FIXTURES / "simulation_result.contract.json").read_text(encoding="utf-8"))
    assert SimulationRequestV1.model_validate(request).track.name.startswith("Synthetic")
    assert SimulationResultV1.model_validate(result).status.state == "success"


def test_contract_rejects_unknown_version_and_fields(circle_request: SimulationRequestV1) -> None:
    payload = circle_request.model_dump()
    payload["track"]["schema_version"] = "2.0"
    payload["kart"]["horsepower"] = 13
    with pytest.raises(ValidationError) as caught:
        SimulationRequestV1.model_validate(payload)
    error_types = {error["type"] for error in caught.value.errors()}
    assert "literal_error" in error_types
    assert "extra_forbidden" in error_types


def test_numeric_bounds_and_non_finite_values_are_rejected() -> None:
    with pytest.raises(ValidationError):
        Point2D(x_m=float("nan"), y_m=0)
    with pytest.raises(ValidationError):
        Point2D(x_m=1_000_001, y_m=0)
    with pytest.raises(ValidationError):
        KartV1(
            name="Impossible",
            total_mass_kg=1,
            power_hp=13,
            top_speed_mps=20,
            max_accel_mps2=3,
            max_brake_mps2=7,
            max_lateral_accel_mps2=10,
        )


def test_track_requires_distinct_points() -> None:
    same = [Point2D(x_m=0, y_m=0)] * 4
    with pytest.raises(ValidationError, match="distinct"):
        TrackV1(name="Bad", direction="clockwise", left_boundary=same, right_boundary=same)


def test_power_conversion(kart: KartV1) -> None:
    assert kart.power_w == pytest.approx(13 * 745.699872)


def test_resistance_parameters_are_optional_and_default_to_the_browser_constants() -> None:
    """A client written against the original 1.0 kart contract must keep working."""

    legacy = KartV1.model_validate(
        {
            "name": "Legacy client kart",
            "total_mass_kg": 175,
            "power_hp": 13,
            "top_speed_mps": 24,
            "max_accel_mps2": 3,
            "max_brake_mps2": 7,
            "max_lateral_accel_mps2": 10,
        }
    )
    assert legacy.schema_version == "1.0"
    assert legacy.drag_area_m2 == 0.8
    assert legacy.rolling_resistance == 0.015

    explicit = legacy.model_copy(update={"drag_area_m2": 0.65, "rolling_resistance": 0.02})
    assert explicit.drag_area_m2 == 0.65
    assert explicit.rolling_resistance == 0.02


@pytest.mark.parametrize(
    "overrides",
    [
        {"drag_area_m2": 0.0},
        {"drag_area_m2": 6.0},
        {"drag_area_m2": float("inf")},
        {"rolling_resistance": -0.001},
        {"rolling_resistance": 0.5},
        {"rolling_resistance": float("nan")},
        {"drag_area_M2": 0.8},
    ],
)
def test_resistance_parameters_reject_unphysical_and_misspelled_values(
    kart: KartV1, overrides: dict[str, object]
) -> None:
    payload = kart.model_dump() | overrides
    with pytest.raises(ValidationError):
        KartV1.model_validate(payload)
