# Governance

OpenKartLine is a maintainer-led project that aims to move toward shared stewardship as the contributor community grows. Governance favors transparent technical records, reproducible evidence, and reversible decisions.

## Roles

### Contributor

Anyone who reports issues, improves documentation, shares permitted data, reviews work, or contributes code. Contributors have no minimum activity requirement.

### Reviewer

A contributor trusted to review a defined area such as web accessibility, geometry, physics, packaging, or documentation. Reviewers consistently provide constructive review, understand the area's validation expectations, and disclose relevant conflicts of interest.

### Maintainer

A contributor trusted to triage issues, merge pull requests, manage releases and repository settings, respond to security reports, and enforce community policies. Maintainers are responsible for the health of the whole project, not only their specialist area.

The current repository owner is the initial maintainer. New reviewers and maintainers are invited after sustained, constructive participation. The nomination is discussed openly when privacy and security permit, and active maintainers decide by consensus. Access can be removed after a documented request, prolonged inactivity, compromised credentials, or a serious policy violation.

## Decision process

Routine, reversible changes are decided in pull-request review. Maintainers seek consensus and explain requested changes. When consensus is not possible, the repository owner makes the decision and records the rationale.

The following require an issue or discussion and an ADR before merge:

- incompatible public schema or file-format changes;
- coordinate, unit, or solver-result semantic changes;
- core architecture, licensing, privacy-default, or distribution changes;
- removal of a supported platform or a validated scientific model;
- safety behavior that changes how recommendations are communicated.

An ADR should normally remain open for community feedback for at least seven days. A security fix or actively harmful release may use an expedited decision, followed by a public rationale when disclosure is safe.

Physics and performance claims must include reproducible evidence. Popularity does not override a failed analytic test, an incompatible license, or an unsafe presentation of uncertainty.

## Pull-request authority

- An author's self-review does not count as independent approval when another active maintainer is available.
- At least one maintainer approval is expected for non-trivial changes; during the single-maintainer bootstrap period, the owner may merge after CI passes and the pull-request checklist is completed.
- High-risk changes should also be reviewed by someone familiar with the affected area when such a reviewer exists.
- Required CI, unresolved blocking conversations, and required ADRs must be complete before merge.
- Maintainers may merge an urgent, narrow security fix under embargo and document it after coordinated disclosure.

Repository branch protection should enforce these rules technically where the hosting plan supports them. The recommended settings are listed in [docs/MAINTAINER_PLAYBOOK.md](docs/MAINTAINER_PLAYBOOK.md).

## Releases and compatibility

Stable releases follow Semantic Versioning. Project-file compatibility and migrations follow [docs/DATA_FORMATS.md](docs/DATA_FORMATS.md). The release manager follows [docs/RELEASES.md](docs/RELEASES.md), and no numerical result is promoted as validated without the corresponding evidence.

## Conflicts of interest

Reviewers and maintainers disclose financial, employment, competitive, or data-ownership interests that could reasonably affect a decision. A person with a material conflict recuses themselves when another qualified reviewer is available.

## Changes to governance

Governance changes use the same public issue, pull-request, and ADR process as other high-impact changes. The history of this file is the authoritative record.
