"""Versioned public contracts for the engine and HTTP API.

All canonical quantities use SI units. ``power_hp`` is the one deliberate UX
exception because kart engines are commonly described in mechanical horsepower;
it is converted to watts by the solver.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_VERSION = "1.0"
ENGINE_VERSION = "0.1.0"
MAX_ABS_COORDINATE_M = 1_000_000.0
MAX_BOUNDARY_POINTS = 2_000

FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
PositiveFiniteFloat = Annotated[float, Field(gt=0, allow_inf_nan=False)]
NonNegativeFiniteFloat = Annotated[float, Field(ge=0, allow_inf_nan=False)]
PathTerminationReason: TypeAlias = Literal[
    "skipped",
    "gradient_tolerance",
    "step_tolerance",
    "no_progress",
    "iteration_limit",
]


class StrictModel(BaseModel):
    """Base contract that rejects misspelled or unsupported fields."""

    model_config = ConfigDict(extra="forbid")


class Point2D(StrictModel):
    """A point in the track-local Cartesian coordinate frame, in metres."""

    x_m: Annotated[
        float,
        Field(ge=-MAX_ABS_COORDINATE_M, le=MAX_ABS_COORDINATE_M, allow_inf_nan=False),
    ]
    y_m: Annotated[
        float,
        Field(ge=-MAX_ABS_COORDINATE_M, le=MAX_ABS_COORDINATE_M, allow_inf_nan=False),
    ]


class TrackV1(StrictModel):
    """Closed track corridor described by its travel-direction left and right edges."""

    schema_version: Literal["1.0"] = "1.0"
    name: str = Field(min_length=1, max_length=120)
    coordinate_system: Literal["local_cartesian_m"] = "local_cartesian_m"
    direction: Literal["clockwise", "counterclockwise"]
    closed: Literal[True] = True
    left_boundary: list[Point2D] = Field(min_length=4, max_length=MAX_BOUNDARY_POINTS)
    right_boundary: list[Point2D] = Field(min_length=4, max_length=MAX_BOUNDARY_POINTS)

    @field_validator("left_boundary", "right_boundary")
    @classmethod
    def require_three_distinct_points(cls, points: list[Point2D]) -> list[Point2D]:
        unique = {(point.x_m, point.y_m) for point in points}
        if len(unique) < 3:
            raise ValueError("a closed boundary needs at least three distinct points")
        return points


class KartV1(StrictModel):
    """Quasi-steady point-mass kart parameters."""

    schema_version: Literal["1.0"] = "1.0"
    name: str = Field(min_length=1, max_length=120)
    total_mass_kg: Annotated[float, Field(ge=40, le=600, allow_inf_nan=False)]
    power_hp: Annotated[float, Field(gt=0, le=250, allow_inf_nan=False)]
    top_speed_mps: Annotated[float, Field(gt=1, le=120, allow_inf_nan=False)]
    # 50 matches the sibling brake and lateral ceilings. At 30 the editor could
    # build karts the engine refuses: its own extremes (20 kg + 20 kg, grip 2.0)
    # derive 42.53 m/s2 through `tractionCeilingMps2`, and every Simulate click
    # on such a kart returned 422 while the browser solved it happily.
    max_accel_mps2: Annotated[float, Field(gt=0, le=50, allow_inf_nan=False)]
    max_brake_mps2: Annotated[float, Field(gt=0, le=50, allow_inf_nan=False)]
    max_lateral_accel_mps2: Annotated[float, Field(gt=0, le=50, allow_inf_nan=False)]
    # Matches the browser solver's constant: a direct API client that omits the
    # field must model the same kart the editor does.
    drivetrain_efficiency: Annotated[float, Field(gt=0, le=1, allow_inf_nan=False)] = 0.82
    # Resistance parameters. Both are optional so that a client written against
    # the original 1.0 contract keeps working unchanged; the defaults describe
    # the same chassis class as the browser model (see docs/PHYSICS.md).
    drag_area_m2: Annotated[float, Field(gt=0, le=5, allow_inf_nan=False)] = 0.8
    rolling_resistance: Annotated[float, Field(ge=0, le=0.2, allow_inf_nan=False)] = 0.015

    @property
    def power_w(self) -> float:
        """Mechanical output power converted to usable SI watts before efficiency."""

        return self.power_hp * 745.699872


class SimulationSettingsV1(StrictModel):
    """Deterministic MVP solver settings."""

    schema_version: Literal["1.0"] = "1.0"
    sample_count: int = Field(default=300, ge=64, le=4_000)
    safety_margin_m: Annotated[float, Field(ge=0, le=10, allow_inf_nan=False)] = 0.35
    path_smoothing_iterations: int = Field(default=20, ge=0, le=200)
    friction_exponent: Annotated[float, Field(ge=1, le=4, allow_inf_nan=False)] = 2.0


class SimulationRequestV1(StrictModel):
    """Input accepted by ``POST /v1/simulations``."""

    track: TrackV1
    kart: KartV1
    settings: SimulationSettingsV1 = Field(default_factory=lambda: SimulationSettingsV1())


class Issue(StrictModel):
    code: str
    message: str
    field: str | None = None


class TrackMetrics(StrictModel):
    track_length_m: NonNegativeFiniteFloat
    min_width_m: NonNegativeFiniteFloat
    mean_width_m: NonNegativeFiniteFloat
    max_width_m: NonNegativeFiniteFloat
    sample_count: int = Field(ge=0)


class TrackValidationResult(StrictModel):
    schema_version: Literal["1.0"] = "1.0"
    valid: bool
    errors: list[Issue] = Field(default_factory=list)
    warnings: list[Issue] = Field(default_factory=list)
    metrics: TrackMetrics | None = None


class TrackValidationRequest(StrictModel):
    track: TrackV1
    sample_count: int = Field(default=256, ge=64, le=4_000)
    safety_margin_m: Annotated[float, Field(ge=0, le=10, allow_inf_nan=False)] = 0.35


class SolverState(StrEnum):
    SUCCESS = "success"
    INVALID_INPUT = "invalid_input"
    NUMERICAL_FAILURE = "numerical_failure"


class SolverStatus(StrictModel):
    state: SolverState
    code: str
    message: str
    iterations: int = Field(ge=0)
    runtime_ms: NonNegativeFiniteFloat
    max_constraint_violation: NonNegativeFiniteFloat


class SimulationSummary(StrictModel):
    track_length_m: PositiveFiniteFloat
    lap_time_s: PositiveFiniteFloat
    min_speed_mps: NonNegativeFiniteFloat
    max_speed_mps: NonNegativeFiniteFloat
    average_speed_mps: NonNegativeFiniteFloat
    sample_count: int = Field(gt=0)


class PathOptimizationDiagnostics(StrictModel):
    algorithm: Literal["minimum_bending_v1"] = "minimum_bending_v1"
    objective: Literal["integrated_squared_curvature"] = "integrated_squared_curvature"
    initial_objective: NonNegativeFiniteFloat
    final_objective: NonNegativeFiniteFloat
    iterations: int = Field(ge=0)
    converged: bool
    termination_reason: PathTerminationReason
    max_fraction_step: NonNegativeFiniteFloat
    min_corridor_fraction: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
    max_corridor_fraction: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class SimulationSample(StrictModel):
    s_m: NonNegativeFiniteFloat
    x_m: FiniteFloat
    y_m: FiniteFloat
    heading_rad: FiniteFloat
    curvature_1pm: FiniteFloat
    speed_mps: NonNegativeFiniteFloat
    elapsed_time_s: NonNegativeFiniteFloat
    longitudinal_accel_mps2: FiniteFloat
    lateral_accel_mps2: FiniteFloat
    throttle: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
    brake: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
    friction_utilization: NonNegativeFiniteFloat


class MarkerKind(StrEnum):
    BRAKE_START = "brake_start"
    BRAKE_END = "brake_end"
    ACCELERATION_START = "acceleration_start"
    APEX = "apex"


class DrivingMarker(StrictModel):
    kind: MarkerKind
    sample_index: int = Field(ge=0)
    s_m: NonNegativeFiniteFloat
    x_m: FiniteFloat
    y_m: FiniteFloat
    speed_mps: NonNegativeFiniteFloat
    reason: str


class SimulationResultV1(StrictModel):
    """Serializable result; failures use the same shape and empty channels."""

    schema_version: Literal["1.0"] = "1.0"
    engine_version: str = ENGINE_VERSION
    status: SolverStatus
    validation: TrackValidationResult
    summary: SimulationSummary | None = None
    path_diagnostics: PathOptimizationDiagnostics | None = None
    samples: list[SimulationSample] = Field(default_factory=list)
    markers: list[DrivingMarker] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
