# Roadmap

The roadmap is ordered by risk reduction, not by visual impact. Each milestone must leave a demonstrable and tested artifact.

## Delivery status

OpenKartLine currently provides a **runnable MVP preview**: a first vertical slice for contributors and early experimentation. “Runnable” does not mean that every MVP acceptance criterion or physical-validation target is complete.

| Capability | Delivered now | Planned or incomplete |
|---|---|---|
| Track editing | Interactive 2D centerline editing, width, pan/zoom, undo/redo, and a synthetic starting circuit | Independent left/right boundary authoring, scale calibration, imagery and geographic import, full geometry diagnostics |
| Simulation | Deterministic point-mass speed profile and minimum-bending line in the Python engine, plus a parity-tested TypeScript port for the browser | Validated minimum-curvature optimization, joint minimum-time control, advanced kart dynamics |
| Guidance | Line colored by brake/coast/throttle, lap metrics, markers, synchronized inspection, and explicit warnings | Confidence/sensitivity analysis, richer marker derivation, telemetry comparison |
| Files and API | Versioned preview project model, local import/export, validation/simulation API, structured solver states | Stable schema commitment, migrations, durable job supervisor, large attachments |
| Quality and operations | Local test/lint/build commands, cross-platform CI definitions, security/dependency/docs checks, release and community policies | First hosted CI matrix result, published validation report, signed release artifacts and installers |

Current milestone state:

- **M0 — Done:** locked foundation, strict API contracts, analytic fixtures, and a hosted three-platform CI matrix are all in place and green.
- **M1 — Partial:** the editor ships a centerline-plus-width workflow with a hand-rolled SVG transform (the React Konva prototype was decided against); the two-boundary workflow and imagery/GPS imports remain open.
- **M2 — Done:** the minimum-bending baseline and point-mass speed profile ship in the Python engine and in a parity-tested TypeScript port for the browser; the OSQP QP variant was deliberately replaced by the in-repo projected-gradient optimizer (see #10).
- **M3 — Partial:** the viewer communicates line, controls, markers, metrics, and synchronized playback; turn-in/full-throttle markers, confidence states, and CSV/image export remain open.
- **M4–M6 — Planned:** advanced optimization, telemetry calibration, and public distribution have not been delivered.

Roadmap issues remain open until their exit criteria are demonstrated. The changelog and tagged releases, not this plan alone, are the record of shipped behavior.

## M0 — Reproducible foundation

**Status:** Done; the hosted three-platform CI matrix, schema round-trips, and analytic fixtures all pass on `main`.

Goal: a contributor can clone the repository and reproduce the same tests on Windows, macOS, and Linux.

- Scaffold Python and TypeScript workspaces.
- Pin supported runtime ranges and lock dependencies.
- Define JSON Schema and generated Python/TypeScript representations.
- Establish units, coordinate conventions, error types, logging, and solver-result states.
- Add lint, unit-test, schema, license, and dependency-review CI.
- Add a synthetic circle and oval fixture with documented provenance.

Exit criteria:

- One documented setup path works in a clean three-platform CI matrix.
- Schema round-trip and analytic circle tests pass.
- No optional optimizer is required to work on documentation or the web editor.

## M1 — Track editor alpha

**Status:** Partial in the runnable preview.

Goal: author and validate a metric 2D track without editing files manually.

- Canvas pan, zoom, image import, and scale calibration.
- Draw/edit left and right boundaries with undo/redo.
- Direction and start/finish controls.
- Periodic smoothing and arc-length resampling preview.
- Geometry diagnostics and `.okl.json` import/export.

Exit criteria:

- A user can recreate a supplied synthetic track and export/reopen it without metric drift.
- Invalid crossed boundaries are rejected with a visible explanation.

## M2 — Geometry and speed-profile MVP

**Status:** Done; the minimum-bending line and iterative speed profile ship in both engines, with the browser port held to roundoff-level parity by committed fixtures. The shortest-path baseline exists implicitly as the zero-margin corridor edge, and the planned OSQP minimum-curvature QP was replaced by the in-repo projected-gradient optimizer.

Goal: produce the first useful and independently testable lap plan.

- Centerline, shortest-path, and minimum-curvature baselines.
- Basic and measured point-mass kart profiles.
- Curvature speed ceiling and forward/backward acceleration/braking pass.
- Combined longitudinal/lateral friction constraint.
- Lap time, speed, acceleration, throttle/brake state, and boundary margins.

Exit criteria:

- Analytic circle and straight cases meet documented tolerances.
- Changes in mass, grip, braking, and acceleration have expected effects.
- A failed solve never produces a successful-looking result.

## M3 — Explainable lap viewer

**Status:** Partial in the runnable preview.

Goal: turn arrays into practical driving guidance.

- Color-coded racing line.
- Synchronized animation and distance charts.
- Brake start, turn-in, apex, throttle start, and full-throttle markers.
- Assumption, confidence, and solver-diagnostics panel.
- CSV and image export.

Exit criteria:

- Selecting any point highlights the same distance on map and plots.
- Markers are derived reproducibly from channels and include a confidence state.

## M4 — Joint minimum-time optimization

**Status:** Planned.

Goal: optimize path and controls together.

- CasADi/IPOPT optional dependency and backend adapter.
- Direct transcription/collocation formulation.
- Warm start from M2.
- Bounds, periodicity, cancellation, time limit, and diagnostics.
- Comparison view: minimum curvature versus minimum time.

Exit criteria:

- Three-platform solver smoke test or a clearly documented supported-platform subset.
- Feasible minimum-time result is no slower than its warm-start baseline within tolerance.
- Infeasible, timeout, and numerical-failure states have fixtures.

## M5 — Telemetry and calibration

**Status:** Planned.

Goal: replace weak presets with measured kart behavior.

- GPX/CSV adapter interface and initial importers.
- Lap segmentation, map matching, resampling, and quality report.
- Estimate acceleration, braking, and lateral-grip envelopes.
- Training/validation split and calibration comparison.
- Actual-versus-simulated map and channel view.

Exit criteria:

- Calibrated parameters improve held-out speed-profile error on a redistributable dataset.
- Low-quality data is rejected or clearly down-weighted.

## M6 — Public beta and distribution

**Status:** Planned.

Goal: a non-developer can install and use the application.

- Guided onboarding and kart presets.
- Optional Docker distribution.
- Automated release artifacts and signed checksums.
- Accessibility, translation, privacy, security, and license review.
- Documentation site and example project gallery.
- Evaluate Tauri sidecar packaging with measured maintenance cost.

Exit criteria:

- Fresh-user installation test on all advertised platforms.
- Project file compatibility policy and recovery flow proven.
- Published validation report and known-limitations page.

## After v1

- Surface friction maps, wet conditions, elevation, and banking.
- Advanced transient kart model or Fastest-lap adapter.
- Multi-start and higher-performance acados/C++ backends.
- Public track sharing with explicit data licensing.
- Mobile companion and telemetry capture research.
- Race, defensive, and overtaking lines after single-kart safety and validation mature.

## First contribution-sized tasks

- Add independent left/right boundary editing and scale calibration.
- Add a schema-diff compatibility gate and reversible migration fixture.
- Benchmark the SVG editor at its declared point limit and compare a Canvas prototype only if needed.
- Add richer, confidence-aware reference grouping without hiding raw channels.
- Research redistributable kart telemetry datasets and record provenance before importing any data.
- Publish a reproducible numerical-validation report for the alpha model.
