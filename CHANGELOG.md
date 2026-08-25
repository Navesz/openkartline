# Changelog

All notable changes to OpenKartLine are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A parity gate that runs in both directions. `engineParity.test.ts` only ever checked the TypeScript port against the committed fixtures, so a Python-only change with the export step skipped left every job green; `tests/python/test_parity_fixtures.py` now holds the engine to the same fixtures and tolerances.
- A scheduled supply-chain audit of the committed lockfiles. `dependency-review` inspects a pull request's diff, so an advisory published against an already-pinned package was invisible to it.
- An ESLint rule that fails the build on user-facing text written directly into a component, and tests that fail on a message key nobody renders or one whose locales disagree about placeholders.
- `scripts/validation_numbers.py`, which regenerates the tables in `docs/VALIDATION_REPORT.md` so they cannot silently drift from the engine again.
- Lap playback: a toggle animates the kart along the racing line at 1x, 2x or 3x, with a scrub bar and live speed, throttle and brake. The rate scales the replay clock only; the simulated lap time and every channel stay exactly as solved, and one clock drives the kart, the chart cursor and the panels.
- Per-sample elapsed time on the result contract, integrated from the same trapezoidal clock that produces the reported lap time.
- Drive-mode stabilisation that drops brake/throttle bands too short to be a real input. On the reference circuit this takes the racing line from 85 colour bands to 17.

- Corner-rich synthetic fixture plus regressions for sample-count stability and for path-iteration effectiveness, which the near-analytic circle fixture could not detect.
- Web coverage thresholds enforced in CI, matching the intent of the Python `fail_under` gate.

### Changed

- Figures are formatted in the reader's language. Every number came from `toFixed`, so Portuguese showed `1.05` for a grip coefficient and `1200` where the language groups as `1.200`. SVG path data and lap times are deliberately excluded: a comma is a coordinate separator in the first, and motorsport convention in the second.
- A solved lap follows the language toggle. Event labels, result notes and the status line were rendered to strings when the lap was computed, so switching locale left the panel half translated.
- The published `.okl.json` schema describes what the app produces: `power_hp` and `brake_decel_mps2` are widened to the editor's own limits, so the shipped Superkart preset stops emitting a file that fails its own schema, and `attribution` is added so the ODbL credit on OpenStreetMap-derived circuits survives a save. Recorded in ADR 0004.
- Calibration is reachable from the keyboard, and the run-bar live region is scoped to the message rather than to a bar containing a button whose label changes.
- Engine power and mass now change the lap. The longitudinal ceiling was a flat `0.52 * mu * g`, an undocumented constant that in practice set the lap time: every kart above roughly 30 hp produced an identical lap, and 10 kg of ballast cost 0.022 s against 0.7-0.8 s measured in the field. The ceiling is now the rear-axle traction limit including longitudinal load transfer, aerodynamic drag and rolling resistance are modelled, and tyre load sensitivity makes cornering respond to mass. Ballast sensitivity rose to 0.158 s per 10 kg and a 3 hp kart is now 4 s a lap slower than a 13 hp one.
- The usable corridor accounts for the kart's 1.4 m width, so the racing line can reach the track edge exactly as far as the chassis allows. `safety_margin_m` is now the driver's own buffer on top of that, defaulting to 0.15 m.
- The racing line uses the full remaining corridor at the apex, following the out-in-out principle, instead of 62% of it.
- The path-solver gradient filter keeps a constant width in arc length instead of in samples, so the returned line no longer depends on the requested resolution. Lap-time spread across 300–2400 samples on the serpentine fixture fell from 12.0% to 1.8%. (That 1.8% no longer holds: correcting the corridor measurement, below, made this fixture genuinely narrower and harder, and the spread is now 4.0%. The filter change stands; see issue #45.)
- Boundary self-intersection and corridor-crossing checks use an x-interval sweep for the broad phase, halving simulation wall time at 4,000 samples. The exact intersection predicate is unchanged.
- Sample alignment between the two boundaries uses an FFT cross-correlation instead of testing every rotation.
- The browser fallback and the engine adapter derive the kart envelope from one shared module, so switching engines no longer changes the modelled kart.
- The racing line renders as one polyline per drive-mode run instead of one filtered SVG node per sample.

### Fixed

- Corridor width is measured across the centreline normal instead of between independently resampled boundary samples. Equal-arc sampling advances through a corner at different rates on the inner and outer edge, so pairing them by index gave a skewed chord: on a corridor 8.00 m wide everywhere the engine reported up to 11.16 m, delivered 0.2884 m of a 0.3500 m safety margin, and in tight corners the chord left the corridor entirely, so no fraction of it was safe. The five shipped circuits were reported with mean widths of 12.6–15.1 m and maxima up to 30.9 m.
- `minimum_bending_path` reports convergence when the line search stalls at the optimum. It previously returned `no_progress` while sitting on the exact analytic optimum of an annulus, matching the closed-form objective to a relative 9.3e-6, so the interface attached "did not reach the convergence criterion" to a solve that had.
- Driving markers receive the racing line's length rather than the centreline's, matching the engine. The apex spacing rule wraps with `trackLengthM - gap`, so the wrong length made that term negative for apexes straddling the start line and changed which ones survived.
- Calibrating a background image no longer resizes the track. Every centreline in the app is already in metres, and scaling one turned a 900 m circuit into 360 m; a first attempt guarded that with a flag which any point edit armed, turning a 319 m circuit into 128 m instead. Calibration now only records the scale, which is what sizes the picture.
- Track images are re-encoded after the encoder gives up pixels. The quality ladder shrank the canvas on its last iteration and then exited, so an oversized upload kept its full-size payload while reporting the smaller dimensions — a 33% scale error in every lap time traced over it, and a project saved without the background at all.
- Undo and redo survive StrictMode. Checkpoints were queued from inside a state updater, which development double-invokes, so walking back three edits took six presses.
- A result that lands after the inputs changed no longer claims to be current, and one that lands after "Restore example" no longer replaces the freshly restored result.
- `Ctrl/Cmd + A`, `C`, `V` and `H` no longer switch the canvas tool. Ctrl+A armed the add tool, and the next canvas click inserted a control point.
- `validateTrack` keeps scanning for self-intersections past the first pair of points under 1 m apart, which previously ended the scan and downgraded a crossing lap to a warning with Simulate still enabled.
- A canvas drag is keyed to the pointer that started it, so a second touch cannot hijack it, and its undo checkpoint is taken on first movement rather than on pointer-down, so a plain click no longer marks the project dirty.
- Engine validation errors reach the user: a FastAPI 422 body is a list, and only a string branch was read, so every rejection surfaced as a bare "HTTP 422". `max_accel_mps2` also rises to 50, matching its sibling ceilings, because the editor's own extremes derive 42.53 m/s².
- One transient fallback no longer disables the engine for the session; availability is re-probed rather than inferred.
- Lap times just under a minute no longer render as `0:60.00`.
- The corridor is drawn at a resolution scaled to the lap instead of a fixed 180 stations, which put up to 9.56 m between boundary points on a real circuit — wider than the track.

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

### Security

- `nanoid` is pinned past a moderate advisory that Dependabot could not close on its own: the fixed release sits under the `legacy` dist-tag, so its resolver never reached it. The override belongs in `pnpm-workspace.yaml`, because pnpm 11 silently ignores `pnpm.overrides` in `package.json`.
- The request-size guard is covered by tests. Its streaming half could be deleted with the whole suite still green, and that half is the one that bounds a chunked request carrying no `Content-Length`.

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
