# Contributing to OpenKartLine

Thank you for helping make kart trajectory planning understandable, reproducible, and available to everyone. Contributions are welcome in English or Brazilian Portuguese, from first-time contributors and experienced vehicle-dynamics researchers alike.

## Find the right place

- Use [GitHub Discussions](https://github.com/Navesz/openkartline/discussions) for questions, early ideas, and modeling conversations.
- Use an issue template for a reproducible bug, a scoped feature, or a research task.
- Report security problems through the private process in [SECURITY.md](SECURITY.md).
- Do not post private telemetry, access tokens, precise personal-location history, or imagery you cannot redistribute.

Small fixes may go directly to a pull request. Before a large change, open an issue so contributors can agree on the user need, model assumptions, data compatibility, and validation approach.

## Prepare a development environment

The full setup and troubleshooting guide is in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). The short path is:

```bash
git clone https://github.com/Navesz/openkartline.git
cd openkartline
corepack enable
pnpm install --frozen-lockfile
uv sync --locked --all-extras --dev
pnpm test:run
uv run pytest
```

Use the runtime versions declared by the repository. Never edit a lockfile by hand; regenerate it with its package manager and include it when dependency resolution changes.

## Choose a contribution

Good first contributions are narrow and independently testable. Look for `good first issue` and `help wanted`, or improve:

- synthetic, redistributable geometry fixtures;
- analytic physics tests and dimensional checks;
- error messages and solver diagnostics;
- keyboard accessibility and translations;
- documentation, examples, and reproducible benchmarks.

Do not use real track images or telemetry as test data unless their redistribution terms and privacy status are documented.

## Make the change

1. Fork the repository and create a branch such as `feat/track-scale-tool` or `fix/closed-spline-seam`.
2. Keep one behavior per branch and avoid unrelated formatting changes.
3. Add or update tests before claiming a numerical or physical improvement.
4. Update user documentation, schemas, changelog notes, and ADRs when applicable.
5. Run the checks in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
6. Open a pull request using the repository template.

### Engineering rules

- Engine units are SI; unit-bearing public values use explicit names or schema metadata.
- Domain and physics code must not depend on React, HTTP, or Canvas state.
- Keep deterministic fixtures wherever possible and pin solver settings used by tests.
- Treat `infeasible`, `timeout`, numerical failure, and cancellation as distinct states.
- Never turn a failed or partial solve into a successful-looking result.
- State model assumptions and uncertainty; do not advertise universal physical accuracy from one fixture or one kart.
- Preserve raw imported data and provenance when normalization changes it.
- Add dependencies only when their purpose, license, and distribution impact are understood and recorded in [THIRD_PARTY.md](THIRD_PARTY.md).

### Changes that need an ADR

Add a numbered file under `docs/adr/` when a change affects public schemas, coordinate conventions, solver architecture, core dependency direction, privacy defaults, licensing, or supported deployment modes. Use the format of an existing ADR and include context, decision, alternatives, and consequences.

## Commits

Use concise imperative subjects following Conventional Commits where practical:

```text
feat(editor): add metric scale calibration
fix(engine): preserve curvature sign at lap seam
test(physics): cover constant-radius speed ceiling
docs: explain telemetry privacy
```

Common types are `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, and `chore`. Add `!` and a `BREAKING CHANGE:` footer for an intentionally incompatible change. Clean history helps automated release notes, but maintainers may squash a pull request when merging.

Sign-offs are not required. By submitting a contribution, you certify that you have the right to contribute it and agree that it is distributed under the repository's Apache-2.0 license.

## Pull requests

A ready pull request must explain:

- the problem and user impact;
- the approach and meaningful alternatives;
- exact validation performed;
- effects on schemas, units, performance, privacy, safety, and licenses;
- screenshots or recordings for visible UI changes;
- before/after measurements for performance or accuracy claims.

Draft pull requests are welcome for early technical feedback. Automated checks must pass before merge. Review focuses on correctness, reproducibility, failure behavior, maintainability, and whether claims match the evidence. See [GOVERNANCE.md](GOVERNANCE.md) for decision rules.

## Review etiquette

Review the change, not the author. Mark blocking correctness or safety concerns clearly and distinguish them from optional suggestions. Authors should resolve conversations or explain why no change is needed. If a discussion exposes a broader design decision, move it to an issue or ADR so the reasoning remains discoverable.

## Recognition

Git history and release notes credit contributors. Sustained contributors can become reviewers or maintainers through the process in [GOVERNANCE.md](GOVERNANCE.md).
