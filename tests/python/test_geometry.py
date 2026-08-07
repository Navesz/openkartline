from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pytest

from openkartline_engine.geometry import (
    minimum_bending_path,
    path_channels,
    prepare_track,
    resample_closed,
)
from openkartline_engine.schemas import Point2D, TrackV1


def test_resample_closed_is_uniform_and_does_not_repeat_endpoint() -> None:
    square = np.asarray([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], dtype=float)
    sampled = resample_closed(square, 8)
    assert sampled.shape == (8, 2)
    assert not np.array_equal(sampled[0], sampled[-1])
    lengths = np.linalg.norm(np.roll(sampled, -1, axis=0) - sampled, axis=1)
    assert float(np.max(lengths) - np.min(lengths)) < 1e-10


@pytest.mark.parametrize("sample_count", [64, 128, 512])
def test_periodic_spline_matches_analytic_circle(sample_count: int) -> None:
    theta = np.linspace(0, 2 * np.pi, 32, endpoint=False)
    controls = np.column_stack((20 * np.cos(theta), 20 * np.sin(theta)))
    sampled = resample_closed(controls, sample_count)
    radii = np.linalg.norm(sampled, axis=1)
    _, segment_lengths, _, curvature = path_channels(sampled)

    assert sampled.shape == (sample_count, 2)
    assert not np.array_equal(sampled[0], sampled[-1])
    assert float(np.max(segment_lengths) / np.min(segment_lengths)) < 1.002
    assert float(np.mean(radii)) == pytest.approx(20.0, abs=0.01)
    assert float(np.sum(segment_lengths)) == pytest.approx(40 * np.pi, rel=5e-4)
    assert float(np.median(curvature)) == pytest.approx(1 / 20, rel=0.01)


def test_circle_geometry_metrics_and_curvature(
    track_factory: Callable[..., TrackV1],
) -> None:
    outcome = prepare_track(
        track_factory(radius_x=20, radius_y=20, width=4, count=360),
        sample_count=192,
        safety_margin_m=0.35,
    )
    assert outcome.validation.valid
    assert outcome.prepared is not None
    assert outcome.validation.metrics is not None
    assert outcome.validation.metrics.mean_width_m == pytest.approx(4.0, abs=0.08)
    path, diagnostics = minimum_bending_path(outcome.prepared, safety_margin_m=0.35, iterations=20)
    station, lengths, _, curvature = path_channels(path)
    assert station[0] == 0
    assert np.all(lengths > 0)
    assert float(np.median(np.abs(curvature))) < 1 / 20
    assert diagnostics.final_objective < diagnostics.initial_objective
    assert diagnostics.min_corridor_fraction >= 0.35 / 4 - 1e-8
    assert diagnostics.max_corridor_fraction <= 1 - 0.35 / 4 + 1e-8
    # For counterclockwise travel the right boundary is the outer circle. A
    # minimum-bending circle should use its larger permitted radius.
    assert float(np.mean(np.linalg.norm(path, axis=1))) > 21.0


def test_direction_is_normalized(track_factory: Callable[..., TrackV1]) -> None:
    clockwise = track_factory(direction="clockwise")
    outcome = prepare_track(clockwise, sample_count=128, safety_margin_m=0.2)
    assert outcome.validation.valid
    assert outcome.prepared is not None
    center = outcome.prepared.center
    following = np.roll(center, -1, axis=0)
    signed_area = 0.5 * np.sum(center[:, 0] * following[:, 1] - following[:, 0] * center[:, 1])
    assert signed_area < 0


def test_boundary_names_follow_driver_left_and_right(
    track_factory: Callable[..., TrackV1],
) -> None:
    correct = track_factory(direction="counterclockwise")
    swapped = TrackV1(
        name="Swapped sides",
        direction=correct.direction,
        left_boundary=correct.right_boundary,
        right_boundary=correct.left_boundary,
    )
    outcome = prepare_track(swapped, sample_count=64, safety_margin_m=0.2)
    assert not outcome.validation.valid
    assert "BOUNDARY_SIDE_MISMATCH" in {error.code for error in outcome.validation.errors}


def test_self_intersection_is_reported() -> None:
    bow = [
        Point2D(x_m=0, y_m=0),
        Point2D(x_m=10, y_m=10),
        Point2D(x_m=0, y_m=10),
        Point2D(x_m=10, y_m=0),
    ]
    outer = [
        Point2D(x_m=-2, y_m=-2),
        Point2D(x_m=12, y_m=-2),
        Point2D(x_m=12, y_m=12),
        Point2D(x_m=-2, y_m=12),
    ]
    track = TrackV1(
        name="Bow tie", direction="counterclockwise", left_boundary=bow, right_boundary=outer
    )
    outcome = prepare_track(track, sample_count=64, safety_margin_m=0.1)
    assert not outcome.validation.valid
    assert "SELF_INTERSECTION" in {error.code for error in outcome.validation.errors}


def test_dense_self_intersection_is_never_hidden_by_downsampling() -> None:
    vertices = np.asarray([[0, 0], [10, 10], [0, 10], [10, 0]], dtype=float)
    dense: list[Point2D] = []
    for index, start in enumerate(vertices):
        end = vertices[(index + 1) % len(vertices)]
        for fraction in np.linspace(0, 1, 300, endpoint=False):
            point = start + fraction * (end - start)
            dense.append(Point2D(x_m=point[0], y_m=point[1]))
    outer = [Point2D(x_m=x, y_m=y) for x, y in ((-2, -2), (12, -2), (12, 12), (-2, 12))]
    track = TrackV1(
        name="Dense bow tie",
        direction="counterclockwise",
        left_boundary=dense,
        right_boundary=outer,
    )
    outcome = prepare_track(track, sample_count=64, safety_margin_m=0.1)
    assert not outcome.validation.valid
    assert "SELF_INTERSECTION" in {error.code for error in outcome.validation.errors}
    assert not outcome.validation.warnings


def test_intersecting_boundaries_are_reported() -> None:
    left = [Point2D(x_m=x, y_m=y) for x, y in ((0, 0), (10, 0), (10, 10), (0, 10))]
    right = [Point2D(x_m=x, y_m=y) for x, y in ((5, -5), (15, -5), (15, 5), (5, 5))]
    track = TrackV1(
        name="Crossed", direction="counterclockwise", left_boundary=left, right_boundary=right
    )
    outcome = prepare_track(track, sample_count=64, safety_margin_m=0.1)
    assert not outcome.validation.valid
    assert "BOUNDARIES_INTERSECT" in {error.code for error in outcome.validation.errors}


def test_excessive_safety_margin_is_reported(track_factory: Callable[..., TrackV1]) -> None:
    outcome = prepare_track(track_factory(width=2), sample_count=64, safety_margin_m=1.0)
    assert not outcome.validation.valid
    assert outcome.validation.metrics is not None
    assert "INSUFFICIENT_USABLE_WIDTH" in {error.code for error in outcome.validation.errors}


def test_non_nested_boundaries_are_reported() -> None:
    first = [Point2D(x_m=x, y_m=y) for x, y in ((0, 0), (4, 0), (4, 4), (0, 4))]
    second = [Point2D(x_m=x, y_m=y) for x, y in ((10, 0), (14, 0), (14, 4), (10, 4))]
    track = TrackV1(
        name="Separate", direction="counterclockwise", left_boundary=first, right_boundary=second
    )
    outcome = prepare_track(track, sample_count=64, safety_margin_m=0.1)
    assert not outcome.validation.valid
    assert "BOUNDARIES_NOT_NESTED" in {error.code for error in outcome.validation.errors}


def test_track_coordinate_span_has_a_defensive_limit() -> None:
    inner = [Point2D(x_m=x, y_m=y) for x, y in ((0, 0), (120_001, 0), (120_001, 10), (0, 10))]
    outer = [Point2D(x_m=x, y_m=y) for x, y in ((-1, -1), (120_002, -1), (120_002, 11), (-1, 11))]
    track = TrackV1(
        name="Unbounded local frame",
        direction="counterclockwise",
        left_boundary=inner,
        right_boundary=outer,
    )
    outcome = prepare_track(track, sample_count=64, safety_margin_m=0.1)
    assert not outcome.validation.valid
    assert "COORDINATE_SPAN_TOO_LARGE" in {error.code for error in outcome.validation.errors}
