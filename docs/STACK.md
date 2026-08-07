# Stack review and decisions

## Recommended MVP stack

| Area | Choice | Why it fits | Main risk and mitigation |
|---|---|---|---|
| Web UI | React + TypeScript + Vite | Large contributor pool, typed state, simple static build | Keep domain logic outside React components. |
| 2D editor | React Konva | Canvas interaction, layers, images, drag, zoom, and export | Canvas is not the canonical data model; store metric geometry separately. |
| Charts | Apache ECharts | Linked plots and large numeric series | Wrap it behind project-owned components. |
| API | FastAPI + Pydantic | Typed Python boundary and generated OpenAPI | Keep it thin; physics cannot depend on HTTP. |
| Geometry | NumPy + SciPy + Shapely | Mature numerical and planar geometry tools | Define tolerance, orientation, and coordinate conventions centrally. |
| Baseline QP | OSQP | Convex quadratic solver, warm starts, infeasibility detection, Apache-2.0 | Minimum-time dynamics are nonlinear; use only for suitable baselines. |
| Optimal control | CasADi + IPOPT | Symbolic derivatives and nonlinear optimal-control formulation | Optional dependency; pin tested wheels and expose solver diagnostics. |
| Heavy jobs | Local process pool/subprocess | Isolates CPU/native solver work from the web API | Define cancellation and cleanup before adding concurrency. |
| Python tooling | uv, Ruff, mypy, pytest | Reproducible lockfile and cross-platform developer workflow | Pin a tested Python compatibility range. |
| JS tooling | pnpm, ESLint, Prettier, Vitest, Playwright | Efficient monorepo and browser testing | Keep one lockfile and avoid unnecessary workspace packages. |
| Storage | Versioned `.okl.json` project files | Local-first, portable, inspectable, no account or database | Use JSON Schema, migrations, checksums for attachments, and size limits. |
| Packaging | Local web app + Docker after M1 | Lowest native packaging risk and works on all major desktops | Docker is optional for users; native installers come later. |

## Important corrections to the initial proposal

### No mandatory SQLite in the MVP

A database adds migrations, backup behavior, and hidden state without helping the first single-user workflow. The source of truth will be a portable project file. SQLite may later index recent local projects or support a hosted service, but it must not own the only copy.

### Do not run optimization in FastAPI `BackgroundTasks`

Lap optimization is CPU-heavy and may execute native code for seconds or minutes. The local API submits a job to a separate process and exposes status, progress, cancellation, and result endpoints. A distributed queue such as Celery/Redis is justified only for a hosted multi-user deployment.

### Tauri is deferred

Tauri supports bundling a Python service as an external sidecar, but every supported OS and CPU architecture needs a matching binary. CasADi/IPOPT make those release artifacts more demanding. First make the browser-served local application reliable; add Tauri only after automated Windows, macOS, and Linux packaging is proven.

### C++ and acados are performance options, not the starting point

Python is fast enough to coordinate vectorized numeric libraries and native solvers, while allowing rapid model iteration. All solver backends will implement a narrow interface so a C++/Fastest-lap or acados backend can be added after profiling without changing the UI or file format.

### No machine learning in the first solver

The deterministic model provides testable ground truth, explicit constraints, and understandable failure states. Data-driven methods can later estimate parameters, provide initial guesses, or rank confidence; they do not replace physical constraints.

## What may fail if ignored

| Risk | Consequence | Planned control |
|---|---|---|
| Track supplied as only a centerline | Optimizer has no valid corridor in which to choose a line | Require two boundaries or centerline plus measured widths. |
| Horsepower treated as a complete kart model | Unrealistic braking and corner speeds | Guided presets plus measured acceleration, braking, and lateral grip. |
| Pixel coordinates reach the engine | Results change with image resolution | Convert once into a metric, right-handed local frame. |
| Solver returns a local optimum | Plausible but inferior line | Deterministic baselines, multiple initial guesses later, and diagnostics. |
| No telemetry alignment/versioning | Calibration overfits bad data | Quality checks, held-out laps, and immutable calibration records. |
| Native dependencies are compiled by every beginner | Poor adoption, especially on Windows | Use tested wheels, containers, and CI artifacts before source builds. |
| A detailed model is introduced before validation | Complexity without trustworthy accuracy | Model ladder with acceptance tests at every stage. |
| External track or imagery is committed casually | Copyright/privacy problems | Synthetic fixtures and documented redistribution rights. |

## Deferred alternatives

- **SVG editor:** attractive for simple vectors, but Canvas is preferable for dense imagery and interaction. Exported geometry remains independent so this can change.
- **Electron:** easier JavaScript packaging but larger distribution; not needed yet.
- **Pyodide/WebAssembly:** a browser-only engine would be excellent long-term, but the native optimization stack needs a dedicated feasibility project.
- **PostgreSQL/Supabase:** relevant only for accounts, public track sharing, or hosted jobs.
- **Redis/Celery:** relevant only when job execution spans processes or servers beyond the local application.

## Compatibility gate for M0

Before implementation is merged, CI must install the chosen locked versions on current Windows, Ubuntu, and macOS runners. CasADi is optional until a three-platform solver smoke test passes.

## Primary references

- [React Konva documentation](https://konvajs.org/docs/react/)
- [FastAPI documentation](https://fastapi.tiangolo.com/)
- [FastAPI guidance for heavy background computation](https://fastapi.tiangolo.com/tutorial/background-tasks/#caveat)
- [CasADi documentation and binary downloads](https://web.casadi.org/get/)
- [OSQP documentation](https://osqp.org/docs/)
- [Tauri sidecar documentation](https://v2.tauri.app/develop/sidecar/)
- [Fastest-lap](https://github.com/juanmanzanero/fastest-lap)
- [TUMFTM global racetrajectory optimization](https://github.com/TUMFTM/global_racetrajectory_optimization)
