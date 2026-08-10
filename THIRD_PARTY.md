# Third-party software, data, and research

This is the project's dependency and provenance policy, not legal advice. Lockfiles are the authoritative inventory of resolved packages; this document records high-impact decisions and boundaries.

## Current and planned technology

| Project | Status | Role and boundary |
|---|---|---|
| React, React DOM, Vite | Installed | Web interface and build system. Keep canonical geometry outside component state. |
| Lucide React | Installed | Interface icons; it does not define domain semantics. |
| FastAPI, Pydantic, Uvicorn | Installed | Local API and data contracts. The API remains thin; physics cannot depend on HTTP. |
| NumPy | Installed | Baseline numerical engine with centralized tolerances and coordinate conventions. |
| Konva / React Konva | Evaluated candidate | Dense Canvas interaction only if SVG misses a measured performance budget; metric geometry must remain canonical. |
| Apache ECharts | Evaluated candidate | Richer telemetry plots only if project-owned SVG no longer meets measured needs. |
| SciPy and Shapely | Evaluated candidate | Numerical and planar geometry tools, added only when an implemented feature needs them. |
| OSQP | Evaluated candidate | Convex geometric baselines, only where the formulation is a suitable convex quadratic program. |
| CasADi and IPOPT | Planned | Optional minimum-time backend after baseline validation; review binary and transitive distribution terms for every platform. |
| Fastest-lap | Reference | MIT-licensed research reference and possible adapter. Integration requires an ADR and independent validation; sample assets need their own provenance review. |
| TUMFTM global racetrajectory optimization | Reference | LGPL-3.0 algorithmic reference. Do not copy its implementation into the Apache-2.0 core without deliberate compatibility review. |
| acados | Reference | Possible high-performance backend, deferred until benchmarks justify native build and generated-code complexity. |
| Contributor Covenant 2.1 | Installed | `CODE_OF_CONDUCT.md` is a modified adaptation under CC BY 4.0; preserve attribution and its per-file license notice. |

The absence of a package from this summary does not imply it is unlicensed. Release reviews use generated dependency inventories and preserve required notices.

## Adding a software dependency

A pull request that adds or materially updates a dependency must record:

1. package name, source, pinned/resolved version, and purpose;
2. license and important transitive or binary components;
3. whether code runs at build time, in CI, or with user data;
4. supported-platform and packaging impact;
5. why the existing standard library or current dependencies are insufficient;
6. a removal or adapter strategy for high-impact solver dependencies.

Lockfiles must be regenerated with repository tooling. Dependency-review CI rejects newly introduced known high-severity vulnerabilities. A passing automated check does not replace license or architecture review.

## Data and imagery

Every committed track, telemetry recording, photograph, map, logo, or derived dataset needs a nearby provenance record containing its creator/source, license or written permission, permitted modifications, privacy review, and any required attribution. Synthetic fixtures should identify the generator and must not trace a real circuit closely enough to recreate restricted source material unintentionally.

Do not assume that public availability, a screenshot, satellite imagery access, race participation, or personal GPS recording grants redistribution rights. Remove precise timestamps and personal identifiers from approved telemetry unless they are essential to a documented research purpose.

## Committed data assets

| Asset | Source | License | Obligation |
|---|---|---|---|
| `examples/tracks/volta-redonda.okl.json` | OSM way/712502411 | ODbL 1.0 | Attribution and share-alike; not Apache-2.0 |
| `examples/tracks/adria-karting-raceway.okl.json` | OSM way/798432703 | ODbL 1.0 | Attribution and share-alike; not Apache-2.0 |
| `examples/tracks/circuito-aurora.okl.json` | Synthetic, project-authored | Apache-2.0 | None beyond the repository license |

The OpenStreetMap-derived circuits are a Derivative Database under ODbL 1.0 and
must carry "© OpenStreetMap contributors" wherever they, or a database derived
from them, are redistributed. That includes the published web bundle, which
compiles their geometry in, so the editor displays the credit whenever one is
loaded.

Renaming a circuit does not remove the obligation: the license attaches to the
geometry, not to the name, and dropping the name only defeats the attribution
the license requires. A circuit that must not carry attribution has to be
authored from scratch instead of derived.

Per-file provenance records live in
[examples/tracks/README.md](examples/tracks/README.md). Regenerate any of them
with `scripts/import_osm_kart_track.py`, which records the way id it read.

## Papers and algorithms

Ideas, equations, and published results should be cited in the relevant documentation and, where useful, [CITATION.cff](CITATION.cff). Do not copy source, figures, tables, or datasets merely because a paper is accessible. Reimplementations must be original, tested against public descriptions, and respect patents and license obligations.

## Release notices

Before each public release, maintainers:

- compare manifests and lockfiles with this policy;
- generate/review a dependency license inventory;
- include required license and attribution texts in distributed artifacts;
- verify that fixtures and examples have provenance records;
- document any optional native solver's separate obligations.

See [docs/RELEASES.md](docs/RELEASES.md) for the full gate.
