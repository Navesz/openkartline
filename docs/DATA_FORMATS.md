# Data formats

OpenKartLine has two deliberately separate contract families:

1. `.okl.json` stores the editable local user project.
2. API request/result models describe explicit boundaries and scientific output.

Do not send a project file directly to `/v1/simulations`; the web adapter validates it and derives an API request.

## Project format 0.2.0

The current schema is [okl-project-0.2.0.schema.json](../packages/schemas/okl-project-0.2.0.schema.json), with a redistributable example at [circuito-aurora.okl.json](../examples/tracks/circuito-aurora.okl.json). TypeScript representation and runtime checks live beside the web reader/writer. The previous [0.1.0 schema](../packages/schemas/okl-project-0.1.0.schema.json) remains valid for reading: the web importer accepts both versions and the writer always emits `0.2.0`.

```json
{
  "schema_version": "0.2.0",
  "project": {
    "name": "Synthetic oval",
    "created_at": "2026-08-06T00:00:00.000Z",
    "updated_at": "2026-08-06T00:00:00.000Z"
  },
  "track": {
    "coordinate_system": "local_cartesian_m",
    "direction": "clockwise",
    "width_m": 8.0,
    "raw_centerline": [[0.0, 0.0], [20.0, 0.0], [20.0, 10.0], [0.0, 10.0]],
    "background": {
      "image_data_url": "data:image/jpeg;base64,...",
      "image_width_px": 1280,
      "image_height_px": 720,
      "scale_m_per_px": 0.42
    }
  },
  "kart": {
    "model": "point_mass_v1",
    "total_mass_kg": 190.0,
    "parameters": {
      "power_hp": 13.0,
      "kart_mass_kg": 115.0,
      "driver_mass_kg": 75.0,
      "top_speed_kph": 82.0,
      "grip_coefficient": 1.05,
      "brake_decel_mps2": 7.5
    }
  },
  "simulation": {
    "solver": "speed_profile_v1",
    "settings": { "sample_count": 200 },
    "safety_margin_m": 0.55
  }
}
```

The centerline contains distinct points and closes implicitly. `width_m` is the uniform total usable width. `track.background` is optional editor chrome: a re-encoded JPEG/PNG data URL plus its pixel size and the metres-per-pixel scale set by the two-click calibration tool. Simulation is blocked while a background is present without `scale_m_per_px`, because pixel units would produce a plausible but wrong lap time. When the embedded image alone would push the project past the 1 MiB budget, the writer omits `image_data_url`, keeps the geometry and calibration, and surfaces a warning.

Project timestamps describe the file record; they do not affect simulation. The reader rejects unsupported versions, excessive file/point sizes, non-finite or out-of-range values, and unsafe solver settings.

`0.2.0` is an alpha contract. Readers reject incompatible versions with an actionable message. Unknown-field preservation and automated migrations are future work and must land before any stable-format promise.

## API contract 1.0

Pydantic models in `engine/openkartline_engine/schemas.py` are authoritative. FastAPI publishes their JSON Schema through `GET /openapi.json`, and interactive documentation through `GET /docs`.

A simulation request contains:

- a closed metric track with explicit travel-left and travel-right boundaries;
- a point-mass kart with total mass, power, top speed, acceleration, braking, lateral grip, and drivetrain efficiency;
- sample count, safety margin, smoothing iterations, and friction exponent.

A successful result contains:

- schema and engine versions;
- structured solver state and runtime/constraint diagnostics;
- validation findings and modeling assumptions;
- path-optimization diagnostics;
- lap summary;
- distance-indexed position, heading, curvature, speed, time, acceleration, controls, and friction-use samples;
- reproducible driving-reference markers.

`invalid_input` and `numerical_failure` use the same envelope but do not include successful numeric arrays.

## Units and compatibility

Engine fields use SI units and include unit suffixes such as `_m`, `_mps`, `_kg`, or `_rad`. `power_hp` is the explicit exception and is converted internally. Changing a field's physical meaning requires a new schema version and an ADR.

- Patch versions may clarify behavior or add optional fields without changing meaning.
- Minor versions may add compatible fields and require a reversible migration.
- Major versions may change structure or semantics.
- Golden examples remain deterministic and redistributable.

## Future telemetry imports

GPX/CSV adapters are not implemented in the alpha. When added, they must preserve the original file, declare coordinate/projection metadata, report sampling quality, and keep source, consent, and redistribution status. Public fixtures may contain only synthetic or explicitly licensed data.
