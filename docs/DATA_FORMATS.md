# Data formats

## Design goals

- Human-readable and versioned.
- SI units in canonical fields.
- Forward-compatible readers that preserve unknown fields when possible.
- Raw input retained separately from processed geometry.
- Provenance for measured, estimated, default, and calibrated values.
- Deterministic hashes for reproducibility.

## OpenKartLine project

The planned extension is `.okl.json`. The schema itself will be generated and checked into `packages/schemas/` during M0.

Illustrative structure:

```json
{
  "schema_version": "0.1.0",
  "project": {
    "name": "Synthetic oval",
    "created_at": "2026-08-06T00:00:00Z"
  },
  "track": {
    "coordinate_system": "local_cartesian_m",
    "direction": "clockwise",
    "start_s_m": 0.0,
    "raw_boundaries": {
      "left": [[0.0, 0.0]],
      "right": [[0.0, 0.0]]
    },
    "smoothing": {
      "algorithm": "periodic_spline",
      "settings": {}
    }
  },
  "kart": {
    "model": "point_mass_v1",
    "total_mass_kg": 175.0,
    "parameters": {}
  },
  "simulation": {
    "solver": "speed_profile_v1",
    "settings": {},
    "safety_margin_m": 0.5
  }
}
```

This example is not yet a stable contract.

## Result format

Results contain metadata and numeric channels. Large arrays may move to a compact attachment format after profiling; JSON remains the manifest.

Required metadata:

- input/project hash;
- schema, engine, model, and solver versions;
- solver termination state;
- iteration count and runtime;
- maximum constraint violation;
- assumptions and warnings;
- units and channel definitions.

## Telemetry import

Import adapters normalize source-specific data into an internal table with:

- monotonic timestamp;
- latitude/longitude or local position;
- speed;
- optional longitudinal/lateral acceleration;
- optional RPM, throttle, brake, steering, and lap markers;
- source, sampling rate, and quality flags.

Original files are not modified. Imported data must declare user consent and redistribution status before it can be added as a public fixture.

## Versioning and migrations

- Patch versions clarify or add optional fields without changing meaning.
- Minor versions may add fields and require a reversible migration.
- Major versions may change field meaning or structure.
- Readers reject unsupported major versions with a clear message.
- Migration tests retain golden before/after fixtures.
