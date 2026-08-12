# AGENTS.md

Instructions for AI coding agents working on OpenKartLine. Human contributors should read
[CONTRIBUTING.md](CONTRIBUTING.md) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), which this
file summarises rather than replaces.

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
uv sync --locked --all-extras --dev
```

Node 24 and [`uv`](https://docs.astral.sh/uv/) are the CI baseline. The `--frozen-lockfile`
and `--locked` flags fail on purpose when a manifest and its lockfile disagree: if you change
a dependency, regenerate the lockfile and commit both.

## Checks that must pass

CI runs all of these. A change is not finished until they are green locally.

```bash
pnpm check                 # format:check, lint, typecheck, test with coverage, build
uv run ruff check .
uv run ruff format --check .
uv run mypy engine services
uv run pytest
```

`pnpm check` includes `prettier --check`, and `eslint` runs with `--max-warnings=0`, so a
warning fails the build. Run `pnpm format` and `uv run ruff format .` to fix formatting, and
do not reformat files unrelated to your change.

When you touch anything the user sees, also run the browser tests, which match on visible
text and will not be caught by unit tests:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## Layout and boundaries

| Path | Responsibility |
| --- | --- |
| `engine/` | Geometry, kart models, solvers, explanations. Framework-independent |
| `services/api/` | Thin synchronous HTTP boundary over the engine |
| `apps/web/` | Track editor, kart inputs, lap viewer, UI state |
| `packages/schemas/` | Language-neutral project schemas |
| `docs/` | Architecture, physics, validation, decisions |

Dependencies point inward. Never import UI or HTTP concepts into `engine/`. The browser
solver in `apps/web/src/domain/` is a port of the Python engine and must stay numerically in
agreement with it — `apps/web/src/domain/engine/engineParity.test.ts` enforces this against
checked-in fixtures.

## User-facing text

The interface is English by default with a Portuguese toggle. Never write a literal string
into a component. Add the message to the right module under `apps/web/src/i18n/messages/`
with both `en` and `pt-BR`, then render it through `t('key')` from `useI18n()`.

Functions in `domain/` and `services/` that produce user-facing text receive the translator
as a parameter. Keep it that way; do not reach for a global or a module-level locale.

`MessageKey` is derived from the dictionary, so a mistyped key fails `tsc` rather than
silently rendering nothing.

## Physics and numerical work

Do not resolve a solver failure by suppressing its status or returning a partial result. Add
a minimal regression fixture and keep the failing diagnostic. State units and tolerances in
tests. Read [docs/PHYSICS.md](docs/PHYSICS.md) and [docs/VALIDATION.md](docs/VALIDATION.md)
before changing anything that produces a lap time.

Changes to the public `.okl.json` format need an ADR, schema updates, and golden fixtures.
See [docs/DATA_FORMATS.md](docs/DATA_FORMATS.md).

## Pull requests

Keep changes focused; do not bundle a dependency upgrade with a feature. Explain why the
change is needed rather than restating the diff, and state which checks you ran.
