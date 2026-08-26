# ADR 0005: Numerical parity constrains which solvers we may use

- Status: Accepted
- Date: 2026-08-25

## Context

[ADR 0001](0001-monorepo-web-python.md) put the same physics in two languages: a
Python engine and a browser port under `apps/web/src/domain/`. `engineParity.test.ts`
and `tests/python/test_parity_fixtures.py` hold them to committed fixtures at
1e-6 relative lap time, 1e-5 m per-sample line deviation and 1e-3 m/s per-sample
speed.

`minimum_bending_path` has a real and measured defect. It reports
`iteration_limit` on every shipped circuit at every allowed value of
`path_smoothing_iterations`, and the line it returns is 0.5–5.2 s slower than
the minimum of the very objective the API names. The lap time therefore depends
on a setting documented as smoothing: the same Adria request returns 74.01 s at
20 iterations, 73.35 s at 60 and 72.63 s at 200.

Its cause is well understood. The discretised ∫κ²ds has an O(n⁴) condition
number, and the shipped method is a fixed-step first-order descent with a
diffusive (low-pass) preconditioner. That combination converges linearly with a
ratio very close to 1, so it would need on the order of 10⁵ iterations against a
published cap of 200.

The textbook remedy is a quasi-Newton method. We built one — two-metric
projected L-BFGS, Bertsekas-style, keeping the shipped objective, gradient,
bounds and convergence test — and it works: at the same 200-iteration budget it
cuts the objective excess from +1.97% to +0.004% on Adria and from +3.06% to
+0.001% on Castelo Branco.

It is nevertheless unusable here, and the reason is not accuracy.

## Decision

**The parity contract is a constraint on solver *choice*, not merely on solver
*implementation*. A method is only admissible if it is roundoff-stable, however
accurate it is.** Quasi-Newton methods on this problem are not, so
`minimum_bending_path` keeps its diffusive-preconditioned descent.

The measurement that decided it removed both available objections — that a proxy
was being measured, and that a hand-written port might be sloppy — by running one
language, one implementation, and two runs differing only in the association
order of a six-term float64 sum inside the shipped gradient. That perturbation is
the realistic cross-language scale; the two prepared tracks already disagree at
that order before either solver starts.

Worst per-sample line deviation across the five committed circuits, against the
1e-5 m gate:

| Configuration | 1e-12 perturbation | one ULP |
|---|---|---|
| shipped @ 20 (what ships) | 2.4e-10 m ✅ | 9.3e-11 m ✅ |
| shipped @ 200 | 2.2e-10 m ✅ | 8.9e-11 m ✅ |
| projected L-BFGS @ 20 | 2.4e-09 m ✅ | 2.1e-09 m ✅ |
| **projected L-BFGS @ 200** | **3.6e-01 m ❌** | **1.7e-01 m ❌** |

The L-BFGS iteration map amplifies roundoff geometrically — a measured growth
factor of 1.164 to 1.185 per iteration, one decade every 14 iterations, 1.4e13
to 3.9e14 over 200. The shipped loop does not amplify at all. For the two engines
to land under the gate at iteration 200, they would have to agree at iteration 1
to between 3e-20 and 9e-20 in corridor fraction — three to four orders below one
float64 ULP. No port in any language can deliver that.

Two hypotheses died on the way, and both are worth recording because both are
the obvious guesses:

- **It is not the active set.** Forcing the perturbed run to replay the baseline
  free mask at all 200 iterations drove the flip count to zero and made parity
  *worse*, up to 1.96 m. The discrete branch is a symptom of divergence, not its
  cause.
- **A smaller budget does not rescue it.** The per-track ceiling is 50
  iterations, where Adria's margin is 4.95e-06 against a 1e-5 gate — a factor of
  two, on a quantity that grows by a decade every 14 iterations. That is roughly
  four iterations of headroom, on one machine's numpy and BLAS. It is a flaky
  test with a due date. And at 50 iterations the method is *slower* on the worst
  circuit than what ships today.

## Consequences

- `minimum_bending_path` keeps a method that is worse at optimising and better at
  being reproducible. That trade is deliberate, and this ADR is where it is
  written down.
- The lap time keeps its dependence on `path_smoothing_iterations`. It is
  reported honestly — the solver says `iteration_limit`, and the interface says
  the convergence criterion was not reached — and it is characterised in
  [VALIDATION_REPORT.md](../VALIDATION_REPORT.md).
- A future fix must attack the conditioning rather than the iteration: a better
  preconditioner that is a fixed linear operator, a coarser parameterisation, or
  a reformulation with a smaller condition number. Anything whose iteration map
  amplifies roundoff will fail parity no matter how well it converges.
- Dropping one implementation would lift the constraint entirely. That is a
  bigger decision than this one and belongs in its own ADR; ADR 0001 lists the
  reasons the second implementation exists.
- Anyone measuring a replacement should baseline against **shipped @ 20**, which
  is what runs — 23–34 ms per solve on the committed circuits. Baselining against
  shipped @ 200 (357–429 ms) makes a slower method look faster; that error was
  made once during this investigation and nearly reversed the conclusion.

## Alternatives considered

- **Raise the `path_smoothing_iterations` cap.** The shipped method does reach
  its own fixed point given 5,905 (Castelo Branco) to 45,244 (serpentine)
  iterations, at 12–45 s per solve against a 0.03 s budget today. Rejected on
  cost.
- **Relax the convergence tolerance so it reports success inside the budget.**
  Would require raising it from 1e-5 to about 8e-2 — the cap of the residual
  itself — and would stamp `converged` on a serpentine lap 12.5% slow. This is
  the suppression `AGENTS.md` forbids. Rejected.
- **Rescale `projected_residual` relative to its initial value.** Measured to
  change no path on any shipped input, and the existing criterion was verified
  correct: it reads 5.4e-9 to 1.6e-6 at the true optimum, three or more orders
  below its own threshold. It is a working test that the solver never satisfies
  because it never arrives. Rejected as a change with no effect.
