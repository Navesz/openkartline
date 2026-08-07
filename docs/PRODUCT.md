# Product definition

## Vision

Make minimum-time kart simulation understandable and useful to people who do not have a vehicle-dynamics department.

OpenKartLine is an application, not only a numerical library. Its value is the complete path from imperfect user input to an explainable and testable lap plan.

## Initial users

1. Rental-kart drivers learning a circuit.
2. Amateur and competitive kart drivers comparing setup or technique.
3. Engineering and robotics students studying trajectory optimization.
4. Researchers who need transparent, reusable geometry and validation fixtures.

The first product slice targets a dry, closed, flat circuit and one kart running a flying lap without traffic.

## Runnable alpha journey

1. Choose a synthetic circuit or edit a closed metric centerline.
2. Set uniform width, direction, kart, driver, grip, braking, and solver inputs.
3. Run the local Python model or the clearly labeled browser fallback.
4. Inspect the reference line, target speed, controls, assumptions, and diagnostics.
5. Save or reopen the local `.okl.json` project.

## Target product journey

1. Create a project and select metric or imperial display units.
2. Import a background image, KML/GPX/CSV, or start with a blank canvas.
3. Calibrate scale and define left/right boundaries, direction, and start line.
4. Select a kart preset or enter measured performance data.
5. Run a geometry check, then a selected simulation model.
6. Inspect the line, target speed, controls, solver status, and confidence.
7. Export a shareable project and CSV result.
8. Optionally import telemetry, align it to the track, and calibrate the kart.

## Target functional requirements

The following requirements define the product direction; the delivery status and exit criteria are tracked in [ROADMAP.md](ROADMAP.md).

### Track authoring

- Pan, zoom, undo/redo, point editing, and spline smoothing.
- Explicit left and right usable boundaries; a centerline alone is insufficient.
- Scale, coordinate-frame, direction, start line, and safety-margin controls.
- Self-intersection, inverted boundary, insufficient width, and discontinuity checks.
- Import/export through a versioned, documented project format.

### Kart model

- Basic mode: total mass, top speed, approximate power, brake and grip presets.
- Measured mode: acceleration versus speed, maximum braking deceleration, and lateral grip.
- Advanced mode: torque curve, drivetrain, tire, chassis, and environmental parameters.
- Clear distinction between measured, estimated, default, and calibrated values.

### Simulation

- Minimum-curvature baseline.
- Point-mass speed profile with combined longitudinal/lateral tire constraint.
- Minimum-time joint optimization in a later milestone.
- Cancellation, time limits, progress, diagnostics, and reproducible solver settings.

### Explanation

- Color-coded line and synchronized charts.
- Brake start, turn-in, apex, throttle start, and full-throttle markers.
- Assumptions and sensitivity indicators.
- Never present a failed or infeasible solve as a valid result.

## Non-goals for v1

- Real-time control of a kart.
- Autonomous steering or actuator commands.
- Multi-kart traffic, overtaking, or collision avoidance.
- 3D rendering.
- A universally accurate answer from horsepower alone.
- Wet-line optimization, tire thermal modeling, chassis setup optimization, or live coaching.

## Success criteria

- A new contributor can run all tests from a clean machine using documented commands.
- A user can author a valid track without editing source files.
- A synthetic circular track reproduces the analytic speed limit within a documented tolerance.
- Re-running an unchanged project produces equivalent output and records model/solver versions.
- Invalid geometry and infeasible optimization are explained, not hidden.
- A calibrated model improves telemetry speed-profile error on held-out laps relative to the default model.

## Safety posture

The UI must communicate uncertainty. Recommended markers are planning references that change with surface, tires, weather, kart condition, and driver behavior. The product must encourage progressive validation and user-controlled safety margins.
