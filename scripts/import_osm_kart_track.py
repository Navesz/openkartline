#!/usr/bin/env python3
# Purpose: turn a single closed OpenStreetMap kart-circuit way into an OpenKartLine
# `.okl.json` project file, so that every committed real-circuit example under
# examples/tracks/ can be regenerated and audited from its recorded OSM way id.
#
# The OSM source data is ODbL 1.0, "(c) OpenStreetMap contributors". Geometry produced
# by this script is a Produced Work / Derivative Database under ODbL and is NOT covered
# by the repository's Apache-2.0 code license. See THIRD_PARTY.md and
# examples/tracks/README.md before adding or regenerating an example.
"""Import a closed OSM kart-circuit way as an OpenKartLine project file.

Example:
    python scripts/import_osm_kart_track.py \
        --way-id 798432703 \
        --name "Adria Karting Raceway" \
        --output examples/tracks/adria-karting-raceway.okl.json

The script refuses ways that are not closed and warns when the way is not tagged
as a kart circuit, because the schema models a closed kart centerline only.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
EARTH_RADIUS_M = 6378137.0
USER_AGENT = "openkartline-osm-import/0.1 (+https://openkartline.dev)"
# The 0.1.0 schema allows 4..500 centerline points; examples stay well inside that so the
# committed geometry keeps corner shape without becoming an unreadable node dump.
MIN_POINTS = 30
MAX_POINTS = 120

Point = tuple[float, float]

# Kart block copied verbatim from examples/tracks/circuito-aurora.okl.json so that every
# example differs only in geometry. None of these numbers come from OSM.
KART_BLOCK: dict[str, Any] = {
    "model": "point_mass_v1",
    "total_mass_kg": 190,
    "parameters": {
        "power_hp": 13,
        "kart_mass_kg": 115,
        "driver_mass_kg": 75,
        "top_speed_kph": 82,
        "grip_coefficient": 1.05,
        "brake_decel_mps2": 7.5,
    },
}
SIMULATION_BLOCK: dict[str, Any] = {
    "solver": "speed_profile_v1",
    "settings": {"sample_count": 200},
    "safety_margin_m": 0.55,
}


def fetch_way(way_id: int, url: str, attempts: int, pause_s: float) -> dict[str, Any]:
    """Fetch one way with metadata and geometry from an Overpass endpoint."""
    query = f"[out:json][timeout:120];way(id:{way_id});out meta geom;"
    body = urllib.parse.urlencode({"data": query}).encode()
    last_error = ""
    for attempt in range(1, attempts + 1):
        request = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                payload = response.read().decode()
        except (urllib.error.URLError, TimeoutError) as error:  # pragma: no cover - network
            last_error = str(error)
            payload = ""
        if payload.startswith("{"):
            return json.loads(payload)
        last_error = last_error or payload.strip()[:200]
        print(f"attempt {attempt}/{attempts} failed; retrying", file=sys.stderr)
        time.sleep(pause_s)
    raise SystemExit(f"Overpass did not return JSON for way {way_id}: {last_error}")


def project_equirectangular(geometry: list[dict[str, float]]) -> tuple[list[Point], float, float]:
    """Project WGS84 nodes onto a local metric frame centred on the node centroid.

    Equirectangular projection scaled at the origin latitude. Distortion is far below a
    metre across the few hundred metres a kart circuit spans, which is the accuracy this
    project needs.
    """
    lat0 = sum(node["lat"] for node in geometry) / len(geometry)
    lon0 = sum(node["lon"] for node in geometry) / len(geometry)
    scale = math.cos(math.radians(lat0))
    points = [
        (
            EARTH_RADIUS_M * math.radians(node["lon"] - lon0) * scale,
            EARTH_RADIUS_M * math.radians(node["lat"] - lat0),
        )
        for node in geometry
    ]
    return points, lat0, lon0


def polyline_length(points: list[Point], *, closed: bool) -> float:
    ordered = [*points, points[0]] if closed else points
    return sum(math.dist(ordered[i], ordered[i + 1]) for i in range(len(ordered) - 1))


def signed_area(points: list[Point]) -> float:
    total = 0.0
    for index, (x0, y0) in enumerate(points):
        x1, y1 = points[(index + 1) % len(points)]
        total += x0 * y1 - x1 * y0
    return total / 2.0


def resample_closed(points: list[Point], count: int) -> list[Point]:
    """Resample a closed polygon to `count` points at equal arc-length spacing.

    The first output point is the first input point and the ring is not repeated, which
    is what the 0.1.0 project schema expects from `raw_centerline`.
    """
    ring = [*points, points[0]]
    cumulative = [0.0]
    for index in range(len(ring) - 1):
        cumulative.append(cumulative[-1] + math.dist(ring[index], ring[index + 1]))
    total = cumulative[-1]
    step = total / count
    resampled: list[Point] = []
    cursor = 0
    for index in range(count):
        target = index * step
        while cursor < len(cumulative) - 2 and cumulative[cursor + 1] < target:
            cursor += 1
        segment = cumulative[cursor + 1] - cumulative[cursor]
        fraction = 0.0 if segment <= 0 else (target - cumulative[cursor]) / segment
        x0, y0 = ring[cursor]
        x1, y1 = ring[cursor + 1]
        resampled.append((x0 + (x1 - x0) * fraction, y0 + (y1 - y0) * fraction))
    return resampled


def point_to_segment_distance(point: Point, start: Point, end: Point) -> float:
    px, py = point
    ax, ay = start
    bx, by = end
    dx, dy = bx - ax, by - ay
    squared = dx * dx + dy * dy
    if squared <= 0.0:
        return math.dist(point, start)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / squared))
    return math.dist(point, (ax + dx * t, ay + dy * t))


def max_deviation(source: list[Point], approximation: list[Point]) -> float:
    """Largest distance from an original node to the resampled polygon."""
    ring = [*approximation, approximation[0]]
    return max(
        min(
            point_to_segment_distance(node, ring[index], ring[index + 1])
            for index in range(len(ring) - 1)
        )
        for node in source
    )


def build_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--way-id", type=int, required=True, help="OSM way id of the circuit")
    parser.add_argument("--name", required=True, help="project.name for the generated file")
    parser.add_argument("--output", type=Path, required=True, help="destination .okl.json path")
    parser.add_argument(
        "--target-spacing-m",
        type=float,
        default=11.0,
        help="desired arc-length spacing; the point count is derived from it and clamped",
    )
    parser.add_argument("--points", type=int, help="explicit point count, overrides the spacing")
    parser.add_argument("--width-m", type=float, default=8.0, help="ESTIMATED usable width")
    parser.add_argument(
        "--direction",
        choices=["clockwise", "counterclockwise", "from-node-order"],
        default="from-node-order",
        help="travel direction; 'from-node-order' derives it from the OSM node order",
    )
    parser.add_argument(
        "--timestamp",
        default="2026-08-07T00:00:00.000Z",
        help="project.created_at/updated_at value (extraction date, UTC midnight)",
    )
    parser.add_argument("--overpass-url", default=OVERPASS_URL)
    parser.add_argument("--attempts", type=int, default=6)
    parser.add_argument("--pause-s", type=float, default=20.0)
    parser.add_argument("--raw-out", type=Path, help="optional path to save the Overpass response")
    return parser.parse_args()


def main() -> int:
    args = build_arguments()
    payload = fetch_way(args.way_id, args.overpass_url, args.attempts, args.pause_s)
    if args.raw_out:
        args.raw_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")

    elements = payload.get("elements", [])
    if not elements:
        raise SystemExit(f"way {args.way_id} returned no elements")
    way = elements[0]
    tags = way.get("tags", {})
    if tags.get("sport") != "karting":
        print(f"WARNING: way {args.way_id} is not tagged sport=karting", file=sys.stderr)
    nodes = way["nodes"]
    if nodes[0] != nodes[-1]:
        raise SystemExit(f"way {args.way_id} is not a closed ring; refusing to import")

    geometry = way["geometry"][:-1]  # drop the repeated closing node
    points, lat0, lon0 = project_equirectangular(geometry)
    source_length = polyline_length(points, closed=True)

    derived = round(source_length / args.target_spacing_m)
    count = args.points or max(MIN_POINTS, min(MAX_POINTS, derived))
    centerline = resample_closed(points, count)
    resampled_length = polyline_length(centerline, closed=True)
    deviation = max_deviation(points, centerline)

    rounded = [(round(x, 2), round(y, 2)) for x, y in centerline]
    orientation = "counterclockwise" if signed_area(rounded) > 0 else "clockwise"
    direction = orientation if args.direction == "from-node-order" else args.direction

    project = {
        "schema_version": "0.1.0",
        "project": {
            "name": args.name,
            "created_at": args.timestamp,
            "updated_at": args.timestamp,
        },
        "track": {
            "coordinate_system": "local_cartesian_m",
            "direction": direction,
            "width_m": args.width_m,
            "raw_centerline": [[x, y] for x, y in rounded],
        },
        "kart": KART_BLOCK,
        "simulation": SIMULATION_BLOCK,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(project, indent=2, ensure_ascii=False) + "\n")

    xs = [x for x, _ in rounded]
    ys = [y for _, y in rounded]
    report = {
        "way_id": args.way_id,
        "way_version": way.get("version"),
        "way_last_edited": way.get("timestamp"),
        "osm_base_timestamp": payload.get("osm3s", {}).get("timestamp_osm_base"),
        "tags": tags,
        "origin_lat": round(lat0, 7),
        "origin_lon": round(lon0, 7),
        "source_nodes": len(geometry),
        "source_length_m": round(source_length, 1),
        "output_points": len(rounded),
        "output_length_m": round(resampled_length, 1),
        "mean_spacing_m": round(resampled_length / len(rounded), 2),
        "max_deviation_m": round(deviation, 2),
        "node_order_orientation": orientation,
        "written_direction": direction,
        "bbox_x_m": [round(min(xs), 1), round(max(xs), 1)],
        "bbox_y_m": [round(min(ys), 1), round(max(ys), 1)],
        "bbox_size_m": [round(max(xs) - min(xs), 1), round(max(ys) - min(ys), 1)],
        "width_m_is_estimate": True,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
