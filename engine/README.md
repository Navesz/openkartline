# Engine

`openkartline_engine` is the framework-independent numerical core. It can be imported
without FastAPI or the web client and uses strict, versioned Pydantic contracts.

```python
from openkartline_engine import SimulationRequestV1, simulate

request = SimulationRequestV1.model_validate(payload)
result = simulate(request)
```

## MVP pipeline

1. Clean and validate two closed track-boundary loops.
2. Normalize travel direction, align both boundaries, interpolate each with a periodic
   C2 cubic spline, and resample at equal arc-length intervals.
3. Optimize a station-wise lateral offset inside the safety margins, minimizing a
   discrete approximation of integrated squared curvature.
4. Calculate path station, heading, and signed curvature.
5. Apply the lateral-grip speed ceiling, then cyclic forward acceleration and backward
   braking passes with a configurable friction envelope.
6. Derive throttle, brake, friction-use channels and explanatory driving markers.

The path optimizer is intentionally named `minimum_bending_v1`: it is deterministic,
constrained, dependency-light, and useful as a baseline, but it is neither a proof of
global minimum curvature nor a minimum-time trajectory. Its initial/final objective,
iterations, convergence state, and corridor use are included in every successful
result.

Boundary names are interpreted from the driver's direction of travel: the left edge
must remain on the driver's left after orientation normalization. Each submitted edge
is capped at 2,000 points and every raw segment is checked for intersections; validation
never downsamples a drawing before deciding whether it is safe. Interpolated boundaries
are checked again because a smooth spline can cross where its control polygon does not.
Local coordinates are bounded to +/-1,000 km and a single track may span at most 100 km
per axis, preventing accidental geographic coordinates or pathological numeric scales.

The point-mass model assumes flat terrain and spatially uniform grip. Acceleration is
limited by the declared traction cap, usable mechanical power, and top-speed taper.
Braking and acceleration share grip with lateral acceleration through the configured
friction exponent. The engine and tire acceleration envelopes are intersected by taking
their tighter limit; they are not multiplied. Horsepower alone is therefore not treated
as sufficient input. Lap time is the trapezoidal integral over the exact nodal speeds
returned in `samples`, so callers can reproduce it from the path and speed channels.

## Failure model

Geometric input problems return `invalid_input` plus field-oriented validation issues.
Expected numeric failures return `numerical_failure`. Both use the same result model as
a successful simulation and leave numeric channels empty, so callers never need to
parse an exception string as a result.

A feasible result can still report `status.code = "PATH_NOT_CONVERGED"`. In that case
the speed profile converged, but path smoothing was skipped, stalled, or reached its
configured iteration limit. `path_diagnostics.termination_reason` and `warnings` state
which condition occurred instead of presenting the baseline as an optimizer success.

## Verify

From the repository root:

```shell
uv sync --locked --all-extras --dev
uv run ruff format --check engine services/api tests/python
uv run ruff check engine services/api tests/python
uv run mypy engine services/api
uv run pytest
```
