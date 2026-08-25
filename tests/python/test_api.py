from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from openkartline_api import main
from openkartline_engine.schemas import SimulationRequestV1

client = TestClient(main.app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "openkartline-api",
        "engine_version": "0.1.0",
        "schema_version": "1.0",
    }


def test_openapi_has_stable_operation_ids_and_models() -> None:
    contract = client.get("/openapi.json").json()
    assert contract["info"]["version"] == "0.1.0"
    assert contract["paths"]["/v1/tracks/validate"]["post"]["operationId"] == "validateTrackV1"
    assert contract["paths"]["/v1/simulations"]["post"]["operationId"] == "createSimulationV1"
    assert "429" in contract["paths"]["/v1/simulations"]["post"]["responses"]
    assert "SimulationResultV1" in contract["components"]["schemas"]


def test_validate_and_simulate_endpoints(circle_request: SimulationRequestV1) -> None:
    validation_response = client.post(
        "/v1/tracks/validate",
        json={"track": circle_request.track.model_dump(), "sample_count": 96},
    )
    assert validation_response.status_code == 200
    assert validation_response.json()["valid"] is True

    simulation_response = client.post("/v1/simulations", json=circle_request.model_dump())
    assert simulation_response.status_code == 200
    payload = simulation_response.json()
    assert payload["status"]["state"] == "success"
    assert len(payload["samples"]) == 96


def test_malformed_request_returns_422() -> None:
    response = client.post("/v1/simulations", json={"track": {}, "kart": {}})
    assert response.status_code == 422
    assert response.json()["detail"]


def test_oversized_request_is_rejected_before_json_parsing() -> None:
    response = client.post(
        "/v1/simulations",
        content=b"x" * (main.MAX_REQUEST_BODY_BYTES + 1),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
    assert "2 MiB" in response.json()["detail"]


def test_busy_local_solver_returns_429(circle_request: SimulationRequestV1) -> None:
    acquired = [
        main._COMPUTE_SLOTS.acquire(blocking=False) for _ in range(main.MAX_CONCURRENT_COMPUTATIONS)
    ]
    assert all(acquired)
    try:
        response = client.post("/v1/simulations", json=circle_request.model_dump())
    finally:
        for _ in acquired:
            main._COMPUTE_SLOTS.release()
    assert response.status_code == 429
    assert "busy" in response.json()["detail"]


def test_local_vite_cors_preflight() -> None:
    response = client.options(
        "/v1/simulations",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_non_local_cors_origin_is_not_allowed() -> None:
    response = client.options(
        "/v1/simulations",
        headers={"Origin": "https://example.com", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in response.headers


def _chunks(payload: bytes, size: int = 64 * 1024):
    """Yield the body in pieces so httpx streams it without a Content-Length."""

    for start in range(0, len(payload), size):
        yield payload[start : start + size]


def test_oversized_chunked_request_is_rejected_without_a_content_length() -> None:
    """The declared-size check is the easy half; this is the half that matters.

    A client that streams the body sends `Transfer-Encoding: chunked` and no
    `Content-Length`, so the header check never fires and only the accumulator
    stands between the process and an unbounded read. Deleting that loop keeps
    every other test in this suite green, which is why it needs its own.
    """

    oversized = b"x" * (main.MAX_REQUEST_BODY_BYTES + 1)
    response = client.post(
        "/v1/simulations",
        content=_chunks(oversized),
        headers={"Content-Type": "application/json"},
    )

    # Pins the premise: if httpx ever starts declaring a length here, this test
    # would silently go back to exercising the header branch instead.
    assert "content-length" not in {name.lower() for name in response.request.headers}
    assert response.status_code == 413
    assert "2 MiB" in response.json()["detail"]


def test_streamed_request_within_the_limit_still_reaches_the_engine(
    circle_request: SimulationRequestV1,
) -> None:
    """The accumulator has to replay what it buffered, not swallow it."""

    body = circle_request.model_dump_json().encode("utf-8")
    response = client.post(
        "/v1/simulations",
        content=_chunks(body, size=1024),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 200
    assert response.json()["status"]["state"] == "success"


@pytest.mark.parametrize("declared", ["not-a-number", "-1", ""])
def test_malformed_content_length_is_rejected(declared: str) -> None:
    """`-1` is the case a two-value test misses: it parses, then trips `< 0`."""

    response = client.request(
        "POST",
        "/v1/simulations",
        content=b"{}",
        headers={"Content-Type": "application/json", "Content-Length": declared},
    )

    assert response.status_code == 413
    assert "Content-Length" in response.json()["detail"]
