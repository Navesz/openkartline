# Security policy

## Supported versions

OpenKartLine is pre-1.0. Security fixes are applied to the latest release and the `main` branch. Older pre-release builds may be asked to upgrade rather than receive a backport. This table will become version-specific with the first stable release.

| Version | Supported |
|---|---|
| `main` | Best effort |
| Latest tagged pre-release | Yes, once published |
| Older pre-releases | No |

## Report a vulnerability privately

Do not open a public issue for an exploitable vulnerability or include real private telemetry in a reproduction.

Use [GitHub private vulnerability reporting](https://github.com/Navesz/openkartline/security/advisories/new). Include, when possible:

- affected version or commit;
- impact and realistic attack scenario;
- minimal reproduction or proof of concept;
- affected platforms and configurations;
- suggested mitigation;
- whether and where the issue has already been disclosed.

If GitHub private reporting is unavailable, contact the repository owner using a private channel listed on the [Navesz GitHub profile](https://github.com/Navesz). Do not send secrets over a public channel.

## Response targets

Maintainers aim to acknowledge a complete report within seven calendar days, provide an initial assessment within fourteen days, and agree on a disclosure timeline with the reporter. These are targets, not a service-level guarantee for a volunteer project. Complex native-solver or supply-chain reports may need more time.

Validated reports are handled through a private advisory, a minimal fix, regression coverage where safe, dependency and release review, and coordinated publication. Credit is offered unless the reporter prefers anonymity. Maintainers will not pursue good-faith research that respects privacy, avoids service disruption, and gives the project a reasonable opportunity to fix the issue.

## Security boundaries

Important threat areas include:

- malformed `.okl.json`, GPX, KML, CSV, images, and solver output;
- archive/path traversal and unbounded file or numeric-array sizes;
- native Python and optimization dependencies;
- local API exposure, cross-origin requests, and untrusted browser content;
- formula injection in exported CSV files;
- telemetry privacy and accidental network transmission;
- CI tokens, release artifacts, and dependency compromise.

OpenKartLine is local-first. It must not upload telemetry or track data without an explicit user action. Importers treat files as untrusted, validate size and shape, and preserve originals without executing embedded content.

## Secrets and private data

Never commit access tokens, `.env` files, credentials, private telemetry, licensed track imagery, or precise personal-location history. Use synthetic or intentionally redistributable fixtures. If sensitive material is committed, revoke the secret or contain the exposure first; deleting the latest commit is not sufficient because Git history and forks may retain it.

## Safety is not the same as security

Incorrect brake or throttle guidance can cause physical harm even when no security boundary is crossed. Report unsafe recommendations as bugs unless an attacker can intentionally trigger the behavior across a trust boundary. All output remains a planning estimate and must be validated progressively under circuit rules.
