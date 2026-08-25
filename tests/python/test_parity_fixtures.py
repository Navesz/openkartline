"""Hold the Python engine to the parity fixtures the browser port is held to.

`engineParity.test.ts` compares the TypeScript port against the committed
`parity-result-*.json` files, so it catches drift on the browser side. Nothing
ran the Python engine against those same files, which means a Python-only
change plus a skipped `scripts/export_parity_fixtures.py` left every job green
while the two engines silently disagreed -- exactly the case the fixtures exist
to prevent.

The tolerances are the ones `engineParity.test.ts` uses, so both directions are
judged by the same standard. `python-tests` runs a five-way OS and interpreter
matrix, and the engine leans on FFTs, so these also serve as the check on
whether the committed numbers survive a change of platform.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from openkartline_engine.schemas import SimulationRequestV1
from openkartline_engine.simulation import simulate

FIXTURES = (
    Path(__file__).resolve().parent.parent.parent
    / "apps"
    / "web"
    / "src"
    / "domain"
    / "engine"
    / "__fixtures__"
)

#: Mirrors LAP_TIME_TOLERANCE in engineParity.test.ts.
LAP_TIME_RELATIVE_TOLERANCE = 1e-6
#: Mirrors LINE_DEVIATION_TOLERANCE_M.
POSITION_TOLERANCE_M = 1e-5
#: Mirrors SPEED_TOLERANCE_MPS.
SPEED_TOLERANCE_MPS = 1e-3


def _slugs() -> list[str]:
    return sorted(
        path.name.removeprefix("parity-request-").removesuffix(".json")
        for path in FIXTURES.glob("parity-request-*.json")
    )


SLUGS = _slugs()


def test_the_fixture_set_is_not_empty() -> None:
    """A glob that silently matches nothing would make every case below vacuous."""

    assert SLUGS, f"no parity request fixtures under {FIXTURES}"


@pytest.mark.parametrize("slug", SLUGS)
def test_engine_still_produces_the_committed_result(slug: str) -> None:
    request_path = FIXTURES / f"parity-request-{slug}.json"
    result_path = FIXTURES / f"parity-result-{slug}.json"
    assert result_path.exists(), f"{slug} has a request fixture but no result fixture"

    request = SimulationRequestV1.model_validate_json(request_path.read_text(encoding="utf-8"))
    expected = json.loads(result_path.read_text(encoding="utf-8"))
    actual = simulate(request)

    assert actual.status.state == expected["status"]["state"]
    assert actual.status.code == expected["status"]["code"]
    assert actual.summary is not None
    assert len(actual.samples) == len(expected["samples"])

    assert actual.summary.lap_time_s == pytest.approx(
        expected["summary"]["lap_time_s"], rel=LAP_TIME_RELATIVE_TOLERANCE
    )
    assert actual.summary.track_length_m == pytest.approx(
        expected["summary"]["track_length_m"], rel=LAP_TIME_RELATIVE_TOLERANCE
    )

    positions = np.array([(sample.x_m, sample.y_m) for sample in actual.samples])
    expected_positions = np.array([(s["x_m"], s["y_m"]) for s in expected["samples"]])
    deviation = np.hypot(*(positions - expected_positions).T)
    assert float(np.max(deviation)) <= POSITION_TOLERANCE_M

    speeds = np.array([sample.speed_mps for sample in actual.samples])
    expected_speeds = np.array([s["speed_mps"] for s in expected["samples"]])
    assert float(np.max(np.abs(speeds - expected_speeds))) <= SPEED_TOLERANCE_MPS


@pytest.mark.parametrize("slug", SLUGS)
def test_engine_still_places_the_same_driving_markers(slug: str) -> None:
    """Markers are indices, so they either match or they do not.

    Kept separate from the numeric comparison: a marker that moves is a
    different instruction to the driver, not a rounding difference, and it
    should not be reported as a lap-time failure.
    """

    request = SimulationRequestV1.model_validate_json(
        (FIXTURES / f"parity-request-{slug}.json").read_text(encoding="utf-8")
    )
    expected = json.loads((FIXTURES / f"parity-result-{slug}.json").read_text(encoding="utf-8"))
    actual = simulate(request)

    produced = [(marker.kind, marker.sample_index) for marker in actual.markers]
    committed = [(marker["kind"], marker["sample_index"]) for marker in expected["markers"]]
    assert produced == committed
