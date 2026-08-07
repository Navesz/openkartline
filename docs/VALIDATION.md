# Validation strategy

OpenKartLine separates software correctness, numerical correctness, and real-world correlation. Passing one does not prove the others.

## Evidence in the runnable alpha

The repository currently gates strict Python types/lint/coverage, TypeScript types/lint/formatting, web unit tests, a Playwright smoke test, production builds, analytic/synthetic geometry and physics regressions, API contracts, schema examples, documentation links, dependency changes, and CodeQL. Hosted operating-system results become release evidence only after the pull request runs.

No real telemetry-validation dataset has been published. The UI and documentation therefore call current results estimates, never universally accurate predictions.

The exact alpha commands, counts, bundle sizes, and sample-invariance measurement are recorded in [VALIDATION_REPORT.md](VALIDATION_REPORT.md).

## Test layers

### Geometry

- Circle and constant-width oval with analytic curvature.
- Closed spline continuity at the start line.
- Clockwise/counter-clockwise equivalence.
- Translation, rotation, and resampling invariance.
- Rejection of crossed boundaries, duplicate points, and negative width.

### Point-mass physics

- Constant-radius speed ceiling against `sqrt(a_y_max / |kappa|)`.
- Straight-line acceleration and braking against analytic constant-acceleration cases.
- Energy and dimensional consistency checks.
- Monotonic response to mass, grip, braking, and acceleration changes where theory predicts it.

### Optimization

- Track constraints satisfied within declared tolerance.
- Periodic lap boundary conditions.
- Result no worse than its supplied feasible baseline within tolerance.
- Repeatability with pinned settings.
- Explicit fixtures for infeasible problems and timeouts.

### API and UI targets

- Schema compatibility and migration tests.
- Cancellation and process-crash recovery for the future worker architecture.
- Editor undo/redo and metric coordinate preservation.
- Visual regression for line, markers, and charts.

## Real telemetry protocol

1. Obtain permission and document the logger, kart, circuit, weather, tires, and driver.
2. Reject laps with missing samples or obvious GPS jumps.
3. Align laps without using the evaluation lap to fit alignment-specific parameters.
4. Fit parameters on a training subset.
5. Evaluate held-out laps.
6. Report speed RMSE, sector/lap-time error, marker-distance error, and uncertainty.
7. Publish anonymized/synthetic data only when redistribution rights are explicit.

## Accuracy language

Until a model has repeated validation across different tracks and karts, the project reports correlation results, not a universal accuracy percentage. UI labels distinguish:

- unvalidated estimate;
- synthetic-test validated;
- telemetry calibrated;
- telemetry validated on held-out laps.

## Performance budgets

Initial targets, subject to measurement:

- Editor interactions remain responsive at 60 Hz on a typical laptop.
- Geometry validation returns interactively for normal tracks.
- P1 speed profile completes in a few seconds.
- P2 optimization supports progress, cancellation, and a configurable time limit rather than promising a fixed runtime.
