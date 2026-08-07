# Development guide

## Prerequisites

- Git
- Python in the supported range declared by `pyproject.toml`
- [`uv 0.11.31`](https://docs.astral.sh/uv/) as the CI baseline for Python environments and lockfiles
- Node.js 24 (the CI baseline; use the range declared by `package.json` when present)
- Corepack and the repository-declared pnpm version

The baseline engine does not require CasADi, IPOPT, Docker, Tauri, or a compiler toolchain. Optional native solvers will have separate setup instructions when supported.

## First setup

```bash
git clone https://github.com/Navesz/openkartline.git
cd openkartline
corepack enable
pnpm install --frozen-lockfile
uv sync --locked --all-extras --dev
```

`--frozen-lockfile` and `--locked` deliberately fail when manifests and lockfiles disagree. When changing a dependency, regenerate its lockfile without those flags and commit both manifest and lockfile.

## Run the application

Run the API and web development server in separate terminals:

```bash
uv run uvicorn openkartline_api.main:app --reload
pnpm dev
```

Use the exact API module and web URL printed by the local commands; package-level READMEs document any workspace-specific variants.

## Required checks

Run the relevant checks while developing and the full set before requesting review:

```bash
uv sync --locked --all-extras --dev
uv run ruff check .
uv run ruff format --check .
uv run mypy engine services
uv run pytest

pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

To apply safe local formatting:

```bash
uv run ruff format .
pnpm format
```

Do not format unrelated files in a focused pull request.

## Repository layout

| Path | Responsibility |
|---|---|
| `engine/` | Framework-independent geometry, kart models, solvers, and explanation logic |
| `services/api/` | Thin, bounded synchronous HTTP boundary |
| `apps/web/` | Track editor, kart inputs, lap viewer, and UI state |
| `packages/schemas/` | Checked-in language-neutral project schemas |
| `tests/` | Cross-component and acceptance tests |
| `examples/` | Synthetic or explicitly redistributable examples |
| `docs/` | Architecture, science, operations, and decisions |

Dependencies point inward as described in [ARCHITECTURE.md](ARCHITECTURE.md). Do not import UI or HTTP concepts into the engine.

## Testing strategy

- **Unit tests** cover pure geometry, schema validation, solver failures, and UI behavior.
- **Analytic tests** compare physics to a known mathematical result such as a circle or constant-acceleration straight.
- **Property tests** cover invariants under translation, rotation, direction reversal, and resampling.
- **Integration tests** cross schema, engine, API, and file boundaries.
- **Visual/browser tests** are reserved for interactions whose correctness is not captured by component tests.
- **Telemetry validation** uses held-out laps and never treats training fit as independent evidence.

Tests should be deterministic, state numerical tolerances and units, and assert failure states as carefully as success. See [VALIDATION.md](VALIDATION.md).

## Debugging numerical behavior

When a result looks wrong, retain the input hash, model and solver versions, settings, termination status, iterations, maximum constraint violation, and warnings. Reduce the report to a synthetic track if possible. Check geometry orientation and units before tuning solver tolerances.

Never “fix” a solver failure by suppressing status or returning a partial array. Add a minimal regression fixture and preserve the failing diagnostic.

## Schema and format changes

Public `.okl.json` changes require:

1. an issue and ADR for changed meaning or compatibility;
2. schema and generated-type updates;
3. golden read/write fixtures;
4. a reversible migration for minor-version changes;
5. a clear rejection message for unsupported major versions;
6. changelog and user-documentation updates.

Unknown-field preservation and generated binding automation are not implemented in the alpha; adding them requires compatibility fixtures. Never silently reinterpret a unit or coordinate frame.

## Dependency changes

Follow [THIRD_PARTY.md](../THIRD_PARTY.md). Confirm source, license, purpose, transitive/native impact, and supported platforms. Run dependency review and do not combine unrelated upgrades with feature work.

## Common setup failures

- **Wrong pnpm version:** run `corepack enable`, then verify `pnpm --version` matches `packageManager`.
- **Lockfile mismatch:** confirm you did not change a manifest accidentally; regenerate intentionally only for a dependency change.
- **Native solver import failure:** remove optional advanced extras and verify the baseline first.
- **Windows script activation issue:** invoke tools through `uv run`; manual virtual-environment activation is unnecessary.
- **Port already in use:** stop the previous local server or choose a different documented port.

If the clean setup still fails, open a bug with sanitized output and exact runtime versions.
