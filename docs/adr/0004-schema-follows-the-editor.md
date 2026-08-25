# ADR 0004: The published schema follows the editor's limits

- Status: Accepted
- Date: 2026-08-24

## Context

`okl-project-0.2.0.schema.json` capped `power_hp` at 80 and `brake_decel_mps2` at 15, while `INPUT_LIMITS` in the web app allowed 100 and 20. The two drifted apart without anything noticing, and the shipped Superkart preset (95 hp, 18 m/s²) exported a file that failed the project's own published schema. The Braking input additionally hardcoded `max={15}`, so the field refused values its own validation message said were allowed.

Separately, `TrackInput.attribution` existed, four presets carried `© OpenStreetMap contributors · ODbL 1.0`, and the panel rendered it — but `toProject` never wrote it. Saving one of those circuits and sharing the file redistributed ODbL-derived geometry with the credit stripped, and re-importing returned `attribution === undefined`.

The background schema also advertised `origin_x_px` / `origin_y_px`, which no reader has ever consumed.

## Decision

Relax the two bounds in place, in both `0.1.0` and `0.2.0`, rather than minting `0.3.0`. Add `attribution` to the `0.2.0` track as an optional string, and delete the two dead background keys.

`PROJECT_SCHEMA_VERSION` stays at `0.2.0`. The reader accepts only `0.1.0` and `0.2.0`, so a new version would make files written by this build unreadable to every shipped one — a steep price for a relaxation and an optional field. Both changes are backward compatible in the direction that matters: every file valid under the old `0.2.0` remains valid under this one.

The format is documented as a pre-1.0 alpha contract in `packages/schemas/README.md` and `docs/DATA_FORMATS.md`, which is what makes editing a published version acceptable here. After 1.0 this would need a version bump.

## Consequences

- The Superkart preset round-trips through its own schema.
- The Braking field accepts the range the validator and its error message describe, because both now read `INPUT_LIMITS`.
- ODbL credit survives save and reload. A malformed credit line degrades to absent rather than rejecting the project.
- A file written by this build that uses the widened range or carries an attribution will fail validation against an older copy of the schema. That is the cost of not bumping, and it is bounded: the values were already reachable in the editor, so such files were being produced anyway — just silently invalid.
- A test now pins each schema bound to its `INPUT_LIMITS` counterpart, so the next drift fails CI instead of being discovered from an export.
