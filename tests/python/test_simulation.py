from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pytest

from openkartline_engine.schemas import KartV1, SimulationRequestV1, SimulationSettingsV1, TrackV1
from openkartline_engine.simulation import simulate


def test_circle_simulation_is_successful_and_deterministic(
    circle_request: SimulationRequestV1,
) -> None:
    first = simulate(circle_request)
    second = simulate(circle_request)
    assert first.status.state == "success"
    assert first.summary is not None
    assert first.summary.sample_count == circle_request.settings.sample_count
    assert len(first.samples) == circle_request.settings.sample_count
    assert [sample.model_dump() for sample in first.samples] == [
        sample.model_dump() for sample in second.samples
    ]
    assert first.summary.model_dump() == second.summary.model_dump()  # type: ignore[union-attr]
    assert first.status.max_constraint_violation < 2e-4
    assert any(marker.kind == "apex" for marker in first.markers)


def test_summary_lap_time_is_reproducible_from_returned_samples(
    circle_request: SimulationRequestV1,
) -> None:
    result = simulate(circle_request)
    assert result.summary is not None
    positions = np.asarray([(sample.x_m, sample.y_m) for sample in result.samples])
    speeds = np.asarray([sample.speed_mps for sample in result.samples])
    lengths = np.linalg.norm(np.roll(positions, -1, axis=0) - positions, axis=1)
    reconstructed = float(np.sum(2 * lengths / (speeds + np.roll(speeds, -1))))
    assert result.summary.lap_time_s == pytest.approx(reconstructed, rel=1e-12)


def test_lap_time_is_stable_across_sample_counts(
    track_factory: Callable[..., TrackV1], kart: KartV1
) -> None:
    lap_times: list[float] = []
    for sample_count in (64, 128, 256):
        request = SimulationRequestV1(
            track=track_factory(radius_x=20, radius_y=20, count=32),
            kart=kart,
            settings=SimulationSettingsV1(
                sample_count=sample_count,
                path_smoothing_iterations=40,
            ),
        )
        result = simulate(request)
        assert result.status.state == "success"
        assert result.summary is not None
        lap_times.append(result.summary.lap_time_s)
    assert (max(lap_times) - min(lap_times)) / float(np.mean(lap_times)) < 0.01


@pytest.mark.xfail(
    strict=True,
    reason=(
        "minimum_bending_path drifts 7.6% across sample counts on this fixture; "
        "see https://github.com/Navesz/openkartline/issues/45"
    ),
)
def test_lap_time_is_stable_across_sample_counts_on_a_corner_rich_track(
    serpentine_track: TrackV1, kart: KartV1
) -> None:
    """Guard the discretization bias that a circle fixture cannot expose.

    Before the gradient filter was made resolution independent, this same
    circuit drifted by more than 10% between 300 and 2400 samples, which is a
    change in the headline lap estimate rather than a rounding difference.

    Currently xfail. This fixture offsets its boundaries radially, so it is the
    only corridor here whose width genuinely varies along the lap (4.55-8.00 m).
    Pairing the edges by index used to report a skewed chord, which is
    insensitive to that variation and made every corridor look uniformly wide --
    and a uniformly wide corridor is what made this solver look stable. With the
    width measured correctly the projected-gradient search lands in a different
    local minimum at each resolution. The geometry is not the drift: widths and
    the initial objective agree to three decimals across 256/512/1024/2048.

    `strict=True` on purpose. The suite fails again the moment the solver stops
    drifting, so this marker cannot quietly outlive the defect it documents.
    """

    lap_times: list[float] = []
    lengths: list[float] = []
    for sample_count in (256, 512, 1024):
        result = simulate(
            SimulationRequestV1(
                track=serpentine_track,
                kart=kart,
                settings=SimulationSettingsV1(sample_count=sample_count),
            )
        )
        assert result.status.state == "success"
        assert result.summary is not None
        lap_times.append(result.summary.lap_time_s)
        lengths.append(result.summary.track_length_m)
    assert (max(lap_times) - min(lap_times)) / float(np.mean(lap_times)) < 0.03
    assert (max(lengths) - min(lengths)) / float(np.mean(lengths)) < 0.01


def test_more_path_iterations_keep_reducing_the_bending_objective(
    serpentine_track: TrackV1, kart: KartV1
) -> None:
    """The smoothing budget must stay a real knob on corner-rich geometry.

    A preconditioned step that is only clipped, never projected, used to stall
    here: the line search rejected every step and extra iterations changed
    nothing at all.
    """

    def final_objective(iterations: int) -> float:
        result = simulate(
            SimulationRequestV1(
                track=serpentine_track,
                kart=kart,
                settings=SimulationSettingsV1(
                    sample_count=256,
                    path_smoothing_iterations=iterations,
                ),
            )
        )
        assert result.path_diagnostics is not None
        assert result.path_diagnostics.termination_reason != "no_progress"
        return result.path_diagnostics.final_objective

    assert final_objective(40) < final_objective(5)


def test_oval_has_actionable_brake_and_acceleration_markers(
    track_factory: Callable[..., TrackV1], kart: KartV1
) -> None:
    request = SimulationRequestV1(
        track=track_factory(radius_x=55, radius_y=12, count=120),
        kart=kart,
        settings=SimulationSettingsV1(sample_count=240, path_smoothing_iterations=12),
    )
    result = simulate(request)
    assert result.status.state == "success"
    kinds = {marker.kind for marker in result.markers}
    assert "brake_start" in kinds
    assert "acceleration_start" in kinds
    assert "apex" in kinds
    assert result.summary is not None and result.summary.lap_time_s > 0


def test_invalid_track_returns_structured_failure(
    track_factory: Callable[..., TrackV1], kart: KartV1
) -> None:
    request = SimulationRequestV1(
        track=track_factory(width=1),
        kart=kart,
        settings=SimulationSettingsV1(safety_margin_m=0.6),
    )
    result = simulate(request)
    assert result.status.state == "invalid_input"
    assert result.status.code == "TRACK_VALIDATION_FAILED"
    assert result.summary is None
    assert result.samples == []
    assert result.validation.errors


def test_disabled_path_optimization_is_reported_without_false_convergence(
    circle_request: SimulationRequestV1,
) -> None:
    request = circle_request.model_copy(
        update={
            "settings": circle_request.settings.model_copy(update={"path_smoothing_iterations": 0})
        }
    )
    result = simulate(request)
    assert result.status.state == "success"
    assert result.status.code == "PATH_NOT_CONVERGED"
    assert result.path_diagnostics is not None
    assert not result.path_diagnostics.converged
    assert result.path_diagnostics.termination_reason == "skipped"
    assert any("disabled" in warning for warning in result.warnings)


def test_path_iteration_limit_is_reported_without_false_convergence(
    track_factory: Callable[..., TrackV1], kart: KartV1
) -> None:
    request = SimulationRequestV1(
        track=track_factory(radius_x=55, radius_y=12, count=80),
        kart=kart,
        settings=SimulationSettingsV1(sample_count=192, path_smoothing_iterations=1),
    )
    result = simulate(request)
    assert result.status.state == "success"
    assert result.status.code == "PATH_NOT_CONVERGED"
    assert result.path_diagnostics is not None
    assert not result.path_diagnostics.converged
    assert result.path_diagnostics.termination_reason == "iteration_limit"
    assert any("iteration limit" in warning for warning in result.warnings)


def test_numerical_error_returns_structured_failure(
    circle_request: SimulationRequestV1,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_solver(*args: object, **kwargs: object) -> None:
        raise ArithmeticError("synthetic convergence failure")

    monkeypatch.setattr("openkartline_engine.simulation.solve_speed_profile", fail_solver)
    result = simulate(circle_request)
    assert result.status.state == "numerical_failure"
    assert result.status.code == "NUMERICAL_FAILURE"
    assert "synthetic convergence failure" in result.status.message
    assert result.validation.valid
    assert result.summary is None
