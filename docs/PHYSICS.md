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

#### Longitudinal resistance

Aerodynamic drag and rolling resistance are modelled as a deceleration that always opposes motion:

```text
drag:        a_drag  = 0.5 * rho * A * v^2 / m
rolling:     a_roll  = c_rr * g
resistance:  a_res   = a_drag + a_roll
```

The available longitudinal acceleration follows from it directly. Under power the engine and tire envelopes are intersected, never multiplied, and resistance is subtracted from the intersection; under braking the same resistance helps the tires:

```text
drive:  a_x = max(0, min(a_power, a_traction) - a_res)
brake:  a_x = a_tire + a_res
```

The declared top speed is a hard cap: drive acceleration is zero at or above it. Earlier versions instead multiplied the drive envelope by a `1 - (v / v_max)^4` taper. That taper had no physical derivation, existed only to force the declared top speed in the absence of a resistance term, and had two visible costs: engine power stopped changing the result above roughly 30 hp, and mass only ever appeared in the acceleration zones. With real resistance, power buys speed again and the taper is gone.

| Constant | Value | Meaning |
|---|---|---|
| `rho` | 1.225 kg/m³ | Air density at sea level, 15 °C |
| `A` | 0.8 m² (`drag_area_m2`) | Drag area of a kart with an upright driver |
| `c_rr` | 0.015 (`rolling_resistance`) | Rolling resistance coefficient |
| `g` | 9.80665 m/s² | Standard gravity |

`drag_area_m2` and `rolling_resistance` are optional kart inputs with these defaults, so a client written against the original contract keeps the same behaviour it had before they existed.

These values describe a chassis class, not a measured kart. A kart carries no bodywork and the driver sits in clean air, so the drag area is large relative to the frontal size; the rolling coefficient is a literature value for hard tires on asphalt. Neither is fitted to telemetry from a specific chassis, and neither should be reported as if it were. Both become fitted quantities at P3, where "rolling/drag terms when identifiable" are calibrated from recorded laps.

Because the model is quasi-steady, the lateral speed ceiling is still `sqrt(a_y_limit / kappa)`, which leaves no friction budget for the resistance the tires must also cancel. A kart sitting exactly on that ceiling therefore reports a friction utilization slightly above 1 — about 1% for a 10 m/s corner on a 175 kg kart. This is a property of the ceiling, not a solver failure, so it is visible in the `friction_utilization` channel but is not counted in `max_constraint_violation`, which reports what the solver controls: the longitudinal envelopes and the lateral ceiling itself.

The browser solver in `apps/web/src/domain/kartModel.ts` implements the same equations with the same constants. The two engines are expected to produce the same speed profile for the same inputs; a constant used by only one of them is a divergence waiting to happen.

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
- Drag area and rolling resistance are chassis-class defaults rather than measured values, so the fastest sections of a lap carry more model error than the slowest ones.

The application must expose these limitations and allow a conservative safety margin.
