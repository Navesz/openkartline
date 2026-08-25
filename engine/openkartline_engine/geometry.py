"""Closed-track geometry preparation and conservative baseline line generation."""

from __future__ import annotations

import math
from collections.abc import Iterator
from dataclasses import dataclass
from typing import cast

import numpy as np
from numpy.typing import NDArray

from openkartline_engine.schemas import (
    Issue,
    PathTerminationReason,
    Point2D,
    TrackMetrics,
    TrackV1,
    TrackValidationResult,
)

FloatArray = NDArray[np.float64]
_EPS = 1e-9
_MAX_TRACK_SPAN_M = 100_000.0
_MAX_BOUNDARY_LENGTH_M = 1_000_000.0
_GRADIENT_SMOOTHING_PASSES = 24
_GRADIENT_SMOOTHING_REFERENCE_SAMPLES = 300
#: Centering passes before the corridor is measured. The seed is a chord
#: midpoint, which sits off-center in a corner; two passes put it back.
_CORRIDOR_CENTERING_PASSES = 2
#: Stations measured per batch, bounding the station x segment work array.
_CORRIDOR_STATION_BATCH = 256
#: Low-pass width for the measured clearances, in passes at the reference
#: resolution. Point-to-polyline distance is only piecewise smooth: its
#: slope jumps at every facet, and while the amplitude of that noise is
#: sub-millimetre, its curvature rivals the track's own -- which is exactly
#: what the bending objective integrates.
_CORRIDOR_SMOOTHING_PASSES = 2


@dataclass(frozen=True, slots=True)
class PreparedTrack:
    """Aligned, equally sampled corridor geometry used by the solver."""

    left: FloatArray
    right: FloatArray
    center: FloatArray
    widths: FloatArray
    length_m: float


@dataclass(frozen=True, slots=True)
class GeometryOutcome:
    validation: TrackValidationResult
    prepared: PreparedTrack | None


@dataclass(frozen=True, slots=True)
class BendingDiagnostics:
    initial_objective: float
    final_objective: float
    iterations: int
    converged: bool
    termination_reason: PathTerminationReason
    max_fraction_step: float
    min_corridor_fraction: float
    max_corridor_fraction: float


def _as_array(points: list[Point2D]) -> FloatArray:
    return np.asarray([(point.x_m, point.y_m) for point in points], dtype=np.float64)


def _clean_closed(points: FloatArray) -> FloatArray:
    """Remove an explicit closure point and consecutive zero-length segments."""

    if len(points) > 1 and np.linalg.norm(points[0] - points[-1]) <= _EPS:
        points = points[:-1]
    if len(points) == 0:
        return points
    keep = np.ones(len(points), dtype=np.bool_)
    keep[1:] = np.linalg.norm(np.diff(points, axis=0), axis=1) > _EPS
    points = points[keep]
    if len(points) > 1 and np.linalg.norm(points[0] - points[-1]) <= _EPS:
        points = points[:-1]
    return points


def _signed_area(points: FloatArray) -> float:
    following = np.roll(points, -1, axis=0)
    return float(0.5 * np.sum(points[:, 0] * following[:, 1] - following[:, 0] * points[:, 1]))


def _closed_length(points: FloatArray) -> float:
    return float(np.sum(np.linalg.norm(np.roll(points, -1, axis=0) - points, axis=1)))


def _linear_resample_closed(points: FloatArray, sample_count: int) -> FloatArray:
    """Equal-arc resampling helper for an already prepared closed polyline."""

    if len(points) < 3:
        raise ValueError("a closed curve needs at least three distinct points")
    following = np.roll(points, -1, axis=0)
    segment_lengths = np.linalg.norm(following - points, axis=1)
    if np.any(segment_lengths <= _EPS):
        raise ValueError("closed curve contains a zero-length segment")
    cumulative = np.concatenate((np.array([0.0]), np.cumsum(segment_lengths)))
    total = float(cumulative[-1])
    targets = np.linspace(0.0, total, sample_count, endpoint=False)
    indices = np.searchsorted(cumulative, targets, side="right") - 1
    indices = np.clip(indices, 0, len(points) - 1)
    fractions = (targets - cumulative[indices]) / segment_lengths[indices]
    return cast(
        FloatArray,
        points[indices] + fractions[:, None] * (following[indices] - points[indices]),
    )


def _periodic_cubic_spline(points: FloatArray, sample_count: int) -> FloatArray:
    """Evaluate the C2 periodic interpolating cubic spline for equal-spaced controls."""

    position = np.arange(sample_count, dtype=np.float64) * len(points) / sample_count
    index = np.floor(position).astype(np.int64)
    t = (position - index)[:, None]
    rhs = 6 * (np.roll(points, -1, axis=0) - 2 * points + np.roll(points, 1, axis=0))
    frequencies = 2 * np.pi * np.arange(len(points), dtype=np.float64) / len(points)
    eigenvalues = 4 + 2 * np.cos(frequencies)
    second_derivative = np.fft.ifft(
        np.fft.fft(rhs, axis=0) / eigenvalues[:, None],
        axis=0,
    ).real
    start = index % len(points)
    end = (index + 1) % len(points)
    one_minus_t = 1 - t
    return (
        second_derivative[start] * one_minus_t**3 / 6
        + second_derivative[end] * t**3 / 6
        + (points[start] - second_derivative[start] / 6) * one_minus_t
        + (points[end] - second_derivative[end] / 6) * t
    )


def resample_closed(points: FloatArray, sample_count: int) -> FloatArray:
    """Periodically spline and equal-arc resample a non-repeated closed curve.

    Input vertices are first put on an equal-distance parameter. This avoids the
    speed/curvature instability caused by directly differentiating a piecewise
    linear drawing and makes results substantially less sensitive to sample count.
    """

    points = _clean_closed(np.asarray(points, dtype=np.float64))
    if len(points) < 3:
        raise ValueError("a closed curve needs at least three distinct points")
    control_count = len(points)
    controls = _linear_resample_closed(points, control_count)
    dense_count = min(16_000, max(sample_count * 8, control_count * 8))
    dense = _periodic_cubic_spline(controls, dense_count)
    return _linear_resample_closed(dense, sample_count)


def _segment_intersections(
    a: FloatArray,
    b: FloatArray,
    starts: FloatArray,
    ends: FloatArray,
) -> NDArray[np.bool_]:
    """Vectorized intersection test between one segment and many segments."""

    ab = b - a
    o1 = ab[0] * (starts[:, 1] - a[1]) - ab[1] * (starts[:, 0] - a[0])
    o2 = ab[0] * (ends[:, 1] - a[1]) - ab[1] * (ends[:, 0] - a[0])
    other = ends - starts
    o3 = other[:, 0] * (a[1] - starts[:, 1]) - other[:, 1] * (a[0] - starts[:, 0])
    o4 = other[:, 0] * (b[1] - starts[:, 1]) - other[:, 1] * (b[0] - starts[:, 0])
    crosses = (((o1 > _EPS) & (o2 < -_EPS)) | ((o1 < -_EPS) & (o2 > _EPS))) & (
        ((o3 > _EPS) & (o4 < -_EPS)) | ((o3 < -_EPS) & (o4 > _EPS))
    )

    def on_segment(first: FloatArray, second: FloatArray, points: FloatArray) -> NDArray[np.bool_]:
        return cast(
            NDArray[np.bool_],
            (points[:, 0] >= min(first[0], second[0]) - _EPS)
            & (points[:, 0] <= max(first[0], second[0]) + _EPS)
            & (points[:, 1] >= min(first[1], second[1]) - _EPS)
            & (points[:, 1] <= max(first[1], second[1]) + _EPS),
        )

    collinear = (
        ((np.abs(o1) <= _EPS) & on_segment(a, b, starts))
        | ((np.abs(o2) <= _EPS) & on_segment(a, b, ends))
        | (
            (np.abs(o3) <= _EPS)
            & (a[0] >= np.minimum(starts[:, 0], ends[:, 0]) - _EPS)
            & (a[0] <= np.maximum(starts[:, 0], ends[:, 0]) + _EPS)
            & (a[1] >= np.minimum(starts[:, 1], ends[:, 1]) - _EPS)
            & (a[1] <= np.maximum(starts[:, 1], ends[:, 1]) + _EPS)
        )
        | (
            (np.abs(o4) <= _EPS)
            & (b[0] >= np.minimum(starts[:, 0], ends[:, 0]) - _EPS)
            & (b[0] <= np.maximum(starts[:, 0], ends[:, 0]) + _EPS)
            & (b[1] >= np.minimum(starts[:, 1], ends[:, 1]) - _EPS)
            & (b[1] <= np.maximum(starts[:, 1], ends[:, 1]) + _EPS)
        )
    )
    return cast(NDArray[np.bool_], crosses | collinear)


def _sweep_pairs(
    x_min: FloatArray,
    x_max: FloatArray,
) -> Iterator[tuple[int, NDArray[np.int64]]]:
    """Yield each segment with the earlier segments whose x-ranges still overlap.

    A closed track polyline keeps only a couple of segments active at any station,
    so this replaces the exhaustive quadratic pairing without weakening the exact
    predicate applied afterwards: every overlapping pair is still reported once.
    """

    active: list[int] = []
    for index in np.argsort(x_min, kind="stable"):
        position = int(index)
        threshold = x_min[position] - _EPS
        active = [other for other in active if x_max[other] >= threshold]
        if active:
            yield position, np.asarray(active, dtype=np.int64)
        active.append(position)


def _has_self_intersection(points: FloatArray) -> bool:
    count = len(points)
    if count < 3:
        return False
    starts = points
    ends = np.roll(points, -1, axis=0)
    x_min = np.minimum(starts[:, 0], ends[:, 0])
    x_max = np.maximum(starts[:, 0], ends[:, 0])
    for index, candidates in _sweep_pairs(x_min, x_max):
        neighbours = {index, (index - 1) % count, (index + 1) % count}
        candidates = candidates[[int(other) not in neighbours for other in candidates]]
        if not len(candidates):
            continue
        if np.any(
            _segment_intersections(starts[index], ends[index], starts[candidates], ends[candidates])
        ):
            return True
    return False


def _boundaries_intersect(first: FloatArray, second: FloatArray) -> bool:
    split = len(first)
    starts = np.vstack((first, second))
    ends = np.vstack((np.roll(first, -1, axis=0), np.roll(second, -1, axis=0)))
    x_min = np.minimum(starts[:, 0], ends[:, 0])
    x_max = np.maximum(starts[:, 0], ends[:, 0])
    for index, candidates in _sweep_pairs(x_min, x_max):
        # Only cross-boundary pairs matter; each edge is checked for self
        # intersection separately.
        candidates = (
            candidates[candidates >= split] if index < split else candidates[candidates < split]
        )
        if not len(candidates):
            continue
        if np.any(
            _segment_intersections(starts[index], ends[index], starts[candidates], ends[candidates])
        ):
            return True
    return False


def _inside_polygon(point: FloatArray, polygon: FloatArray) -> bool:
    """Even-odd containment test for a point not on the polygon boundary."""

    x, y = float(point[0]), float(point[1])
    inside = False
    previous = polygon[-1]
    for current in polygon:
        y_crosses = (current[1] > y) != (previous[1] > y)
        if y_crosses:
            intersection_x = (previous[0] - current[0]) * (y - current[1]) / (
                previous[1] - current[1]
            ) + current[0]
            if x < intersection_x:
                inside = not inside
        previous = current
    return inside


def _normalized_orientation(points: FloatArray, direction: str) -> FloatArray:
    wants_positive_area = direction == "counterclockwise"
    if (_signed_area(points) > 0) != wants_positive_area:
        return points[::-1].copy()
    return points


def _align_samples(reference: FloatArray, candidate: FloatArray) -> FloatArray:
    """Rotate equally directed samples to minimize whole-lap pairing distance.

    Minimizing ``sum |reference - roll(candidate, -offset)|**2`` is equivalent to
    maximizing their circular cross-correlation, because the two squared-norm
    terms do not depend on the offset. The correlation is evaluated with an FFT
    instead of testing every rotation explicitly.
    """

    count = len(candidate)
    correlation = np.zeros(count, dtype=np.float64)
    for axis in range(reference.shape[1]):
        spectrum = np.conjugate(np.fft.fft(reference[:, axis])) * np.fft.fft(candidate[:, axis])
        correlation += np.fft.ifft(spectrum).real
    offset = int(np.argmax(correlation))
    return np.roll(candidate, -offset, axis=0)


def _unit_normals(curve: FloatArray) -> FloatArray:
    """Left-hand unit normals of a closed curve, from central differences."""

    tangent = np.roll(curve, -1, axis=0) - np.roll(curve, 1, axis=0)
    length = np.hypot(tangent[:, 0], tangent[:, 1])
    safe = np.where(length < _EPS, 1.0, length)
    return np.column_stack((-tangent[:, 1] / safe, tangent[:, 0] / safe))


def _boundary_clearance(points: FloatArray, boundary: FloatArray) -> FloatArray:
    """Distance from each point to the nearest point of a closed boundary.

    This is the quantity a safety margin is about -- how far the wall is -- and
    unlike casting a ray along the normal it stays defined when the reference
    has drifted outside the corridor, which is precisely when a ray escapes and
    answers with a hit from the far side of the track.
    """

    starts = boundary
    edges = np.roll(boundary, -1, axis=0) - boundary
    lengths_sq = np.sum(edges * edges, axis=1)
    lengths_sq = np.where(lengths_sq < _EPS, 1.0, lengths_sq)

    clearances = np.empty(len(points), dtype=np.float64)
    for begin in range(0, len(points), _CORRIDOR_STATION_BATCH):
        end = min(begin + _CORRIDOR_STATION_BATCH, len(points))
        offset = points[begin:end, None, :] - starts[None, :, :]
        projection = np.clip(
            np.sum(offset * edges[None, :, :], axis=2) / lengths_sq[None, :], 0.0, 1.0
        )
        delta = offset - projection[:, :, None] * edges[None, :, :]
        clearances[begin:end] = np.min(np.hypot(delta[:, :, 0], delta[:, :, 1]), axis=1)
    return clearances


def _corridor_smoothing_passes(sample_count: int) -> int:
    """Hold the clearance filter's width fixed in arc length, not in samples.

    Same square-law scaling as the gradient filter: the filter diffuses, so its
    width grows with the square root of the pass count. Without this the
    corridor is measured differently at every resolution and the lap estimate
    drifts with ``sample_count``.
    """

    # `math.floor(x + 0.5)`, not `round`. Python rounds half to even and
    # JavaScript's `Math.round` rounds half up, so the two ports disagreed
    # wherever the pass count landed exactly on .5 -- at sample_count 450 the
    # engine smoothed 4 times and the browser 5, measuring different corridors.
    # No parity fixture uses one of those counts, so nothing caught it.
    scale = sample_count / _GRADIENT_SMOOTHING_REFERENCE_SAMPLES
    return max(1, math.floor(_CORRIDOR_SMOOTHING_PASSES * scale * scale + 0.5))


def _perpendicular_corridor(
    seed: FloatArray,
    left_boundary: FloatArray,
    right_boundary: FloatArray,
    sample_count: int,
) -> tuple[FloatArray, FloatArray, FloatArray, FloatArray]:
    """Measure the corridor from a centered reference instead of by paired index.

    Equal-arc resampling walks the inner and outer edge at different rates, so
    station ``i`` of one does not face station ``i`` of the other. The chord
    between them is the hypotenuse of a skewed pair: longer than the width the
    driver has, and in a tight corner it leaves the corridor entirely, so no
    fraction of it is safe. Measuring each wall's clearance from a centered
    reference restores the invariant the solver depends on -- ``left - right``
    spans the corridor, and a fraction of it is a real distance from the edge.
    """

    passes = _corridor_smoothing_passes(sample_count)

    def clearances(curve: FloatArray) -> tuple[FloatArray, FloatArray]:
        return (
            _smooth_periodic(_boundary_clearance(curve, left_boundary), passes),
            _smooth_periodic(_boundary_clearance(curve, right_boundary), passes),
        )

    reference = resample_closed(seed, sample_count)
    to_left, to_right = clearances(reference)

    for _ in range(_CORRIDOR_CENTERING_PASSES):
        normals = _unit_normals(reference)
        reference = resample_closed(
            reference + normals * ((to_left - to_right) * 0.5)[:, None], sample_count
        )
        to_left, to_right = clearances(reference)

    normals = _unit_normals(reference)
    left = reference + normals * to_left[:, None]
    right = reference - normals * to_right[:, None]
    return left, right, (left + right) * 0.5, to_left + to_right


def prepare_track(
    track: TrackV1,
    *,
    sample_count: int,
    safety_margin_m: float,
) -> GeometryOutcome:
    """Validate and normalize a track; never raises for geometric user errors."""

    errors: list[Issue] = []
    warnings: list[Issue] = []
    left_raw = _clean_closed(_as_array(track.left_boundary))
    right_raw = _clean_closed(_as_array(track.right_boundary))

    for name, boundary in (("left_boundary", left_raw), ("right_boundary", right_raw)):
        if len(boundary) < 3:
            errors.append(
                Issue(
                    code="TOO_FEW_POINTS",
                    message="Boundary has fewer than 3 usable points.",
                    field=name,
                )
            )
            continue
        length = _closed_length(boundary)
        if length < 5.0:
            errors.append(
                Issue(
                    code="BOUNDARY_TOO_SHORT",
                    message="Boundary length must be at least 5 m.",
                    field=name,
                )
            )
        if length > _MAX_BOUNDARY_LENGTH_M:
            errors.append(
                Issue(
                    code="BOUNDARY_TOO_LONG",
                    message="Boundary length exceeds the 1,000 km local-coordinate limit.",
                    field=name,
                )
            )
        if abs(_signed_area(boundary)) < 0.5:
            errors.append(
                Issue(
                    code="DEGENERATE_BOUNDARY",
                    message="Boundary encloses too little area.",
                    field=name,
                )
            )

    combined = np.vstack((left_raw, right_raw))
    coordinate_span = np.ptp(combined, axis=0)
    if float(np.max(coordinate_span)) > _MAX_TRACK_SPAN_M:
        errors.append(
            Issue(
                code="COORDINATE_SPAN_TOO_LARGE",
                message="Local track coordinates may span at most 100 km per axis.",
                field="track",
            )
        )

    # The public schema caps each edge at 2,000 vertices, so these checks are
    # exact on every submitted segment. Silently downsampling can hide a narrow
    # crossing and is unsafe for a track corridor.
    if _has_self_intersection(left_raw):
        errors.append(
            Issue(
                code="SELF_INTERSECTION",
                message="Left boundary crosses itself.",
                field="left_boundary",
            )
        )
    if _has_self_intersection(right_raw):
        errors.append(
            Issue(
                code="SELF_INTERSECTION",
                message="Right boundary crosses itself.",
                field="right_boundary",
            )
        )
    if _boundaries_intersect(left_raw, right_raw):
        errors.append(Issue(code="BOUNDARIES_INTERSECT", message="Track boundaries intersect."))

    if not errors:
        outer, inner = (
            (left_raw, right_raw)
            if abs(_signed_area(left_raw)) >= abs(_signed_area(right_raw))
            else (right_raw, left_raw)
        )
        if not _inside_polygon(inner[0], outer):
            errors.append(
                Issue(
                    code="BOUNDARIES_NOT_NESTED",
                    message="One closed boundary must sit inside the other without crossing.",
                )
            )

        left_area = abs(_signed_area(left_raw))
        right_area = abs(_signed_area(right_raw))
        left_should_be_outer = track.direction == "clockwise"
        left_is_outer = left_area > right_area
        if left_is_outer != left_should_be_outer:
            errors.append(
                Issue(
                    code="BOUNDARY_SIDE_MISMATCH",
                    message=(
                        "left_boundary and right_boundary must be named from the "
                        "driver's direction of travel."
                    ),
                    field="track.direction",
                )
            )

    if errors:
        return GeometryOutcome(
            validation=TrackValidationResult(valid=False, errors=errors, warnings=warnings),
            prepared=None,
        )

    normalized_left = _normalized_orientation(left_raw, track.direction)
    normalized_right = _normalized_orientation(right_raw, track.direction)
    validation_count = min(
        2_000,
        max(256, sample_count, len(left_raw) * 2, len(right_raw) * 2),
    )
    left_dense = resample_closed(normalized_left, validation_count)
    right_dense = _align_samples(
        left_dense,
        resample_closed(normalized_right, validation_count),
    )
    if _has_self_intersection(left_dense):
        errors.append(
            Issue(
                code="SPLINE_SELF_INTERSECTION",
                message="Periodic interpolation makes the left boundary cross itself.",
                field="left_boundary",
            )
        )
    if _has_self_intersection(right_dense):
        errors.append(
            Issue(
                code="SPLINE_SELF_INTERSECTION",
                message="Periodic interpolation makes the right boundary cross itself.",
                field="right_boundary",
            )
        )
    if _boundaries_intersect(left_dense, right_dense):
        errors.append(
            Issue(
                code="SPLINE_BOUNDARIES_INTERSECT",
                message="Periodic interpolation makes the track boundaries intersect.",
            )
        )
    if errors:
        return GeometryOutcome(
            validation=TrackValidationResult(valid=False, errors=errors, warnings=warnings),
            prepared=None,
        )

    paired_left = resample_closed(normalized_left, sample_count)
    paired_right = _align_samples(paired_left, resample_closed(normalized_right, sample_count))
    left, right, center, widths = _perpendicular_corridor(
        (paired_left + paired_right) * 0.5,
        left_dense,
        right_dense,
        sample_count,
    )
    center_length = _closed_length(center)

    if float(np.min(widths)) <= 2 * safety_margin_m + 0.05:
        errors.append(
            Issue(
                code="INSUFFICIENT_USABLE_WIDTH",
                message="Safety margins leave no usable corridor at the narrowest station.",
                field="safety_margin_m",
            )
        )
    if center_length < 5.0:
        errors.append(
            Issue(code="TRACK_TOO_SHORT", message="Resampled centerline is shorter than 5 m.")
        )
    if float(np.max(widths)) > max(4 * float(np.median(widths)), 30.0):
        warnings.append(
            Issue(
                code="WIDTH_VARIATION_HIGH",
                message="Large width variation may mean the boundary start points are misaligned.",
            )
        )
    tangent = np.roll(center, -1, axis=0) - np.roll(center, 1, axis=0)
    toward_left = left - center
    side_cross = tangent[:, 0] * toward_left[:, 1] - tangent[:, 1] * toward_left[:, 0]
    if float(np.mean(side_cross > 0)) < 0.95:
        errors.append(
            Issue(
                code="BOUNDARY_SIDE_INCONSISTENT",
                message="Aligned left boundary is not consistently left of the travel direction.",
                field="left_boundary",
            )
        )
    if _has_self_intersection(center):
        errors.append(
            Issue(
                code="CENTERLINE_SELF_INTERSECTION",
                message=(
                    "Paired boundaries produce a self-intersecting centerline; "
                    "align their start points."
                ),
            )
        )

    metrics = TrackMetrics(
        track_length_m=center_length,
        min_width_m=float(np.min(widths)),
        mean_width_m=float(np.mean(widths)),
        max_width_m=float(np.max(widths)),
        sample_count=sample_count,
    )
    validation = TrackValidationResult(
        valid=not errors,
        errors=errors,
        warnings=warnings,
        metrics=metrics,
    )
    prepared = None
    if validation.valid:
        prepared = PreparedTrack(
            left=left, right=right, center=center, widths=widths, length_m=center_length
        )
    return GeometryOutcome(validation=validation, prepared=prepared)


def _bending_terms(path: FloatArray) -> FloatArray:
    """Discrete approximation of integral(curvature**2 ds) at every station."""

    previous = np.roll(path, 1, axis=0)
    following = np.roll(path, -1, axis=0)
    incoming = path - previous
    outgoing = following - path
    chord = following - previous
    incoming_length = np.linalg.norm(incoming, axis=1)
    outgoing_length = np.linalg.norm(outgoing, axis=1)
    denominator = incoming_length * outgoing_length * np.linalg.norm(chord, axis=1)
    cross = incoming[:, 0] * outgoing[:, 1] - incoming[:, 1] * outgoing[:, 0]
    curvature = np.divide(
        2.0 * cross,
        denominator,
        out=np.zeros_like(cross),
        where=denominator > _EPS,
    )
    local_distance = 0.5 * (incoming_length + outgoing_length)
    return cast(FloatArray, curvature**2 * local_distance)


def _bending_objective(path: FloatArray) -> float:
    return float(np.sum(_bending_terms(path)))


def _fraction_gradient(path: FloatArray, corridor: FloatArray, epsilon: float = 1e-5) -> FloatArray:
    """Central-difference objective gradient from the three locally affected terms."""

    previous = np.roll(path, 1, axis=0)
    previous_two = np.roll(path, 2, axis=0)
    following = np.roll(path, -1, axis=0)
    following_two = np.roll(path, -2, axis=0)
    delta = epsilon * corridor

    def terms(a: FloatArray, b: FloatArray, c: FloatArray) -> FloatArray:
        incoming = b - a
        outgoing = c - b
        chord = c - a
        incoming_length = np.linalg.norm(incoming, axis=1)
        outgoing_length = np.linalg.norm(outgoing, axis=1)
        denominator = incoming_length * outgoing_length * np.linalg.norm(chord, axis=1)
        cross = incoming[:, 0] * outgoing[:, 1] - incoming[:, 1] * outgoing[:, 0]
        curvature = np.divide(
            2.0 * cross,
            denominator,
            out=np.zeros_like(cross),
            where=denominator > _EPS,
        )
        return cast(FloatArray, curvature**2 * 0.5 * (incoming_length + outgoing_length))

    current_plus = terms(previous, path + delta, following)
    current_minus = terms(previous, path - delta, following)
    as_previous_plus = terms(path + delta, following, following_two)
    as_previous_minus = terms(path - delta, following, following_two)
    as_following_plus = terms(previous_two, previous, path + delta)
    as_following_minus = terms(previous_two, previous, path - delta)
    return (
        current_plus
        - current_minus
        + as_previous_plus
        - as_previous_minus
        + as_following_plus
        - as_following_minus
    ) / (2 * epsilon)


def _smooth_periodic(values: FloatArray, passes: int) -> FloatArray:
    """Apply the ``[1, 2, 1]/4`` circular filter ``passes`` times, in one FFT pair.

    One pass scales Fourier mode ``f`` (in cycles per sample) by ``cos(pi f)**2``,
    so ``passes`` of them scale it by ``cos(pi f)**(2 * passes)``. Evaluating that
    directly keeps the cost at O(n log n) no matter how wide the filter is.
    """

    if passes <= 0:
        return values
    weights = np.cos(np.pi * np.fft.rfftfreq(len(values))) ** (2 * passes)
    return np.fft.irfft(np.fft.rfft(values) * weights, len(values))


def _smoothing_passes(sample_count: int) -> int:
    """Keep the gradient filter's width constant in arc length, not in samples.

    The filter behaves like diffusion, so its width grows with the square root of
    the pass count. Holding the physical width fixed therefore needs a pass count
    that grows with the square of the resolution; otherwise the preconditioner
    silently weakens as ``sample_count`` rises and the same track converges to a
    measurably different line.
    """

    # Half-up, matching `Math.round` in the port. See _corridor_smoothing_passes:
    # this one happens never to land on .5 for an integer sample count, which is
    # luck rather than design.
    scale = sample_count / _GRADIENT_SMOOTHING_REFERENCE_SAMPLES
    return max(1, math.floor(_GRADIENT_SMOOTHING_PASSES * scale * scale + 0.5))


def _free_direction(
    direction: FloatArray,
    fraction: FloatArray,
    lower: FloatArray,
    upper: FloatArray,
) -> FloatArray:
    """Zero the components that the corridor bounds would immediately clip away.

    The step is ``fraction - t * direction``, so a positive component is blocked
    at the lower bound and a negative one at the upper bound. Clipping those
    afterwards instead of removing them here can flip an otherwise descending
    preconditioned step into an ascending one.
    """

    blocked = ((fraction <= lower + _EPS) & (direction > 0)) | (
        (fraction >= upper - _EPS) & (direction < 0)
    )
    return cast(FloatArray, np.where(blocked, 0.0, direction))


def minimum_bending_path(
    track: PreparedTrack,
    *,
    safety_margin_m: float,
    iterations: int,
) -> tuple[FloatArray, BendingDiagnostics]:
    """Minimize integrated squared curvature inside station-wise track bounds.

    This lightweight projected-gradient method is deterministic and produces a
    useful minimum-bending baseline without claiming a global minimum-time line.
    Backtracking accepts only objective-decreasing steps.
    """

    corridor = track.left - track.right
    lower = safety_margin_m / track.widths
    upper = 1.0 - lower
    fraction = np.full(len(track.center), 0.5, dtype=np.float64)
    path = track.right + fraction[:, None] * corridor
    objective = _bending_objective(path)
    initial_objective = objective
    converged = False
    termination_reason: PathTerminationReason = "skipped" if iterations == 0 else "iteration_limit"
    completed = 0
    max_fraction_step = 0.0
    smoothing_passes = _smoothing_passes(len(track.center))

    for iteration in range(1, iterations + 1):
        gradient = _fraction_gradient(path, corridor)
        # First test the zero-frequency component explicitly. It efficiently
        # captures the analytically correct move toward the outer radius on a
        # circular corridor, while objective checking makes it safe elsewhere.
        mean_gradient = float(np.mean(gradient))
        global_accepted = False
        if abs(mean_gradient) >= 1e-10:
            global_step = -0.05 if mean_gradient > 0 else 0.05
            global_fraction = np.clip(fraction + global_step, lower, upper)
            global_path = track.right + global_fraction[:, None] * corridor
            global_objective = _bending_objective(global_path)
            if global_objective < objective - 1e-12:
                max_fraction_step = max(
                    max_fraction_step,
                    float(np.max(np.abs(global_fraction - fraction))),
                )
                fraction = global_fraction
                path = global_path
                objective = global_objective
                global_accepted = True
                gradient = _fraction_gradient(path, corridor)
        # The polyline representation produces high-frequency vertex noise in
        # curvature derivatives. A compact periodic low-pass is a deterministic
        # preconditioner and also favours driveable lateral-offset variation.
        smoothed = _smooth_periodic(gradient, smoothing_passes)
        maximum_gradient = float(np.max(np.abs(smoothed)))
        if maximum_gradient < 1e-10:
            converged = True
            termination_reason = "gradient_tolerance"
            completed = iteration
            break
        # A raw gradient can stay non-zero at a constrained optimum. This
        # projected step is the scale-independent KKT residual used to
        # distinguish convergence at a corridor edge from a stalled line search.
        projected_fraction = np.clip(
            fraction - 0.08 * gradient / float(np.max(np.abs(gradient))),
            lower,
            upper,
        )
        projected_residual = float(np.max(np.abs(projected_fraction - fraction)))
        # Accepting on an absolute epsilon rejects usable steps once the
        # objective is far from zero, so scale the tolerance with its magnitude.
        acceptance_tolerance = 1e-12 * max(1.0, abs(objective))
        accepted = False
        candidate_fraction = fraction
        candidate_path = path
        candidate_objective = objective
        # The smoothed direction is only a preconditioner and can stall while a
        # feasible descent step still exists, so fall back to the raw gradient
        # before reporting that the line search made no progress.
        for direction in (smoothed, gradient):
            free = _free_direction(direction, fraction, lower, upper)
            maximum_free = float(np.max(np.abs(free)))
            if maximum_free < 1e-10:
                continue
            step_size = 0.08 / maximum_free
            for _ in range(16):
                candidate_fraction = np.clip(fraction - step_size * free, lower, upper)
                candidate_path = track.right + candidate_fraction[:, None] * corridor
                candidate_objective = _bending_objective(candidate_path)
                if candidate_objective <= objective - acceptance_tolerance:
                    accepted = True
                    break
                step_size *= 0.5
            if accepted:
                break
        if not accepted:
            completed = iteration
            if global_accepted:
                continue
            # Both directions have been tried with 16 halvings from
            # ``0.08 / max|free|``, so the smallest displacement the line search
            # offered is ``0.08 * 2**-16`` ~= 1.2e-6 -- an order of magnitude
            # below the 1e-5 step tolerance this same function trusts as
            # convergence twenty lines down. No feasible descent step of
            # significant magnitude exists, which is what convergence means
            # here; the iterate is stationary.
            #
            # The KKT residual cannot arbitrate that. It is built from a
            # finite-difference gradient, and once the objective is flat that
            # gradient is roundoff: on an annulus sitting on the exact analytic
            # optimum the residual reads 8e-2, the full step, while the line
            # search cannot buy an improvement at any scale.
            converged = True
            termination_reason = "step_tolerance"
            break
        fraction_step = float(np.max(np.abs(candidate_fraction - fraction)))
        max_fraction_step = max(max_fraction_step, fraction_step)
        fraction = candidate_fraction
        path = candidate_path
        objective = candidate_objective
        completed = iteration
        if fraction_step < 1e-5 and projected_residual < 1e-5:
            converged = True
            termination_reason = "step_tolerance"
            break

    return path, BendingDiagnostics(
        initial_objective=initial_objective,
        final_objective=objective,
        iterations=completed,
        converged=converged,
        termination_reason=termination_reason,
        max_fraction_step=max_fraction_step,
        min_corridor_fraction=float(np.min(fraction)),
        max_corridor_fraction=float(np.max(fraction)),
    )


def path_channels(path: FloatArray) -> tuple[FloatArray, FloatArray, FloatArray, FloatArray]:
    """Return station, segment length, heading, and signed discrete curvature."""

    previous = np.roll(path, 1, axis=0)
    following = np.roll(path, -1, axis=0)
    incoming = path - previous
    outgoing = following - path
    chord = following - previous
    incoming_length = np.linalg.norm(incoming, axis=1)
    outgoing_length = np.linalg.norm(outgoing, axis=1)
    chord_length = np.linalg.norm(chord, axis=1)
    denominator = incoming_length * outgoing_length * chord_length
    cross = incoming[:, 0] * outgoing[:, 1] - incoming[:, 1] * outgoing[:, 0]
    curvature = np.divide(
        2.0 * cross,
        denominator,
        out=np.zeros_like(cross),
        where=denominator > _EPS,
    )
    segment_lengths = outgoing_length
    station = np.concatenate((np.array([0.0]), np.cumsum(segment_lengths[:-1])))
    heading = np.arctan2(chord[:, 1], chord[:, 0])
    return station, segment_lengths, heading, curvature
