# Physics and optimization plan

## Current implementation

The runnable alpha implements a constrained minimum-bending geometry baseline plus P1, the quasi-steady point-mass speed profile. It returns solver/path diagnostics and explicit assumptions. G0 shortest-path/minimum-curvature alternatives, P2 joint minimum-time optimization, telemetry calibration, and transient dynamics remain planned.

## Model ladder

OpenKartLine deliberately uses a sequence of models. A more complex model is accepted only when it improves a defined validation case.

### G0 — geometry-only baselines

- Centerline.
- Shortest path inside the track corridor.
- Minimum-curvature path with a configurable safety margin.

These models do not claim minimum lap time. The current `minimum_bending_v1` implementation is one deterministic G0-style baseline; shortest-path and formal minimum-curvature variants remain roadmap work.

### P1 — quasi-steady point-mass kart

States along distance include position on the selected line and speed. The usable acceleration is constrained by a friction envelope. A simple form is:

```text
lateral acceleration:  a_y = v^2 * kappa
friction use:          (a_x / a_x_limit)^p + (a_y / a_y_limit)^p <= 1
```

The exponent and asymmetric acceleration/braking limits are explicit model settings, not hidden constants. The speed profile is computed by:

1. Curvature-based lateral speed ceiling.
2. Forward integration of engine-limited acceleration.
3. Backward integration of braking constraints.
4. Iteration where combined longitudinal/lateral use changes the limits.

P1 is the first useful product model.

### P2 — minimum-time path and control

Path offset, speed, and controls are optimized together using direct transcription/collocation. Constraints include boundaries, periodic lap state, steering/path smoothness, power or measured acceleration envelope, braking, and combined tire use.

CasADi provides symbolic derivatives; IPOPT is the planned nonlinear solver. G0/P1 solutions provide warm starts. Solver status and constraint violations remain visible to the user.

### P3 — calibrated kart

Unknown parameters are fitted from several recorded laps:

- acceleration envelope versus speed;
- braking envelope;
- lateral grip;
- rolling/drag terms when identifiable;
- reaction or control-rate limits where useful.

Training and validation laps are separated. Parameters carry bounds, provenance, uncertainty, and calibration date. A better training fit without held-out improvement is rejected.

### P4 — advanced transient kart model

Possible additions include yaw dynamics, load transfer, chassis/tire behavior, bank/elevation, surface-dependent friction, and an adapter to Fastest-lap or a project-owned C++ backend. This is outside the first public release.

## Kart input levels

| Level | Required information | Intended accuracy |
|---|---|---|
| Basic | Total mass, approximate power, top speed, kart class/preset | Educational first estimate |
| Measured | Acceleration samples by speed, maximum braking, lateral acceleration | Useful track planning |
| Advanced | Torque curve, ratios, tire/chassis parameters, environment | Engineering study |
| Calibrated | Multiple quality-checked telemetry laps | Kart/track/session-specific estimate |

Horsepower alone is never represented as sufficient. When data is missing, the result lists every assumed preset and shows a lower confidence level.

## Output channels

Every sample is indexed by distance `s` and may include:

- `(x, y)`, heading, and curvature;
- target speed and elapsed time;
- longitudinal and lateral acceleration;
- throttle, brake, and coast state;
- friction utilization;
- distance to left/right usable boundary;
- solver constraint margins.

Derived driving markers are computed after the physical result, not embedded as hand-written rules in the optimizer.

## Known limitations

- A numerical optimizer may converge to a local optimum.
- A flat, dry, uniform-friction assumption can dominate small line differences.
- GPS quality may be insufficient to distinguish nearby lines.
- A predicted brake point is sensitive to surface, tire temperature, brake condition, and driver input rate.
- Rental karts nominally rated at the same power can behave differently.

The application must expose these limitations and allow a conservative safety margin.
