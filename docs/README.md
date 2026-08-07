# Documentation

This directory contains the durable product, engineering, scientific, and project-operation record for OpenKartLine.

## Start here

| Need | Document |
|---|---|
| Understand the product and its limits | [Product definition](PRODUCT.md) |
| See what exists and what comes next | [Roadmap](ROADMAP.md) |
| Set up a contributor environment | [Development guide](DEVELOPMENT.md) |
| Understand component boundaries | [Architecture](ARCHITECTURE.md) |
| Review technology choices and risks | [Stack decisions](STACK.md) |
| Understand the kart model | [Physics plan](PHYSICS.md) |
| Inspect project and telemetry formats | [Data formats](DATA_FORMATS.md) |
| Evaluate correctness and accuracy | [Validation strategy](VALIDATION.md) |
| Inspect current release evidence | [Validation report](VALIDATION_REPORT.md) |
| Prepare or publish a release | [Release process](RELEASES.md) |
| Operate the GitHub project | [Maintainer playbook](MAINTAINER_PLAYBOOK.md) |
| Understand privacy expectations | [Privacy](PRIVACY.md) |
| Understand driving-safety boundaries | [Safety](SAFETY.md) |
| Support future project funding | [Funding](FUNDING.md) |

Community-wide policies live at the repository root: [contributing](../CONTRIBUTING.md), [governance](../GOVERNANCE.md), [security](../SECURITY.md), [support](../SUPPORT.md), [code of conduct](../CODE_OF_CONDUCT.md), and [third-party policy](../THIRD_PARTY.md).

## Architecture decision records

ADRs under [`docs/adr`](adr/) preserve decisions that would otherwise be rediscovered. Accepted ADRs are not silently rewritten when a decision changes. Add a new ADR that supersedes the old one and link both records.

## Documentation standard

- Write canonical technical documentation in English; maintain high-value Brazilian Portuguese guides as the contributor community permits.
- Define uncommon terms and include units in equations and examples.
- Separate implemented behavior from proposals and future work.
- Link claims to primary sources and record validation evidence.
- Use repository-relative links so forks and offline checkouts remain usable.
- Never include private telemetry, credentials, or assets without redistribution permission.

Documentation changes run Markdown and link checks in CI. A broken link outside project control can be excluded only with a short reason in `.github/lychee.toml`.
