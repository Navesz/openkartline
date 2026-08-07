# ADR 0002: Physics-first optimization before machine learning

- Status: Accepted
- Date: 2026-08-06

## Context

The application must explain braking, cornering, and throttle recommendations with little initial data. A learned model would require a representative licensed dataset and could hide invalid behavior outside its training distribution.

## Decision

Build deterministic geometry and point-mass physics baselines first. Add nonlinear optimal control after validation. Use data-driven methods later for parameter estimation, uncertainty, or initial guesses while retaining physical constraints.

## Consequences

- Early results are inspectable and have analytic tests.
- The product can work without a shared telemetry dataset.
- Initial fidelity is intentionally limited and must be communicated.
- Machine-learning contributions require comparison against deterministic baselines and held-out data.
