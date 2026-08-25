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
# docs/VALIDATION_REPORT.md, together with why the numbers moved.
"""Measure the sample-count stability figures quoted in the validation report."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from openkartline_engine.schemas import (
    KartV1,
    Point2D,
    SimulationRequestV1,
    SimulationSettingsV1,
    TrackV1,
)
from openkartline_engine.simulation import simulate

CIRCLE_REQUEST = (
    Path(__file__).resolve().parent.parent
    / "tests"
    / "python"
    / "fixtures"
    / "simulation_request.circle.json"
)


def _spread(values: list[float]) -> float:
    return (max(values) - min(values)) / float(np.mean(values)) * 100.0


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
    kart = KartV1(
        name="Reference",
        total_mass_kg=175,
        power_hp=13,
        top_speed_mps=24,
        max_accel_mps2=3,
        max_brake_mps2=7,
        max_lateral_accel_mps2=10,
    )
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


def main() -> int:
    circle_table()
    serpentine_table()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
