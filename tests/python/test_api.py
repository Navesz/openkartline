from __future__ import annotations

import copy

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


class TestPublishedExamples:
    """The examples in `/docs` describe requests the service actually accepts.

    A schema example is documentation that looks executable, so a reader will
    paste it. These post the very objects the OpenAPI document publishes, which
    is the only thing that stops one drifting into describing a request the
    service would reject.
    """

    def test_every_request_schema_publishes_an_example(self) -> None:
        spec = client.get("/openapi.json").json()
        schemas = spec["components"]["schemas"]
        for name in (
            "TrackV1",
            "KartV1",
            "SimulationSettingsV1",
            "SimulationRequestV1",
            "TrackValidationRequest",
        ):
            assert schemas[name].get("examples"), f"{name} publishes no example"

    def test_both_operations_describe_themselves(self) -> None:
        # A summary is a label; the description is where the corridor
        # conventions and the fields that report the outcome are written down.
        spec = client.get("/openapi.json").json()
        for path, method in (
            ("/health", "get"),
            ("/v1/tracks/validate", "post"),
            ("/v1/simulations", "post"),
        ):
            operation = spec["paths"][path][method]
            assert operation.get("summary")
            assert len(operation.get("description", "")) > 80, f"{method} {path} has no description"

    def test_the_published_simulation_example_runs(self) -> None:
        spec = client.get("/openapi.json").json()
        example = spec["components"]["schemas"]["SimulationRequestV1"]["examples"][0]

        response = client.post("/v1/simulations", json=example)

        assert response.status_code == 200
        body = response.json()
        assert body["status"]["state"] == "success"
        assert body["summary"]["lap_time_s"] > 0
        assert body["summary"]["track_length_m"] > 0

    def test_the_published_validation_example_runs(self) -> None:
        spec = client.get("/openapi.json").json()
        example = spec["components"]["schemas"]["TrackValidationRequest"]["examples"][0]

        response = client.post("/v1/tracks/validate", json=example)

        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is True
        assert body["metrics"]["min_width_m"] > 0

    def test_the_simulation_description_names_what_the_published_example_reports(self) -> None:
        # The description once sent callers to `status.state` to learn whether
        # a lap converged. That field is `success` for this very example, whose
        # line stops at its iteration limit, so every field and value the
        # description tells a caller to read is checked against what it returns.
        spec = client.get("/openapi.json").json()
        description = " ".join(spec["paths"]["/v1/simulations"]["post"]["description"].split())
        example = spec["components"]["schemas"]["SimulationRequestV1"]["examples"][0]

        body = client.post("/v1/simulations", json=example).json()

        for named in (
            "`status.state`",
            "`status.code`",
            "`PATH_NOT_CONVERGED`",
            "`path_diagnostics.termination_reason`",
            "`iteration_limit`",
            "its 20 path smoothing iterations",
        ):
            assert named in description, f"the description no longer mentions {named}"
        assert body["status"]["state"] == "success"
        assert body["status"]["code"] == "PATH_NOT_CONVERGED"
        assert body["path_diagnostics"]["converged"] is False
        assert body["path_diagnostics"]["termination_reason"] == "iteration_limit"
        assert example["settings"]["path_smoothing_iterations"] == 20
        assert body["path_diagnostics"]["iterations"] == 20
        assert body["summary"] is not None
        assert len(body["samples"]) == example["settings"]["sample_count"]

    def test_the_width_rule_the_validation_description_states_has_no_kart_in_it(self) -> None:
        # The description once said the corridor had to fit the kart plus two
        # margins. The engine has no kart width, so the rule is pinned on both
        # sides of the threshold the description gives. 1 cm of margin either
        # way moves the limit 2 cm past the measured width, so a kart term of
        # 2 cm or more would already fail the request that is meant to fit.
        spec = client.get("/openapi.json").json()
        description = " ".join(spec["paths"]["/v1/tracks/validate"]["post"]["description"].split())
        example = spec["components"]["schemas"]["TrackValidationRequest"]["examples"][0]
        assert "no more than twice `safety_margin_m` plus 0.05 m" in description

        measured = client.post("/v1/tracks/validate", json=example).json()
        min_width_m = measured["metrics"]["min_width_m"]
        threshold_margin_m = (min_width_m - 0.05) / 2

        fits = client.post(
            "/v1/tracks/validate", json={**example, "safety_margin_m": threshold_margin_m - 0.01}
        ).json()
        too_wide = client.post(
            "/v1/tracks/validate", json={**example, "safety_margin_m": threshold_margin_m + 0.01}
        ).json()

        # The margin must not move the width it is compared with, or the
        # threshold computed above would be measuring a different corridor.
        assert fits["metrics"]["min_width_m"] == min_width_m
        assert fits["valid"] is True
        assert too_wide["valid"] is False
        assert [error["code"] for error in too_wide["errors"]] == ["INSUFFICIENT_USABLE_WIDTH"]

    def test_a_failing_track_is_a_200_and_a_rejected_request_a_422(self) -> None:
        spec = client.get("/openapi.json").json()
        validation_example = spec["components"]["schemas"]["TrackValidationRequest"]["examples"][0]
        simulation_example = spec["components"]["schemas"]["SimulationRequestV1"]["examples"][0]

        crossed = copy.deepcopy(validation_example["track"])
        edge = crossed["left_boundary"]
        edge[3], edge[9] = edge[9], edge[3]

        validation = client.post(
            "/v1/tracks/validate", json={**validation_example, "track": crossed}
        )
        assert validation.status_code == 200
        assert validation.json()["valid"] is False
        assert "SELF_INTERSECTION" in {error["code"] for error in validation.json()["errors"]}
        assert validation.json()["metrics"] is None

        simulation = client.post("/v1/simulations", json={**simulation_example, "track": crossed})
        assert simulation.status_code == 200
        assert simulation.json()["status"]["state"] == "invalid_input"
        assert simulation.json()["summary"] is None
        assert simulation.json()["samples"] == []

        # Below four points the schema answers before the engine is asked.
        short = copy.deepcopy(validation_example["track"])
        short["left_boundary"] = short["left_boundary"][:3]
        rejected = client.post("/v1/tracks/validate", json={**validation_example, "track": short})
        assert rejected.status_code == 422
        assert rejected.json()["detail"][0]["loc"] == ["body", "track", "left_boundary"]
