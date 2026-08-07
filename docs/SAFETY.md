# Safety and responsible use

OpenKartLine is a planning and educational tool. It does not observe current grip, traffic, mechanical condition, flags, marshal instructions, weather, or the driver's capability. Its output is not a command and cannot guarantee a safe maneuver or lap time.

## Assumptions that matter

Recommendations can change materially with surface contamination, moisture, tire state, brake condition, kart variation, temperature, driver mass, wind, elevation, banking, and sensor error. Horsepower alone is not a sufficient kart model. A numerically converged solution can still be physically inappropriate when its inputs or model are wrong.

## Responsible workflow

1. Inspect all assumptions, units, warnings, solver status, and safety margins.
2. Walk or learn the circuit and follow its rules and briefing.
3. Begin below the predicted pace and validate one reference at a time.
4. Preserve room for other drivers and changing conditions.
5. Stop using a recommendation when observation disagrees with the model.
6. Never use the application to control steering, throttle, or brakes in real time.

The interface must distinguish estimates, calibrated results, and held-out validation. Failed, infeasible, timed-out, or partially computed solutions must never look like successful guidance.

## Project boundary

The first product targets a dry, closed, flat circuit, a single kart, a flying lap, and no traffic. Public-road use, autonomous control, overtaking guidance, collision avoidance, and live coaching are outside the v1 scope.

Report unsafe or misleading behavior with a reproducible synthetic case. Use the private security process only if an attacker can exploit the behavior across a trust boundary.
