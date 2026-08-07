# Changelog

All notable changes to OpenKartLine are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Lap playback: a toggle animates the kart along the racing line at 1x, 2x or 3x, with a scrub bar and live speed, throttle and brake. The rate scales the replay clock only; the simulated lap time and every channel stay exactly as solved, and one clock drives the kart, the chart cursor and the panels.
- Per-sample elapsed time on the result contract, integrated from the same trapezoidal clock that produces the reported lap time.
- Drive-mode stabilisation that drops brake/throttle bands too short to be a real input. On the reference circuit this takes the racing line from 85 colour bands to 17.

- Corner-rich synthetic fixture plus regressions for sample-count stability and for path-iteration effectiveness, which the near-analytic circle fixture could not detect.
- Web coverage thresholds enforced in CI, matching the intent of the Python `fail_under` gate.

### Changed

- Engine power and mass now change the lap. The longitudinal ceiling was a flat `0.52 * mu * g`, an undocumented constant that in practice set the lap time: every kart above roughly 30 hp produced an identical lap, and 10 kg of ballast cost 0.022 s against 0.7-0.8 s measured in the field. The ceiling is now the rear-axle traction limit including longitudinal load transfer, aerodynamic drag and rolling resistance are modelled, and tyre load sensitivity makes cornering respond to mass. Ballast sensitivity rose to 0.158 s per 10 kg and a 3 hp kart is now 4 s a lap slower than a 13 hp one.
- The usable corridor accounts for the kart's 1.4 m width, so the racing line can reach the track edge exactly as far as the chassis allows. `safety_margin_m` is now the driver's own buffer on top of that, defaulting to 0.15 m.
- The racing line uses the full remaining corridor at the apex, following the out-in-out principle, instead of 62% of it.
- The path-solver gradient filter keeps a constant width in arc length instead of in samples, so the returned line no longer depends on the requested resolution. Lap-time spread across 300–2400 samples on the serpentine fixture fell from 12.0% to 1.8%.
- Boundary self-intersection and corridor-crossing checks use an x-interval sweep for the broad phase, halving simulation wall time at 4,000 samples. The exact intersection predicate is unchanged.
- Sample alignment between the two boundaries uses an FFT cross-correlation instead of testing every rotation.
- The browser fallback and the engine adapter derive the kart envelope from one shared module, so switching engines no longer changes the modelled kart.
- The racing line renders as one polyline per drive-mode run instead of one filtered SVG node per sample.

### Fixed

- The projected-gradient line search restricts the preconditioned direction to the free set before applying corridor bounds, and falls back to the unsmoothed gradient. It previously reported `no_progress` while a feasible descent step still existed, which made `path_smoothing_iterations` inert on any circuit with corners.
- Engine results are paired with the centerline station nearest to each sample instead of assuming index parity, which could draw the corridor out of phase with the returned line.
- Canvas zoom no longer scrolls the page: the wheel listener is bound with `{ passive: false }` because React registers `wheel` passively.
- Project export appends the download anchor and defers `revokeObjectURL`, which Firefox and Safari need.
- A busy local solver (HTTP 429) falls back to the browser solver instead of surfacing a transient capacity error.
- Numeric fields can be cleared and retyped instead of collapsing to `0` on the first keystroke.
- The engine health probe repeats when the window regains focus, so an engine started after page load is detected.
- Removed the artificial 160 ms delay before every simulation and an unused exported component.
- The selection ring no longer follows the kart during playback: it tracked an integer sample index, so it jumped roughly every 145 ms next to the smoothly interpolated kart marker.
- The racing line renders as one filtered group rather than one filter per colour band, so overlapping blurs no longer make the line look thick at some joins and thin at others.
- The playback toggle no longer drives other state from inside a state updater, which StrictMode ran twice.

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
