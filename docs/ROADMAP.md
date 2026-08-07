# Roadmap

The roadmap is ordered by risk reduction, not by visual impact. Each milestone must leave a demonstrable and tested artifact.

## M0 — Reproducible foundation

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

- Specify the circle and oval fixture format.
- Prototype boundary self-intersection diagnostics.
- Benchmark Canvas editing with 1,000–10,000 points.
- Research redistributable kart telemetry datasets.
- Write the point-mass dimensional-analysis test table.
- Design the solver failure/result taxonomy.
