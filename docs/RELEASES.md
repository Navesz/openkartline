# Release process

OpenKartLine uses Semantic Versioning and a pre-1.0 stability policy. A release number communicates API and file-format compatibility, not physical accuracy. Accuracy claims require separate validation evidence.

## Version policy

- `0.y.z`: interfaces may evolve, but every incompatible change is documented and project files receive an explicit migration or rejection path.
- `1.y.z` and later: incompatible public API or stable file-format changes require a major version.
- Pre-release suffixes such as `-alpha.1`, `-beta.1`, and `-rc.1` identify maturity.

The engine, schemas, API, UI, and example projects are released from one repository tag so a numerical result can identify a coherent source revision.

## Release gate

Before tagging, the release manager verifies:

- CI passes on every advertised operating system and runtime;
- changelog entries describe user-visible changes, migrations, fixes, and known limitations;
- public schemas, generated types, and migration fixtures agree;
- synthetic analytic validation passes and claimed telemetry evidence is published;
- dependency vulnerability and license inventories are reviewed;
- third-party notices and fixture provenance are complete;
- install, upgrade, export, import, cancellation, and failure recovery are smoke-tested;
- documentation states optional-solver and platform limitations;
- no secrets, private telemetry, or unlicensed assets are present;
- the version is consistent in every user-visible package and citation metadata.

## Prepare a release

1. Triage the automated draft release and assign semantic-version labels to merged pull requests.
2. Move relevant entries from `Unreleased` in [CHANGELOG.md](../CHANGELOG.md) to a dated version heading.
3. Update version metadata and [CITATION.cff](../CITATION.cff).
4. Run the full required checks in [DEVELOPMENT.md](DEVELOPMENT.md) from a clean checkout.
5. Run [`Release`](../.github/workflows/release.yml) from the Actions tab, on the release branch. It builds everything a tag would and uploads it to the run instead of to a release, so the artifacts can be smoke-tested before the tag exists.
6. Smoke-test those artifacts, not only the source tree.
7. Open a release pull request containing only release metadata and necessary fixes.
8. Merge, create a signed annotated tag `vX.Y.Z`, and push the tag.
9. The same workflow runs on the tag and attaches the artifacts, their `SHA256SUMS`, and both SBOMs to the drafted release. Review the draft and publish it.
10. Verify public downloads and start a fresh-install test from the published instructions.

## What a tag produces

Pushing `vX.Y.Z` builds, checksums, attests and attaches:

- `openkartline-X.Y.Z.tar.gz` and `openkartline-X.Y.Z-py3-none-any.whl` — the engine and API distributions;
- `openkartline-web-vX.Y.Z.tar.gz` — the production web build;
- `sbom-python.cdx.json` and `sbom-node.cdx.json` — CycloneDX 1.6 bills of materials for both dependency graphs;
- `SHA256SUMS` — checksums over all of the above.

The Python distributions carry a [build provenance attestation](https://docs.github.com/en/actions/concepts/security/artifact-attestations), so a consumer can verify which workflow run, from which commit, produced the file they downloaded:

```bash
gh attestation verify openkartline-X.Y.Z-py3-none-any.whl --repo Navesz/openkartline
```

The workflow refuses to run on a tag whose name disagrees with the packaged version. A tag that cannot be traced to the artifact it names is the one thing a release must not produce.

Release Drafter prepares the notes; it does not publish on its own, and neither does this workflow — publishing the reviewed draft stays a human step.

## Release notes

Lead with user impact. Include compatibility and migration notes, model or assumption changes, fixed failures, new known limitations, supported platforms, and a link to validation evidence. Never describe a minimum-curvature line as minimum-time or an unvalidated estimate as accurate.

## Hotfix and withdrawal

For a serious regression or vulnerability, prepare the smallest safe patch, preserve an internal reproduction, and use the normal test gate where disclosure permits. If a release could expose data or present dangerously misleading output, mark it clearly, remove promoted artifacts if necessary, and publish an advisory directing users to a safe version. Do not rewrite or reuse a published tag.

## Rollback

Code rollback does not automatically roll back project-file migrations. Before reverting, verify whether users could have written a newer schema and provide a forward fix or recovery tool. Record the decision in release notes and an ADR when format meaning changes.
