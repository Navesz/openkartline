"""Versioned bounded local MVP API.

The solver is framework-independent in ``openkartline_engine``. This boundary is
request/response oriented for the bounded MVP baseline (at most 4,000 samples and
200 smoothing passes). CPU work runs in a limited thread pool; nonlinear minimum-time
optimization belongs in a future durable worker.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import partial
from threading import BoundedSemaphore
from typing import Literal, TypeVar

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from openkartline_engine.geometry import prepare_track
from openkartline_engine.schemas import (
    ENGINE_VERSION,
    SCHEMA_VERSION,
    SimulationRequestV1,
    SimulationResultV1,
    StrictModel,
    TrackValidationRequest,
    TrackValidationResult,
)
from openkartline_engine.simulation import simulate

MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
MAX_CONCURRENT_COMPUTATIONS = 2
_COMPUTE_SLOTS = BoundedSemaphore(MAX_CONCURRENT_COMPUTATIONS)
_ResultT = TypeVar("_ResultT")


class RequestBodyLimitMiddleware:
    """Bound local request memory, including requests without Content-Length."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        declared = headers.get(b"content-length")
        if declared is not None:
            try:
                declared_size = int(declared)
                if declared_size < 0:
                    raise ValueError
                if declared_size > self.max_bytes:
                    await self._reject(scope, receive, send)
                    return
            except ValueError:
                await self._reject(scope, receive, send, detail="Invalid Content-Length header.")
                return

        messages: list[Message] = []
        total = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.disconnect":
                await self.app(scope, self._replay(messages), send)
                return
            total += len(message.get("body", b""))
            if total > self.max_bytes:
                await self._reject(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        await self.app(scope, self._replay(messages), send)

    @staticmethod
    def _replay(messages: list[Message]) -> Receive:
        async def receive() -> Message:
            if messages:
                return messages.pop(0)
            return {"type": "http.disconnect"}

        return receive

    @staticmethod
    async def _reject(
        scope: Scope,
        receive: Receive,
        send: Send,
        *,
        detail: str = "Request body exceeds the 2 MiB local API limit.",
    ) -> None:
        response = JSONResponse({"detail": detail}, status_code=413)
        await response(scope, receive, send)


async def _run_bounded(function: Callable[[], _ResultT]) -> _ResultT:
    """Run bounded CPU work in-process; this is not a durable job worker."""

    if not _COMPUTE_SLOTS.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="Local solver is busy; retry after another computation finishes.",
        )
    try:
        return await run_in_threadpool(function)
    finally:
        _COMPUTE_SLOTS.release()


class HealthResponse(StrictModel):
    status: Literal["ok"] = "ok"
    service: Literal["openkartline-api"] = "openkartline-api"
    engine_version: str = Field(default=ENGINE_VERSION)
    schema_version: str = Field(default=SCHEMA_VERSION)


tags_metadata = [
    {"name": "system", "description": "Service readiness and contract version."},
    {"name": "tracks", "description": "Read-only geometry checks and normalized metrics."},
    {"name": "simulations", "description": "Bounded synchronous MVP simulation."},
]

app = FastAPI(
    title="OpenKartLine API",
    summary="Open kart racing-line and lap-planning engine",
    description=(
        "A deterministic, SI-unit API for validating closed kart tracks and computing "
        "a safe geometry baseline with a quasi-steady point-mass speed profile. "
        "Simulation output is advisory and must not replace track rules or driver judgment."
    ),
    version=ENGINE_VERSION,
    openapi_tags=tags_metadata,
    license_info={
        "name": "Apache License 2.0",
        "identifier": "Apache-2.0",
    },
)

app.add_middleware(RequestBodyLimitMiddleware, max_bytes=MAX_REQUEST_BODY_BYTES)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["system"],
    operation_id="getHealth",
    summary="Check API readiness",
)
def health() -> HealthResponse:
    """Report that the service is up and which contract version it speaks.

    No computation is performed, so this answers while the solver slots are
    busy. The editor polls it to decide between the API and its browser port.
    """

    return HealthResponse()


@app.post(
    "/v1/tracks/validate",
    response_model=TrackValidationResult,
    tags=["tracks"],
    operation_id="validateTrackV1",
    summary="Validate and measure a closed track corridor",
    responses={
        413: {"description": "Request body exceeds the local memory limit."},
        429: {"description": "The bounded local computation slots are busy."},
    },
)
async def validate_track(request: TrackValidationRequest) -> TrackValidationResult:
    """Measure a closed corridor and report whether it can be simulated.

    The corridor is given as two boundaries in the track-local metric frame,
    ordered along the direction of travel. Both are resampled to `sample_count`
    stations at equal arc length, and the width at each station is measured
    across the centreline normal rather than between same-index boundary
    samples, which a corner would skew.

    `valid` is false when an error would stop a simulation, and `errors` names
    each one by `code`. Among them are a boundary that crosses itself or the
    other, and a corridor whose narrowest measured width is no more than twice
    `safety_margin_m` plus 0.05 m (`INSUFFICIENT_USABLE_WIDTH`). Warnings do not
    block a run.

    The engine has no kart width, so that rule counts only the margins: a
    corridor narrower than a real kart passes when the margins are small
    enough. To count the kart, include half its width in `safety_margin_m`.

    A track that fails is still answered with HTTP 200 in this shape, with
    `metrics` null when it failed before its width was measured. A request the
    schema rejects never reaches these checks: a boundary with fewer than four
    points, or fewer than three distinct ones, is answered with HTTP 422 and a
    `detail` list instead.
    """

    outcome = await _run_bounded(
        partial(
            prepare_track,
            request.track,
            sample_count=request.sample_count,
            safety_margin_m=request.safety_margin_m,
        )
    )
    return outcome.validation


@app.post(
    "/v1/simulations",
    response_model=SimulationResultV1,
    tags=["simulations"],
    operation_id="createSimulationV1",
    summary="Compute a geometry baseline and cyclic speed profile",
    response_description="A structured success or solver failure using the same result contract.",
    responses={
        413: {"description": "Request body exceeds the local memory limit."},
        429: {"description": "The bounded local computation slots are busy."},
    },
)
async def create_simulation(request: SimulationRequestV1) -> SimulationResultV1:
    """Solve a racing line for the corridor and integrate a lap around it.

    Two stages. A minimum-bending line is fitted inside the corridor, held at
    each station at least `safety_margin_m` inside both edges of the width
    measured there; then a cyclic point-mass speed profile is integrated over
    it, bounded by grip, power, braking and drag.

    The engine has no kart width: the margin keeps the line itself off the
    edges. To keep a whole kart inside the corridor, add half its width to
    `safety_margin_m`, as the web editor does for its 1.4 m kart.

    An invalid track or a failed solve is still answered with HTTP 200 in this
    shape, so read the result in two steps. `status.state` says whether there
    is a lap: `success` carries `summary` and `samples`, while `invalid_input`
    (reasons in `validation.errors`) and `numerical_failure` carry neither.
    `success` means only that the speed profile converged; whether the line
    did is in `status.code`. It is `SPEED_PROFILE_CONVERGED` when the line met
    its convergence criterion and `PATH_NOT_CONVERGED` when it stopped short,
    with `path_diagnostics.termination_reason` saying why. That lap keeps its
    samples, so a caller can decide whether to trust it. The published example
    is one: its 20 path smoothing iterations end at `iteration_limit`.

    Determinism is part of the contract: identical input yields identical
    output, and the browser port in `apps/web/src/domain/` is held to the same
    numbers by committed fixtures.
    """

    result = await _run_bounded(partial(simulate, request))
    return result


def run() -> None:
    """Run the local development service installed by the project script."""

    uvicorn.run("openkartline_api.main:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":  # pragma: no cover - exercised through the console entry point
    run()
