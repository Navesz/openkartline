# ADR 0001: Web UI with an independent Python engine

- Status: Accepted
- Date: 2026-08-06

## Context

The project needs a rich 2D editor and a scientific optimization stack. A native-only UI reduces web contributor access, while a browser-only solver makes current native optimization libraries difficult to distribute.

## Decision

Use a monorepo with a React/TypeScript web UI, a thin local FastAPI service, and an independently importable Python engine. Heavy solver calls execute in a separate process. The initial application is served locally in the user's browser.

## Consequences

- UI and physics can evolve and test independently.
- The same engine can support CLI, notebook, API, or future desktop packaging.
- A local launcher and two language toolchains are required.
- Public schemas and compatibility tests become mandatory.
- Tauri, hosted deployment, and native solver backends remain additive choices.
