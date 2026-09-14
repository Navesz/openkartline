#!/usr/bin/env python3
# Purpose: print the measured tables that docs/VALIDATION_REPORT.md publishes.
#
# The report quotes lap times to twelve decimal places. Numbers like that go
# stale the moment the engine changes, and a validation report that publishes
# figures the code no longer produces is worse than one that publishes none —
# it is a claim nobody can check without redoing the work. So the report says
# to run this, and this is what produced what it says.
#
# Usage:
#   uv run python scripts/validation_numbers.py
#
# Re-run it after any change to the engine and paste the output into
# docs/VALIDATION_REPORT.md, together with why the numbers moved. The
# start-index figures are also pinned by
# tests/python/test_simulation.py::TestStartIndexSensitivity, so moving them
# means updating those constants in the same change.
"""Measure the sample-count and start-index figures quoted in the validation report."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from openkartline_engine.schemas import (
    KartV1,
    Point2D,
    SimulationRequestV1,
    SimulationResultV1,
    SimulationSettingsV1,
    TrackV1,
)
from openkartline_engine.simulation import simulate

ROOT = Path(__file__).resolve().parent.parent
CIRCLE_REQUEST = ROOT / "tests" / "python" / "fixtures" / "simulation_request.circle.json"
PARITY_FIXTURES = ROOT / "apps" / "web" / "src" / "domain" / "engine" / "__fixtures__"

# The rotation counts TestStartIndexSensitivity uses. A figure measured over a
# different set of start indices is a different figure: the serpentine gives
# 3.18% over 8 and 3.48% over 12, so the count is part of the number.
CIRCLE_START_INDICES = 4
SHIPPED_START_INDICES = 5
SERPENTINE_START_INDICES = 12


def _spread(values: list[float]) -> float:
    return (max(values) - min(values)) / float(np.mean(values)) * 100.0


def _relative_range(values: list[float]) -> float:
    """``(max - min) / min``, the start-index tests' definition, as a fraction."""

    return (max(values) - min(values)) / min(values)


def _serpentine() -> TrackV1:
    """The corner-rich fixture from `tests/python/conftest.py`.

    Its boundaries are offset radially rather than perpendicularly, so its true
    width varies between 4.55 m and 8.00 m along the lap. That matters for
    reading the numbers: it is the only fixture here whose corridor is not
    close to constant.
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


def _reference_kart() -> KartV1:
    """The kart `tests/python/conftest.py` pairs with the serpentine."""

    return KartV1(
        name="Reference",
        total_mass_kg=175,
        power_hp=13,
        top_speed_mps=24,
        max_accel_mps2=3,
        max_brake_mps2=7,
        max_lateral_accel_mps2=10,
    )


def circle_table() -> None:
    payload = json.loads(CIRCLE_REQUEST.read_text(encoding="utf-8"))
    controls = len(payload["track"]["left_boundary"])
    print(f"### Sample-count stability — circle ({controls} controls, 40 path iterations)\n")
    print("| Samples | Estimated lap time | Termination |")
    print("|---:|---:|---|")

    laps: list[float] = []
    for sample_count in (64, 128, 256):
        payload["settings"]["sample_count"] = sample_count
        payload["settings"]["path_smoothing_iterations"] = 40
        result = simulate(SimulationRequestV1.model_validate(payload))
        assert result.summary is not None and result.path_diagnostics is not None
        laps.append(result.summary.lap_time_s)
        print(
            f"| {sample_count} | {result.summary.lap_time_s:.12f} s | "
            f"`{result.path_diagnostics.termination_reason}` |"
        )
    print(f"\nRelative spread: **{_spread(laps):.7f}%**.\n")


def serpentine_table() -> None:
    track = _serpentine()
    kart = _reference_kart()
    print("### Sample-count stability — serpentine\n")
    print("| Samples | Lap time | Path length | Termination |")
    print("|---:|---:|---:|---|")

    laps: list[float] = []
    lengths: list[float] = []
    for sample_count in (300, 600, 1200, 2400):
        result = simulate(
            SimulationRequestV1(
                track=track,
                kart=kart,
                settings=SimulationSettingsV1(sample_count=sample_count),
            )
        )
        assert result.summary is not None and result.path_diagnostics is not None
        laps.append(result.summary.lap_time_s)
        lengths.append(result.summary.track_length_m)
        print(
            f"| {sample_count} | {result.summary.lap_time_s:.3f} s | "
            f"{result.summary.track_length_m:.2f} m | "
            f"`{result.path_diagnostics.termination_reason}` |"
        )
    print(
        f"\nRelative lap-time spread: **{_spread(laps):.1f}%**. "
        f"Path-length spread: **{_spread(lengths):.2f}%**.\n"
    )


def _rotated(request: SimulationRequestV1, shift: int) -> SimulationRequestV1:
    """Exactly `TestStartIndexSensitivity._rotated`: same loop, listed from `shift`."""

    payload = request.model_dump()
    for side in ("left_boundary", "right_boundary"):
        points = payload["track"][side]
        payload["track"][side] = points[shift:] + points[:shift]
    return SimulationRequestV1.model_validate(payload)


def _rotations(request: SimulationRequestV1, divisions: int) -> list[SimulationRequestV1]:
    """The start indices `TestStartIndexSensitivity._laps` tries: ``i * n // divisions``."""

    count = len(request.track.left_boundary)
    return [_rotated(request, index * count // divisions) for index in range(divisions)]


def _with_iterations(request: SimulationRequestV1, iterations: int) -> SimulationRequestV1:
    settings = request.settings.model_copy(update={"path_smoothing_iterations": iterations})
    return request.model_copy(update={"settings": settings})


@dataclass(frozen=True)
class _Case:
    label: str
    request: SimulationRequestV1
    divisions: int


def _shipped_requests() -> list[SimulationRequestV1]:
    """The five circuits the app ships, exactly as the parity gate sends them."""

    return [
        SimulationRequestV1.model_validate_json(path.read_text(encoding="utf-8"))
        for path in sorted(PARITY_FIXTURES.glob("parity-request-*--default.json"))
    ]


def _cases() -> list[_Case]:
    circle = SimulationRequestV1.model_validate_json(CIRCLE_REQUEST.read_text(encoding="utf-8"))
    serpentine = SimulationRequestV1(track=_serpentine(), kart=_reference_kart())
    return [
        _Case("Circle fixture", circle, CIRCLE_START_INDICES),
        *(
            _Case(request.track.name, request, SHIPPED_START_INDICES)
            for request in _shipped_requests()
        ),
        _Case("Serpentine fixture", serpentine, SERPENTINE_START_INDICES),
    ]


def _laps(results: list[SimulationResultV1]) -> list[float]:
    laps = []
    for result in results:
        assert result.summary is not None
        laps.append(result.summary.lap_time_s)
    return laps


def _reasons(results: list[SimulationResultV1]) -> str:
    reasons = set()
    for result in results:
        assert result.path_diagnostics is not None
        reasons.add(result.path_diagnostics.termination_reason)
    return ", ".join(f"`{reason}`" for reason in sorted(reasons))


def _percent(fraction: float) -> str:
    # An exact zero is a symmetry, not a small number, so it is printed as one.
    return "**0**" if fraction == 0.0 else f"{fraction * 100:.2f}%"


def start_index_tables() -> None:
    cases = _cases()
    solved: dict[str, list[SimulationResultV1]] = {}
    unsolved: dict[str, list[SimulationResultV1]] = {}
    for case in cases:
        rotations = _rotations(case.request, case.divisions)
        solved[case.label] = [simulate(request) for request in rotations]
        if case.label != "Circle fixture":
            unsolved[case.label] = [simulate(_with_iterations(request, 0)) for request in rotations]

    print("### Start-index stability — lap time, request as committed\n")
    print("| Track | Boundary points | Start indices tried | Lap at index 0 | Spread | Relative |")
    print("|---|---:|---:|---:|---:|---:|")
    for case in cases:
        laps = _laps(solved[case.label])
        print(
            f"| {case.label} | {len(case.request.track.left_boundary)} | {case.divisions} | "
            f"{laps[0]:.2f} s | {(max(laps) - min(laps)) * 1000:.0f} ms | "
            f"{_percent(_relative_range(laps))} |"
        )

    print("\n### Start-index stability — the solver-off control\n")
    print("| Track | Start indices | No solver | Termination | Default | Termination |")
    print("|---|---:|---:|---|---:|---|")
    for case in cases:
        if case.label not in unsolved:
            continue
        print(
            f"| {case.label} | {case.divisions} | "
            f"{_percent(_relative_range(_laps(unsolved[case.label])))} | "
            f"{_reasons(unsolved[case.label])} | "
            f"{_percent(_relative_range(_laps(solved[case.label])))} | "
            f"{_reasons(solved[case.label])} |"
        )

    print("\n### Start-index stability — the prepared corridor, before any solver\n")
    print("| Track | Start indices | Centreline length moves | Mean width moves |")
    print("|---|---:|---:|---:|")
    for case in cases:
        if case.label not in unsolved:
            continue
        # `validation.metrics` is what `prepare_track` measured, before the
        # solver runs. `summary.track_length_m` would be the racing line's
        # length instead, which is solver output.
        lengths: list[float] = []
        widths: list[float] = []
        for result in unsolved[case.label]:
            metrics = result.validation.metrics
            assert metrics is not None
            lengths.append(metrics.track_length_m)
            widths.append(metrics.mean_width_m)
        print(
            f"| {case.label} | {case.divisions} | {_relative_range(lengths):.1e} | "
            f"{_relative_range(widths):.1e} |"
        )
    print()


def path_budget_table() -> None:
    """How the committed shipped requests respond to `path_smoothing_iterations`.

    The loop in `minimum_bending_path` does not read the cap except to stop, so
    a run that completes all 200 iterations passes through every smaller budget
    without stopping either: `iteration_limit` at 200 means `iteration_limit`
    at every value from 1 to 200.
    """

    print("### Path-solver budget — committed shipped requests\n")
    print("| Track | Lap at 20 | Lap at 60 | Lap at 200 | Run at 200 |")
    print("|---|---:|---:|---:|---|")
    for request in _shipped_requests():
        laps: list[float] = []
        final = None
        for iterations in (20, 60, 200):
            final = simulate(_with_iterations(request, iterations))
            assert final.summary is not None
            laps.append(final.summary.lap_time_s)
        assert final is not None and final.path_diagnostics is not None
        print(
            f"| {request.track.name} | {laps[0]:.2f} s | {laps[1]:.2f} s | {laps[2]:.2f} s | "
            f"{final.path_diagnostics.iterations} iterations, "
            f"`{final.path_diagnostics.termination_reason}` |"
        )
    print()


def main() -> int:
    circle_table()
    serpentine_table()
    start_index_tables()
    path_budget_table()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
