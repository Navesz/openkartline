from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import numpy as np
import pytest

from openkartline_engine.schemas import (
    KartV1,
    SimulationRequestV1,
    SimulationResultV1,
    SimulationSettingsV1,
    TrackV1,
)
from openkartline_engine.simulation import simulate

PARITY_FIXTURES = (
    Path(__file__).resolve().parent.parent.parent
    / "apps"
    / "web"
    / "src"
    / "domain"
    / "engine"
    / "__fixtures__"
)


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


class TestStartIndexSensitivity:
    """The same closed loop, listed from a different first point.

    Rotating the boundary lists is not a different track: the polygon, its
    winding and its geometry are identical, and only the index a reader would
    call "first" moves. A converged solver would return the same lap.

    This one does not. Measured by these tests, over the start indices each one
    tries (shift ``i * n // divisions``): 3.48% over 12 on the serpentine
    fixture, 1.11% over 5 on Adria as the parity gate sends it (819 ms of a
    73.79 s lap), and exactly 0 over 4 on the circle, whose symmetry makes every
    shift an exact one. `scripts/validation_numbers.py` rotates the same way and
    prints these figures, and the other shipped circuits, for
    docs/VALIDATION_REPORT.md.

    Not the path solver, which an earlier version of this docstring blamed.
    Setting `path_smoothing_iterations` to 0 skips it, and the serpentine still
    spreads by 2.09% over the same 12 start indices. Rotating the control points
    re-lands the periodic spline resample, so the corridor `prepare_track`
    hands on is not quite the same object -- on the serpentine its centreline
    length moves by 5.8e-4 relative -- and the curvature and speed pipeline
    carries that into the lap. That pipeline is not exactly start-free either:
    rolling an already prepared serpentine corridor, with no solver, still
    moves the lap by 5.7e-5 relative, which is small against the 2.09%. The
    solver neither creates the spread nor removes it; stopped at its iteration
    limit it widens it on some tracks and narrows it on others -- 2.09% to 3.48%
    here, 0.98% to 0.28% on Baltar.

    That misattribution did not survive for want of a control. #102 measured
    one and published it: on the API example request over 8 start indices the
    spread was 867 ms with the solver skipped against 80 ms at the default 20,
    and #102 still concluded that the solver was the cause.

    Every figure is pinned from both sides. The ceiling fails if the
    sensitivity grows; the floor fails if it shrinks, a collapse included,
    because a fix that makes the start index matter less changes what the
    report publishes and should move these numbers on purpose. Each margin is
    one unit of the last digit the report prints -- 1e-4 on a spread, printed to
    hundredths of a percent, and 1e-5 on a corridor movement, printed to two
    significant figures -- so a figure that trips its band is one the report
    would print differently. The margins are not there to absorb noise. Adding
    uniform noise of up to 1e-9 m to every boundary coordinate of the
    serpentine moved its solver-on spread by 1.0e-9 and its solver-off spread by
    9.7e-11, and the parity gate already holds each committed shipped lap to
    1e-6 relative on all three operating systems CI runs.

    Characterised rather than hidden. Pinning the anchor would make the number
    stable without making it right.
    """

    SPREAD_MARGIN = 1e-4
    CORRIDOR_MARGIN = 1e-5

    SERPENTINE_SPREAD = 0.03476
    SERPENTINE_SPREAD_CEILING = SERPENTINE_SPREAD + SPREAD_MARGIN
    SERPENTINE_SPREAD_FLOOR = SERPENTINE_SPREAD - SPREAD_MARGIN
    SERPENTINE_SOLVER_OFF_SPREAD = 0.02091
    ADRIA_SPREAD = 0.01111
    SERPENTINE_CENTRELINE_LENGTH_MOVES = 5.764e-4
    SERPENTINE_MEAN_WIDTH_MOVES = 7.802e-4

    @staticmethod
    def _rotated(request: SimulationRequestV1, shift: int) -> SimulationRequestV1:
        payload = request.model_dump()
        for side in ("left_boundary", "right_boundary"):
            points = payload["track"][side]
            payload["track"][side] = points[shift:] + points[:shift]
        return SimulationRequestV1.model_validate(payload)

    def _rotations(self, request: SimulationRequestV1, divisions: int) -> list[SimulationRequestV1]:
        count = len(request.track.left_boundary)
        return [self._rotated(request, index * count // divisions) for index in range(divisions)]

    def _results(self, request: SimulationRequestV1, divisions: int) -> list[SimulationResultV1]:
        return [simulate(rotated) for rotated in self._rotations(request, divisions)]

    def _laps(self, request: SimulationRequestV1, divisions: int) -> list[float]:
        laps = []
        for result in self._results(request, divisions):
            assert result.summary is not None
            laps.append(result.summary.lap_time_s)
        return laps

    @staticmethod
    def _relative_range(values: list[float]) -> float:
        return (max(values) - min(values)) / min(values)

    @staticmethod
    def _moved(label: str, measured: float, pinned: float, margin: float) -> list[str]:
        """Describe a figure that left its band, or nothing if it did not.

        Collected rather than asserted one at a time, so a change that moves
        several figures reports all of them at once -- they are regenerated
        together.
        """

        if measured >= pinned + margin:
            return [
                f"{label} {measured:.4e} is {margin:g} or more above the published {pinned:.4e}"
            ]
        if measured <= pinned - margin:
            return [
                f"{label} {measured:.4e} is {margin:g} or more below the published {pinned:.4e}"
            ]
        return []

    @staticmethod
    def _assert_none_moved(moved: list[str]) -> None:
        assert not moved, (
            "\n".join(moved) + "\nIf the start index matters more or less now, regenerate "
            "docs/VALIDATION_REPORT.md with scripts/validation_numbers.py and move these "
            "figures with it."
        )

    def test_a_symmetric_track_is_untouched_by_the_start_index(
        self, circle_request: SimulationRequestV1
    ) -> None:
        # A circle maps onto itself under every shift of its control points, so
        # this isolates the sensitivity to the shape rather than the mechanism:
        # whatever moves the lap on other tracks must not move it here.
        laps = self._laps(circle_request, 4)
        assert max(laps) == pytest.approx(min(laps), rel=1e-9)

    def test_the_lap_moves_with_the_start_index_by_a_known_amount(
        self, serpentine_track: TrackV1, kart: KartV1
    ) -> None:
        laps = self._laps(SimulationRequestV1(track=serpentine_track, kart=kart), 12)

        spread = self._relative_range(laps)
        assert spread < self.SERPENTINE_SPREAD_CEILING, (
            f"start-index spread {spread:.4%} exceeds the documented "
            f"{self.SERPENTINE_SPREAD:.3%} by more than the margin"
        )
        assert spread > self.SERPENTINE_SPREAD_FLOOR, (
            f"start-index spread {spread:.4%} fell below the documented "
            f"{self.SERPENTINE_SPREAD:.3%} by more than the margin -- if the start "
            "index matters less now, regenerate the report and move this figure with it"
        )

    def test_a_shipped_circuit_moves_by_a_known_amount(self) -> None:
        """Adria, exactly as the parity gate sends it, over 5 start indices.

        One shipped circuit, not five, because every rotation is a full solve.
        The report's rows for the other four are printed by
        `scripts/validation_numbers.py` and are not pinned by any test.
        """

        request = SimulationRequestV1.model_validate_json(
            (PARITY_FIXTURES / "parity-request-adria-karting-raceway--default.json").read_text(
                encoding="utf-8"
            )
        )
        spread = self._relative_range(self._laps(request, 5))
        self._assert_none_moved(
            self._moved("Adria start-index spread", spread, self.ADRIA_SPREAD, self.SPREAD_MARGIN)
        )

    def test_without_the_solver_the_corridor_and_the_lap_still_move(
        self, serpentine_track: TrackV1, kart: KartV1
    ) -> None:
        """The control: what is left of the spread with the solver skipped.

        It rests on `path_smoothing_iterations=0` really skipping
        `minimum_bending_path`, so that is checked on every rotation before
        anything is read: a switch that left the solver running would measure
        the solver-on spread and decide nothing. With the solver skipped the
        line is the prepared corridor's midline, unmoved.

        Two things are then pinned, over the same 12 start indices as the
        solver-on figure. The lap spread, 2.09% against 3.48% with the solver
        on, which shows the spread does not need the solver. And the corridor
        itself, read from `validation.metrics` -- what `prepare_track`
        measured -- whose centreline length moves by 5.8e-4 and mean width by
        7.8e-4. An earlier version compared `summary.track_length_m` across one
        rotation and called it a property of the polygon. That is the returned
        racing line's length, which is solver output, and at the half-lap shift
        it tried the two lengths agree to 2.8e-12 on this fixture, so it could
        not have seen the corridor move.

        If either figure collapses, the attribution in the class docstring is
        stale.
        """

        settings = SimulationSettingsV1(path_smoothing_iterations=0)
        request = SimulationRequestV1(track=serpentine_track, kart=kart, settings=settings)

        laps: list[float] = []
        lengths: list[float] = []
        widths: list[float] = []
        for result in self._results(request, 12):
            diagnostics = result.path_diagnostics
            assert diagnostics is not None and result.summary is not None
            assert diagnostics.termination_reason == "skipped"
            assert diagnostics.iterations == 0
            assert diagnostics.final_objective == diagnostics.initial_objective
            metrics = result.validation.metrics
            assert metrics is not None
            laps.append(result.summary.lap_time_s)
            lengths.append(metrics.track_length_m)
            widths.append(metrics.mean_width_m)

        self._assert_none_moved(
            [
                *self._moved(
                    "solver-free start-index spread",
                    self._relative_range(laps),
                    self.SERPENTINE_SOLVER_OFF_SPREAD,
                    self.SPREAD_MARGIN,
                ),
                *self._moved(
                    "prepared centreline length movement",
                    self._relative_range(lengths),
                    self.SERPENTINE_CENTRELINE_LENGTH_MOVES,
                    self.CORRIDOR_MARGIN,
                ),
                *self._moved(
                    "prepared mean width movement",
                    self._relative_range(widths),
                    self.SERPENTINE_MEAN_WIDTH_MOVES,
                    self.CORRIDOR_MARGIN,
                ),
            ]
        )
