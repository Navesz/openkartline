# Maintainer playbook

This playbook translates project policy into routine GitHub operations. Repository settings remain external to Git, so each release audit confirms them separately.

## Recommended repository settings

- Enable Issues and Discussions.
- Enable private vulnerability reporting, Dependabot alerts, dependency graph, and secret scanning when available.
- Configure GitHub Pages with **GitHub Actions** as its build source before enabling the demo workflow, then verify the public URL from a signed-out browser after every deployment change.
- Protect `main`: require pull requests, resolved conversations, linear history, and all required CI checks. Require one independent approval once a second active maintainer exists; until then, allow zero approvals while still requiring the pull-request workflow so maintenance cannot deadlock.
- Prevent force pushes and branch deletion on `main`.
- Require signed commits only if the project can support contributors across platforms without creating an unnecessary barrier.
- Restrict release and environment permissions to maintainers.
- Allow squash merge with the pull-request title as the default commit subject.
- Disable automatic deletion of head branches only when long-lived release branches actually need it; otherwise enable cleanup.

Initial required checks should include Python quality, supported-platform Python tests, web quality/build, browser E2E, documentation/schema/citation, dependency review, and CodeQL. GitHub check names must be selected only after each workflow has run at least once.

## Labels

Keep a small, predictable taxonomy:

- type: `type: bug`, `type: feature`, `type: research`, `type: maintenance`;
- area: `area: web`, `area: editor`, `area: engine`, `area: geometry`, `area: physics`, `area: api`, `area: schemas`, `area: telemetry`, `area: validation`, `area: docs`, `area: packaging`;
- state: `needs-triage`, `needs-info`, `blocked`, `ready`;
- contribution: `good first issue`, `help wanted`;
- release: `major`, `minor`, `patch`, `breaking-change`, `skip-changelog`;
- risk: `security`, `safety`, `privacy`.

Use one type and as many relevant areas as needed. Do not encode priority in milestone names or use labels to shame inactive contributors.

## Issue triage

1. Remove secrets or private data immediately and follow the containment process.
2. Confirm the issue belongs in public; move vulnerabilities to a private advisory.
3. Reproduce with the latest revision or request the minimum missing information.
4. Assign type, area, state, and milestone.
5. Separate confirmed behavior from physical/modeling interpretation.
6. Close duplicates with a link and preserve any unique reproduction details.

An issue is ready when it has a user-visible outcome, bounded scope, acceptance evidence, and known dependencies. Close inactive requests based on relevance, not arbitrary age.

## Pull-request triage

Confirm scope, linked issue, test evidence, changelog impact, dependency and data provenance, schema/ADR requirements, and screenshots for UI work. Keep security findings out of public review until disclosure. Prefer a follow-up issue over indefinitely expanding an otherwise complete pull request.

## CI incident response

Determine whether a failure is deterministic, platform-specific, flaky, or external. Do not repeatedly rerun a deterministic failure. Quarantine a flaky test only with an owner, issue, preserved evidence, and time-bounded repair plan. For a compromised action or dependency, disable the affected workflow, rotate exposed credentials, inspect published artifacts, and issue an advisory when user trust may be affected.

## Release operations

Follow [RELEASES.md](RELEASES.md). Two people should verify a stable release when the maintainer community has grown enough. Protect tags through repository rules, use least-privilege workflow permissions, and never paste long-lived publishing tokens into repository files.

## Access and continuity

Grant the narrowest repository role that permits the work. Review collaborator and GitHub App access at least twice a year. Maintainers use two-factor authentication and keep local recovery codes. When access changes, remove obsolete credentials and transfer ownership of open security/release work.

At least two maintainers should eventually be able to perform releases and security response. Until then, the repository should avoid infrastructure that only one person's unpublished local environment can rebuild.

## Community health audit

At least quarterly, review open issues, stale roadmap status, unsupported documentation, dependency alerts, security settings, funding disclosures, contributor onboarding friction, and whether the code of conduct has a usable private reporting path.

## External actions still required

Files in the repository cannot enable Discussions, branch rules, private vulnerability reporting, Dependabot security updates, GitHub Pages, organization roles, GitHub Sponsors, or payment accounts. A maintainer must configure and periodically verify those controls in GitHub settings. See [FUNDING.md](FUNDING.md) before adding a funding link.

## Bootstrap repository state

The initial owner verified these settings on 2026-08-06:

- Issues, Discussions, private vulnerability reporting, vulnerability alerts, automated dependency security fixes, secret scanning, and push protection are enabled.
- GitHub Pages uses GitHub Actions and publishes at `https://navesz.github.io/openkartline/` after the first successful deployment.
- The `Protect main` ruleset requires pull requests, resolved review conversations, linear history, and prevents force pushes and branch deletion. It requires zero approvals only during the single-maintainer bootstrap period.
- Squash is the only merge method, pull-request titles become commit titles, and merged branches are deleted automatically.
- Workflow tokens default to read-only and cannot approve pull requests.
- GitHub Actions must be referenced by full commit SHA.

The initial required status-check names are preconfigured in the ruleset. Audit the names after their first GitHub run and update the ruleset and this record together whenever a workflow or job is renamed.
