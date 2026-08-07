# Changelog

All notable changes to OpenKartLine are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-07

### Added

- Runnable MVP preview with 2D centerline editing, a uniform-width track corridor, local project import/export, and an offline browser simulation fallback.
- Deterministic Python geometry and point-mass speed-profile engine with a typed local API and explicit validation/solver states.
- Explainable lap preview with brake/coast/throttle colors, summary metrics, driving markers, and model warnings.
- Initial open-source project structure and community policies.
- Architecture, product, physics, data-format, validation, stack, and roadmap documentation.
- Cross-platform Python and web quality workflows.
- CodeQL, dependency review, Dependabot, documentation checks, and automated draft release notes.
- Versioned `.okl.json` schema, validated synthetic project, API OpenAPI contract, and local/API browser E2E coverage.
- Keyboard-operable numeric control-point editor and bounded project import.

### Changed

- Periodic C2 geometry and equal-arc resampling keep lap estimates stable across sample counts.
- Browser and Python solvers enforce a combined longitudinal/lateral friction envelope.
- Scientific API errors remain visible; browser fallback is restricted to network unavailability.
- Driving references are coalesced and limited so raw numerical chatter does not become false precision.

### Fixed

- Reject dense self-intersections, incorrect left/right boundary semantics, extreme coordinates, oversized API bodies, and incompatible project constants.
- Integrate lap time exactly from returned nodal speeds and distinguish path convergence termination reasons.
- Align UI, project schema, and API minimum sample count.

### Security

- Private vulnerability reporting guidance and a local-first telemetry privacy policy.

[Unreleased]: https://github.com/Navesz/openkartline/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Navesz/openkartline/releases/tag/v0.1.0
