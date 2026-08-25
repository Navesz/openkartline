# Validation report — v0.1.0 alpha

Date: 2026-08-07

This report records software and synthetic numerical evidence for the first runnable alpha. It is not evidence of real-world kart accuracy. Hosted CI badges and workflow runs remain the authoritative platform record for the tagged revision.

## Scope

- React/TypeScript editor, project import/export, visualization, and browser fallback.
- FastAPI contract, request limits, geometry validation, and structured failure states.
- Periodic geometry preparation, constrained minimum-bending baseline, and cyclic point-mass speed profile.
- Documentation, shared project schema, supply-chain configuration, and release/community files.

## Local verification

The numerical tables below are regenerated from the current engine, so this
section is too. Re-measure both together, or the document describes two
revisions at once without saying so.

Last measured 2026-08-25 on Windows, Node.js 24.13.0, pnpm 11.16.0, uv 0.11.31,
Python 3.12.10. Independent engine runs also exercised Python 3.11 and 3.13.

| Gate | Result |
|---|---|
| Python tests | 104 passed, 1 xfailed |
| Python coverage | 93.69% statements/branches combined; 92% gate satisfied |
| Python lint/types | Ruff format/lint and strict mypy passed |
| Python packaging | source distribution and universal wheel built |
| Web tests | 1106 passed, 1 skipped across 29 files |
| Web coverage | 91.61% statements, 83.64% branches; 90/82 gates satisfied |
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

Regenerate every table in this section with `uv run python scripts/validation_numbers.py`.
Figures quoted to twelve decimal places go stale the moment the engine changes,
and a report publishing numbers the code no longer produces is worse than one
publishing none. The script is what produced what follows.

For the committed circle fixture (12 controls) with 40 path iterations:

| Samples | Estimated lap time | Termination |
|---:|---:|---|
| 64 | 9.267674719504 s | `iteration_limit` |
| 128 | 9.286661970439 s | `iteration_limit` |
| 256 | 9.290100962770 s | `no_progress` |

Relative spread: **0.2416236%**. This regression protects against the earlier polygon-corner behavior in which adding samples could incorrectly make the same circuit much slower.

A circle is a weak fixture for this property: discretization error and path-solver
behavior are both curvature driven, so a near-analytic shape cannot expose a
regression that only appears once a circuit has corners. On the synthetic
serpentine fixture (`r = 50 + 14 sin 5θ`, 8 m corridor) the same measurement gave:

| Samples | Lap time | Path length | Termination |
|---:|---:|---:|---|
| 300 | 36.830 s | 423.42 m | `iteration_limit` |
| 600 | 38.087 s | 428.24 m | `iteration_limit` |
| 1200 | 38.344 s | 429.39 m | `iteration_limit` |
| 2400 | 37.237 s | 419.52 m | `iteration_limit` |

Relative lap-time spread: **4.0%**. Path-length spread: **2.32%**.

These numbers replace an earlier table that reported 1.8% and 0.07% after the
gradient preconditioner was given a width fixed in arc length rather than in
samples. That fix stands; the figures moved because the corridor is now
measured across the centreline normal rather than between independently
resampled boundary samples, and this fixture offsets its boundaries *radially*.
Its true width therefore varies between 4.55 m and 8.00 m along the lap, where
the old measurement reported roughly 8 m everywhere.

The narrower, genuinely varying corridor is the correct one, and it is harder:
the projected-gradient search settles into a different local minimum at each
resolution, which is the 4.0% above. That is tracked as a solver defect in
[issue #45](https://github.com/Navesz/openkartline/issues/45), with a
`xfail(strict=True)` regression in `tests/python/test_simulation.py` that turns
red again the moment it is fixed. On the five shipped circuits — all true
constant-width corridors — the same change *improved* stability, most visibly
on Circuito Aurora, from 5.98% to 1.95%.

### Start-index stability

A closed track is a cycle, so which boundary point is listed first is a
labelling choice and nothing more: the polygon, its winding and its geometry
are identical whichever index is called zero. A converged solver would return
the same lap.

This one does not. Rotating the boundary lists and re-solving moves the lap
time:

| Track | Points | Start indices tried | Lap-time spread |
|---|---:|---:|---:|
| Circle fixture | 12 | 4 | **0** |
| Kartódromo de Baltar | 200 | 5 | 0.53% |
| Castelo Branco | 200 | 5 | 0.81% |
| Adria Karting Raceway | 200 | 5 | 0.92% (674 ms of a 73.8 s lap) |
| Serpentine fixture | 400 | 12 | **6.31%** |

The circle is unmoved because every shift of a uniformly sampled circle is an
exact symmetry of it, which isolates the effect to the shape rather than to the
mechanism.

The cause is the path solver, not the geometry: track length survives the same
rotation to a relative 2e-3, while `minimum_bending_path` reports
`iteration_limit` on every shipped circuit at every allowed value of
`path_smoothing_iterations` — 0, 20, 60 and 200 were measured, and raising it
does not converge, it only moves where the solver stops. A solve that has not
converged depends on the parameterisation it started from, and the lap time
inherits that dependence.

This is larger than the sample-count spread above, and it is the more
uncomfortable of the two: a user who exports the same circuit from a tool that
happens to start the point list elsewhere gets a different answer for the same
track. `tests/python/test_simulation.py::TestStartIndexSensitivity` pins these
as ceilings, so the number cannot grow quietly. It is characterised rather than
suppressed: fixing the anchor would make the figure stable without making it
right, and the honest fix is a solver that converges.

### Path-solver termination

On the same serpentine fixture the projected-gradient line search previously
rejected every candidate step after 7–23 iterations and reported `no_progress`,
so `path_smoothing_iterations` had no observable effect between 20 and 200. The
preconditioned direction is now restricted to the free set before the corridor
bounds are applied, with the unsmoothed gradient as a fallback.

`no_progress` remains reachable, and remains a failure. An attempt to report it
as convergence instead was reverted; it rested on the claim that exhausting the
line search means the smallest displacement offered was `0.08 · 2^-16`, already
an order of magnitude below the 1e-5 step tolerance the same function trusts.
That is off by one — the step is halved *after* each try, so sixteen tries
reach `2^-15` — and the factor is not the point: a descent step can still exist
at the next halving, so an exhausted line search is not evidence that none
exists. Reporting convergence there would have claimed a criterion the solver
had not reached.

The annulus case that motivated the attempt is real. Sitting on the exact
analytic optimum the solver reports `no_progress` while the returned radius
matches the closed-form answer to 2e-4 m. But that is a stalled line search at a
point which happens to be optimal, and the solver cannot tell it apart from a
stalled line search anywhere else. The status it reports is the one it can
justify; a caller wanting the stronger claim should check the residual.

### Geometry preparation cost

Boundary self-intersection and corridor-crossing checks used exhaustive pairwise
testing and dominated the request. Replacing the broad phase with an x-interval
sweep — the exact narrow-phase predicate is unchanged — gave, on the serpentine
fixture (Apple Silicon, Python 3.12.13):

| Samples | Before | After |
|---:|---:|---:|
| 2000 | 648 ms | 428 ms |
| 4000 | 1018 ms | 501 ms |

`prepare_track` remains the dominant cost of a simulation request.

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
