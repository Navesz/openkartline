# Local API

The local FastAPI service is a thin, versioned boundary around the framework-independent
Python engine. The MVP exposes one bounded synchronous solver; future nonlinear or
long-running solvers will use a separate worker instead of a request process.

## Run locally

From the repository root:

```shell
uv sync --locked --all-extras --dev
uv run openkartline-api
```

The API listens on `http://127.0.0.1:8000`. Interactive OpenAPI documentation is at
`/docs`, and the machine-readable OpenAPI 3 contract is at `/openapi.json`.

## Endpoints

- `GET /health` reports service, engine, and schema versions.
- `POST /v1/tracks/validate` checks a closed track and reports actionable issues.
- `POST /v1/simulations` synchronously computes the MVP baseline and speed profile.

The development CORS policy permits HTTP(S) origins on `localhost` and `127.0.0.1`,
including Vite's usual ports. It does not enable credentialed cross-origin requests.
Request bodies are capped at 2 MiB, including streamed bodies without a declared
`Content-Length`; oversized requests receive HTTP 413. At most two validation or
simulation computations run concurrently in the process. Additional work receives
HTTP 429 and can be retried after a slot becomes available. This semaphore is a local
memory/CPU guard, not a durable queue or hosted worker.

All coordinates and physical quantities use SI units except `power_hp`, which uses
mechanical horsepower for karting familiarity and is converted to watts internally.
The track is a pair of closed, non-intersecting boundary loops. Boundary points use
objects such as `{"x_m": 10.0, "y_m": 4.0}`; a repeated final closure point is optional.

Invalid Pydantic request shapes receive standard HTTP 422 errors. Validly shaped but
geometrically invalid simulations receive HTTP 200 with
`status.state = "invalid_input"`, validation details, and empty numeric channels.
Numerical solver failures similarly use `status.state = "numerical_failure"`. This
keeps every accepted simulation request machine-readable through one result schema.

Successful results include `path_diagnostics` for the projected minimum-bending
baseline. Its objective is the discrete integral of squared curvature. The reported
initial/final values, convergence flag, iteration count, and corridor-fraction range
make optimization behaviour inspectable instead of hiding it behind a line graphic.
The `termination_reason` distinguishes a converged gradient/step tolerance from skipped,
stalled, and iteration-limited path optimization.

## Scope and safety

The synchronous endpoint is capped at 4,000 samples, 200 projected path-optimization
iterations, 2 MiB per request, and two in-process computations. It does not perform
nonlinear minimum-time optimization. Results assume a flat, dry, uniform-grip track and
are planning aids, not safety instructions or guarantees.
