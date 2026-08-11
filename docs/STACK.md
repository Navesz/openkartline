# Stack review and decisions

The alpha uses the smallest stack that can deliver a credible vertical slice. Packages considered for later milestones are not presented as installed dependencies.

## Shipped stack

| Area | Choice | Why it fits now | Deliberate limit |
|---|---|---|---|
| Web UI | React 19 + TypeScript + Vite | Familiar contributor workflow, typed state, fast static build | Domain geometry stays outside components. |
| 2D editor | Native SVG + pointer/keyboard events | Crisp vector rendering, accessible DOM, no canvas dependency | Benchmark before supporting very dense imported tracks. |
| Charts | Project-owned SVG | Synchronizes small alpha result arrays without another runtime dependency | Add a chart library only after measured interaction/performance need. |
| Browser mode | TypeScript port of the engine | Makes the static demo and offline exploration useful | Held to roundoff-level parity with the Python engine by committed fixtures. |
| Local API | FastAPI + Pydantic | Strict contracts, useful validation errors, generated OpenAPI | Synchronous solver is bounded and loopback-oriented. |
| Scientific core | Python + NumPy | Transparent vector math, easy analytic tests, cross-platform wheels | More advanced optimization remains optional. |
| Python tools | uv + Ruff + mypy + pytest | Locked environment, formatting, strict types, coverage | CI pins the uv action and binary version. |
| Web tools | pnpm + ESLint + Prettier + Vitest + Playwright | One lockfile and unit/browser gates | Avoid duplicate workspace tooling. |
| Storage | Versioned `.okl.json` files | Portable, inspectable, private by default | No accounts, database, or hidden server state. |
| Public demo | GitHub Pages | Free static distribution from the same reviewed source | Runs the ported TypeScript engine; scientific API is not hosted. |

## Decisions that removed unnecessary risk

### SVG instead of React Konva

The current editor needs hundreds, not tens of thousands, of points. Native SVG provides direct accessibility semantics and keeps the dependency graph smaller. Canvas/Konva remains an option only if profiling shows that SVG misses a documented performance budget.

### Project-owned plots instead of ECharts

The alpha visualizes a few synchronized channels with the same SVG coordinate system as the track. A general charting runtime would add weight before a proven need. ECharts can be introduced behind a component boundary if zooming, larger telemetry data, or richer accessibility justifies it.

### NumPy without SciPy, Shapely, or OSQP

The baseline can be implemented and analytically checked with NumPy. SciPy periodic splines, Shapely robust predicates, or OSQP convex programs may improve later models, but each addition must show a failing benchmark or correctness case that it resolves. This keeps first-time Windows installation simple.

### No database

Portable project files are the source of truth. SQLite may one day index local history, and PostgreSQL may support a hosted collaboration service, but neither belongs in the single-user alpha.

### Bounded synchronous API before a worker

The current deterministic solver is bounded and completes interactively. A process worker is mandatory before adding long nonlinear optimization, but implementing job recovery and cancellation now would create infrastructure with no current workload.

### No machine learning in the first solver

The deterministic physics model provides inspectable constraints and tests. Data-driven methods may later estimate parameters or uncertainty; they do not replace physical failure states.

## Future candidates and gates

| Candidate | Possible use | Gate before adoption |
|---|---|---|
| SciPy | Periodic interpolation and optimization utilities | Sample-invariance/accuracy improvement plus wheel matrix. |
| Shapely | Robust planar geometry predicates | Demonstrated correctness or performance gap in project-owned predicates. |
| OSQP | Convex path baseline | Explicit QP formulation, infeasibility fixtures, license/size review. |
| CasADi + IPOPT | Joint minimum-time optimal control | Optional install, diagnostics, cancellation, and supported-platform smoke tests. |
| Process worker | Long solver isolation | Defined job schema, timeout, cancellation, crash recovery, and load tests. |
| Tauri | Native desktop distribution | Reproducible signed sidecar builds on advertised systems. |
| C++/acados/Fastest-lap adapter | Measured performance bottleneck or advanced model | Narrow backend interface, benchmarks, independent validation, license review. |
| Pyodide/WASM | Python-equivalent browser solver | Bundle, startup, numerical-equivalence, and licensing study. |
| PostgreSQL/object storage | Hosted accounts and sharing | Privacy model, deletion/export, quotas, operations ownership. |

## Known stack risks

| Risk | Consequence | Current control |
|---|---|---|
| A centerline is mistaken for precise boundaries | False corridor confidence | UI labels uniform width; API uses explicit boundaries; independent sides remain roadmap work. |
| Horsepower is treated as a full kart model | Unrealistic braking/corner estimates | UI also requires mass, top speed, braking, and lateral grip and lists assumptions. |
| Pixels reach the engine | Resolution-dependent output | Canonical coordinates stay metric; rendering applies a reversible view transform. |
| A local optimum looks authoritative | Unsafe confidence | Solver/model version, diagnostics, limitations, and conservative language stay visible. |
| Browser fallback hides a domain error | Invalid guidance | Fallback is transport-only; scientific rejection remains an error. |
| Native dependencies block beginners | Poor adoption | Current runtime uses packages with standard wheels and no native solver build. |
| External track/telemetry enters casually | Copyright or privacy harm | Synthetic fixtures and documented provenance are required. |

## Runtime policy

Supported development targets are Node.js 24, pnpm 11, and Python 3.11–3.13. Lockfiles are committed. CI runs the Python suite on Ubuntu, Windows, and macOS, the web quality/build suite, browser smoke tests, documentation checks, dependency review, and CodeQL.
