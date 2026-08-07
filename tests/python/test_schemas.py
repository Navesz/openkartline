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
