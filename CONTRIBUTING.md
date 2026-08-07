# Contributing to OpenKartLine

Thank you for helping build an accessible and trustworthy kart simulation tool.

## Before starting

1. Read the [product definition](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), and [roadmap](docs/ROADMAP.md).
2. Search existing issues and discussions.
3. Open an issue before a large change so the model, data contract, and validation plan can be agreed first.
4. Keep pull requests focused on one behavior.

## Engineering expectations

- Add tests for geometry, physics, formats, and API behavior.
- Use deterministic fixtures where possible.
- State units in names or schemas; the engine uses SI units.
- Do not add track imagery, telemetry, or kart data unless redistribution rights are clear.
- Record important architectural decisions as an ADR under `docs/adr/`.
- Do not claim physical accuracy without a reproducible validation result.
- Never silently turn a solver failure into a plausible-looking lap.

## Proposed development workflow

The executable toolchain will be added in milestone M0. The intended commands are:

```text
pnpm install
uv sync
pnpm test
uv run pytest
```

Until that scaffold lands, documentation-only contributions can be checked with any Markdown linter.

## Commit and pull request style

Use short imperative commit subjects. Pull requests should explain:

- The problem and user impact.
- The chosen approach and alternatives considered.
- How the change was tested or validated.
- Any effect on data compatibility, performance, safety, or licensing.

## Languages

Issues and discussions may be written in English or Brazilian Portuguese. Canonical technical documentation and identifiers use English. Important user-facing material should be translated when practical.

By contributing, you agree that your contribution is licensed under Apache-2.0 and that you have the right to submit it.
