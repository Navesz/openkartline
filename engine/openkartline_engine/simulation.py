"""High-level orchestration from public request models to result channels."""

from __future__ import annotations

from time import perf_counter

import numpy as np
from numpy.typing import NDArray

from openkartline_engine.geometry import minimum_bending_path, path_channels, prepare_track
from openkartline_engine.physics import SpeedProfile, solve_speed_profile
from openkartline_engine.schemas import (
    ENGINE_VERSION,
    DrivingMarker,
    MarkerKind,
    PathOptimizationDiagnostics,
    SimulationRequestV1,
    SimulationResultV1,
    SimulationSample,
    SimulationSummary,
    SolverState,
    SolverStatus,
)

FloatArray = NDArray[np.float64]


def _status(
    state: SolverState,
    code: str,
    message: str,
    *,
    started_at: float,
    iterations: int = 0,
    violation: float = 0.0,
) -> SolverStatus:
    return SolverStatus(
        state=state,
        code=code,
        message=message,
        iterations=iterations,
        runtime_ms=(perf_counter() - started_at) * 1_000,
        max_constraint_violation=max(0.0, violation),
    )


def _marker(
    kind: MarkerKind,
    index: int,
    station: FloatArray,
    path: FloatArray,
    profile: SpeedProfile,
    reason: str,
) -> DrivingMarker:
    return DrivingMarker(
        kind=kind,
        sample_index=index,
        s_m=float(station[index]),
        x_m=float(path[index, 0]),
        y_m=float(path[index, 1]),
        speed_mps=float(profile.speed[index]),
        reason=reason,
    )


def _driving_markers(
    station: FloatArray,
    path: FloatArray,
    curvature: FloatArray,
    profile: SpeedProfile,
    track_length_m: float,
) -> list[DrivingMarker]:
    markers: list[DrivingMarker] = []
    brake_active = profile.brake > 0.05
    accel_active = profile.throttle > 0.05
    for index in range(len(path)):
        previous = (index - 1) % len(path)
        if brake_active[index] and not brake_active[previous]:
            markers.append(
                _marker(
                    MarkerKind.BRAKE_START,
                    index,
                    station,
                    path,
                    profile,
                    "Longitudinal profile begins braking here.",
                )
            )
        if not brake_active[index] and brake_active[previous]:
            markers.append(
                _marker(
                    MarkerKind.BRAKE_END,
                    index,
                    station,
                    path,
                    profile,
                    "Longitudinal profile releases the brake here.",
                )
            )
        if accel_active[index] and not accel_active[previous]:
            markers.append(
                _marker(
                    MarkerKind.ACCELERATION_START,
                    index,
                    station,
                    path,
                    profile,
                    "Available grip and power permit acceleration from here.",
                )
            )

    magnitude = np.abs(curvature)
    candidates = [
        index
        for index in range(len(path))
        if magnitude[index] >= magnitude[(index - 1) % len(path)]
        and magnitude[index] > magnitude[(index + 1) % len(path)]
        and magnitude[index] > 0.01
    ]
    minimum_gap = max(4.0, track_length_m / 100)
    selected: list[int] = []
    for index in sorted(candidates, key=lambda item: float(magnitude[item]), reverse=True):
        if all(
            min(
                abs(float(station[index] - station[other])),
                track_length_m - abs(float(station[index] - station[other])),
            )
            >= minimum_gap
            for other in selected
        ):
            selected.append(index)
        if len(selected) >= 20:
            break
    for index in sorted(selected):
        markers.append(
            _marker(
                MarkerKind.APEX,
                index,
                station,
                path,
                profile,
                "Local peak in path curvature (geometric apex estimate).",
            )
        )
    return sorted(markers, key=lambda item: (item.s_m, item.kind.value))


def simulate(request: SimulationRequestV1) -> SimulationResultV1:
    """Run the deterministic MVP simulation and return structured failures."""

    started_at = perf_counter()
    settings = request.settings
    geometry = prepare_track(
        request.track,
        sample_count=settings.sample_count,
        safety_margin_m=settings.safety_margin_m,
    )
    warning_messages = [warning.message for warning in geometry.validation.warnings]
    assumptions = [
        "Flat, dry track with spatially uniform grip.",
        "Quasi-steady point-mass kart; transient yaw and load transfer are not modeled.",
        "Power is represented by a simple traction/power envelope using the declared top speed.",
        "The path is a locally optimized minimum-bending baseline, not a global minimum-time line.",
    ]
    if not geometry.validation.valid or geometry.prepared is None:
        return SimulationResultV1(
            engine_version=ENGINE_VERSION,
            status=_status(
                SolverState.INVALID_INPUT,
                "TRACK_VALIDATION_FAILED",
                "Track geometry is invalid; inspect validation.errors.",
                started_at=started_at,
            ),
            validation=geometry.validation,
            assumptions=assumptions,
            warnings=warning_messages,
        )

    try:
        path, path_diagnostics = minimum_bending_path(
            geometry.prepared,
            safety_margin_m=settings.safety_margin_m,
            iterations=settings.path_smoothing_iterations,
        )
        station, segment_lengths, heading, curvature = path_channels(path)
        profile = solve_speed_profile(
            curvature,
            segment_lengths,
            request.kart,
            friction_exponent=settings.friction_exponent,
        )
    except (ArithmeticError, FloatingPointError, ValueError) as error:
        return SimulationResultV1(
            engine_version=ENGINE_VERSION,
            status=_status(
                SolverState.NUMERICAL_FAILURE,
                "NUMERICAL_FAILURE",
                str(error),
                started_at=started_at,
            ),
            validation=geometry.validation,
            assumptions=assumptions,
            warnings=warning_messages,
        )

    samples = [
        SimulationSample(
            s_m=float(station[index]),
            x_m=float(path[index, 0]),
            y_m=float(path[index, 1]),
            heading_rad=float(heading[index]),
            curvature_1pm=float(curvature[index]),
            speed_mps=float(profile.speed[index]),
            elapsed_time_s=float(profile.elapsed[index]),
            longitudinal_accel_mps2=float(profile.longitudinal_accel[index]),
            lateral_accel_mps2=float(profile.lateral_accel[index]),
            throttle=float(profile.throttle[index]),
            brake=float(profile.brake[index]),
            friction_utilization=float(profile.friction_utilization[index]),
        )
        for index in range(len(path))
    ]
    path_length = float(np.sum(segment_lengths))
    summary = SimulationSummary(
        track_length_m=path_length,
        lap_time_s=profile.lap_time_s,
        min_speed_mps=float(np.min(profile.speed)),
        max_speed_mps=float(np.max(profile.speed)),
        average_speed_mps=path_length / profile.lap_time_s,
        sample_count=len(path),
    )
    markers = _driving_markers(station, path, curvature, profile, path_length)
    if path_diagnostics.converged:
        status_code = "SPEED_PROFILE_CONVERGED"
        status_message = "Minimum-bending baseline and cyclic speed profile converged."
    else:
        status_code = "PATH_NOT_CONVERGED"
        status_message = (
            "Speed profile converged, but the feasible minimum-bending baseline "
            "did not meet its convergence criterion."
        )
        path_warning = {
            "skipped": "Path optimization was disabled by a zero-iteration setting.",
            "iteration_limit": "Path optimization reached its configured iteration limit.",
            "no_progress": (
                "Path optimization stopped because backtracking found no improving step."
            ),
        }.get(path_diagnostics.termination_reason, "Path optimization did not converge.")
        warning_messages.append(
            f"{path_warning} The returned line is feasible but is not reported as converged."
        )
    return SimulationResultV1(
        engine_version=ENGINE_VERSION,
        status=_status(
            SolverState.SUCCESS,
            status_code,
            status_message,
            started_at=started_at,
            iterations=profile.iterations,
            violation=profile.max_constraint_violation,
        ),
        validation=geometry.validation,
        summary=summary,
        path_diagnostics=PathOptimizationDiagnostics(
            initial_objective=path_diagnostics.initial_objective,
            final_objective=path_diagnostics.final_objective,
            iterations=path_diagnostics.iterations,
            converged=path_diagnostics.converged,
            termination_reason=path_diagnostics.termination_reason,
            max_fraction_step=path_diagnostics.max_fraction_step,
            min_corridor_fraction=path_diagnostics.min_corridor_fraction,
            max_corridor_fraction=path_diagnostics.max_corridor_fraction,
        ),
        samples=samples,
        markers=markers,
        assumptions=assumptions,
        warnings=warning_messages,
    )
