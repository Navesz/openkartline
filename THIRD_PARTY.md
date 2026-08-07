# Third-party projects and license boundaries

This file is an engineering inventory, not legal advice. Exact versions and license texts must be reviewed before the first distributed release.

| Project | Intended role | Current decision |
|---|---|---|
| React, Vite, Konva | Web UI and 2D editor | Planned direct dependencies; verify notices at lockfile creation. |
| FastAPI, Pydantic | Local API and contracts | Planned direct dependencies. |
| NumPy, SciPy, Shapely | Numeric and geometry operations | Planned direct dependencies. |
| CasADi and IPOPT | Minimum-time optimal control | Planned optional engine dependencies after the baseline solver. Keep them behind an adapter and document bundled licenses. |
| Fastest-lap | Reference and possible advanced kart backend | MIT-licensed upstream; integration needs an ADR and validation. Do not copy its sample vehicle/track data without checking each asset. |
| TUMFTM global racetrajectory optimization | Algorithmic reference | LGPL-3.0 upstream. Do not copy source into the Apache-2.0 core without a deliberate compatibility and distribution review. |
| acados | Possible high-performance backend | Deferred. Its native build and generated-code workflow are unnecessary for the MVP. |

## Contribution rule

Every new dependency must record its source, version, license, distribution method, and purpose. Reference papers and algorithms are welcome, but copied implementation code must preserve all applicable obligations.
