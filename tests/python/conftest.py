from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import numpy as np
import pytest

from openkartline_engine.schemas import KartV1, Point2D, SimulationRequestV1, TrackV1

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def circle_request() -> SimulationRequestV1:
    payload = json.loads((FIXTURES / "simulation_request.circle.json").read_text(encoding="utf-8"))
    return SimulationRequestV1.model_validate(payload)


@pytest.fixture
def kart() -> KartV1:
    return KartV1(
        name="Test kart",
        total_mass_kg=175,
        power_hp=13,
        top_speed_mps=24,
        max_accel_mps2=3,
        max_brake_mps2=7,
        max_lateral_accel_mps2=10,
    )


@pytest.fixture
def serpentine_track() -> TrackV1:
    """A corner-rich closed circuit, unlike the near-analytic circle and oval.

    Discretization error and path-solver behaviour are both curvature driven, so
    a low-curvature fixture cannot detect regressions that only appear once a
    circuit actually has corners.
    """

    theta = np.linspace(0, 2 * np.pi, 400, endpoint=False)
    radius = 50 + 14 * np.sin(5 * theta)

    def ring(offset: float) -> list[Point2D]:
        scaled = radius + offset
        return [
            Point2D(x_m=float(r * np.cos(t)), y_m=float(r * np.sin(t)))
            for r, t in zip(scaled, theta, strict=True)
        ]

    return TrackV1(
        name="Synthetic serpentine",
        direction="counterclockwise",
        left_boundary=ring(-4.0),
        right_boundary=ring(4.0),
    )


@pytest.fixture
def track_factory() -> Callable[..., TrackV1]:
    def make_track(
        *,
        radius_x: float = 40.0,
        radius_y: float = 20.0,
        width: float = 4.0,
        count: int = 80,
        direction: str = "counterclockwise",
    ) -> TrackV1:
        theta = np.linspace(0, 2 * np.pi, count, endpoint=False)
        # This synthetic oval uses radially offset boundaries, which is sufficient
        # for deterministic geometry/physics regression tests.
        inner_scale = 1 - width / (2 * min(radius_x, radius_y))
        outer_scale = 1 + width / (2 * min(radius_x, radius_y))
        inner = np.column_stack(
            (radius_x * inner_scale * np.cos(theta), radius_y * inner_scale * np.sin(theta))
        )
        outer = np.column_stack(
            (radius_x * outer_scale * np.cos(theta), radius_y * outer_scale * np.sin(theta))
        )
        left_points, right_points = (
            (inner, outer) if direction == "counterclockwise" else (outer[::-1], inner[::-1])
        )
        return TrackV1(
            name="Synthetic oval",
            direction=direction,  # type: ignore[arg-type]
            left_boundary=[Point2D(x_m=x, y_m=y) for x, y in left_points],
            right_boundary=[Point2D(x_m=x, y_m=y) for x, y in right_points],
        )

    return make_track
