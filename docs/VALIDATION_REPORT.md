# Validation report — v0.1.0 alpha

Date: 2026-08-07

This report records software and synthetic numerical evidence for the first runnable alpha. It is not evidence of real-world kart accuracy. Hosted CI badges and workflow runs remain the authoritative platform record for the tagged revision.

## Scope

- React/TypeScript editor, project import/export, visualization, and browser fallback.
- FastAPI contract, request limits, geometry validation, and structured failure states.
- Periodic geometry preparation, constrained minimum-bending baseline, and cyclic point-mass speed profile.
- Documentation, shared project schema, supply-chain configuration, and release/community files.

## Local verification

Local environment: Windows, Node.js 24.13.0, pnpm 11.16.0, uv 0.11.31, Python 3.12.10. Independent engine runs also exercised Python 3.11 and 3.13 before the final consolidated run.

| Gate | Result |
|---|---|
| Python tests | 41 passed |
| Python coverage | 91.81% statements/branches combined; 85% gate satisfied |
| Python lint/types | Ruff format/lint and strict mypy passed |
| Python packaging | source distribution and universal wheel built |
| Web tests | 25 passed across 10 files |
| Web quality | Prettier, ESLint, TypeScript, and production build passed |
| Browser E2E | fallback-only and real Python API flows passed in Chromium |
| Static web bundle | 250.35 kB JavaScript / 78.20 kB gzip; 18.28 kB CSS / 5.04 kB gzip |
| Project contract | JSON meta-schema and synthetic `.okl.json` example passed |
| Documentation | 35 Markdown files passed markdownlint; CFF 1.2 metadata passed |
| Workflow security | all actions pinned by SHA; strict Zizmor audit reported no findings |
| Dependency audit | no known pnpm production or Python environment vulnerabilities after lock update |

Expected non-blocking warning: Starlette's test client recommends the future `httpx2` package. It does not affect the running API or current test result.

## Numerical regression evidence

### Sample-count stability

For the same synthetic circle with 32 controls and 40 path iterations:

| Samples | Estimated lap time |
|---:|---:|
| 64 | 9.245119865224 s |
| 128 | 9.250472792664 s |
| 256 | 9.250471014721 s |

Relative spread: **0.0578777%**. All runs terminated by `step_tolerance`. This regression protects against the earlier polygon-corner behavior in which adding samples could incorrectly make the same circuit much slower.

### Covered failure/correctness cases

- periodic C2 continuity, analytic circle curvature, seam behavior, and sample invariance;
- raw self-intersection hidden inside a 1,200-point boundary;
- clockwise/counter-clockwise travel-left and travel-right semantics;
- finite coordinate and total-track-span limits;
- exact trapezoidal lap-time reconstruction from returned samples;
- intersection of engine power and tire-friction limits;
- disabled, converged, no-progress, and iteration-limit path diagnostics;
- invalid geometry, oversized HTTP request (413), and saturated local computation slots (429);
- project byte/point/numeric limits, incompatible constants, and inconsistent derived mass;
- browser fallback isolation and live browser-to-FastAPI integration.

## What this does not prove

- No real kart/track telemetry correlation has been published.
- The minimum-bending path is local and is not a global minimum-time solution.
- Flat, dry, uniform grip and quasi-steady point-mass assumptions remain material.
- The browser fallback is intentionally simpler than the Python engine.
- Predicted braking, apex, and acceleration references are planning estimates, not safety instructions.

The next accuracy claim requires a redistributable telemetry protocol, held-out laps, error metrics, and a published comparison as defined in [VALIDATION.md](VALIDATION.md).
