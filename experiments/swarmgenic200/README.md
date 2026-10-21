# Swarmgenic 200-Equation Sandbox (first-pass smoke harness)

This branch stages a reproducible starting point for validating the 200 supplied optimization/statistical/phase equations. It is deliberately not merged into `main`.

## Local first-pass result

Run ID: `swarmgenic200-1792621334023`. Four concurrent bounded partitions processed IDs 1–200 (50 each); 200 family-invariant checks passed, zero failed, zero missing. The local artifacts are in `C:\Users\rucke\HeavenzFire\UnifiedField\QuantumLab\Swarmgenic200\artifacts`.

## Critical interpretation

The current runner invokes each of the 200 IDs but reuses only 16 family-level numerical invariants. **This is not 200 distinct formula-specific tests, symbolic proofs, or a claim of algorithmic advantage.** Every equation needs its own assumptions, domain, oracle, expected-value fixtures, boundary tests, and independent review before its status can be upgraded.

## Initial equation review queue

- Eq. 35: require symmetric proposal or use the Hastings correction (Eq. 37).
- Eqs. 45–46: correct `argmin`/`argmax` and acquisition signs for a cost-minimization problem.
- Eq. 47: define query-conditional information gain precisely.
- Eq. 144: phase-shifted cosine sum is not generally a symmetric positive-definite stationary kernel without constraints or symmetrization.
- Eqs. 147–148: specify how the objective depends on phase/amplitude before taking derivatives.
- Eq. 177: document pilot-variance and confidence-interval assumptions.
- Eq. 183: a positive visit-count term rewards revisits rather than penalizing them for novelty.

## Intended architecture

Four coordinators/workers can partition test IDs, while each equation gets an isolated micro-sandbox, immutable input fixture, bounded runtime, explicit expected output, and machine-readable evidence. The central collector should aggregate `PASS`, `FAIL`, `BLOCKED`, and `NOT_IMPLEMENTED` without collapsing them. AI workers may propose derivations and counterexamples; deterministic numerical or symbolic oracles must decide test status.

No generated code is executed by the current runner. This branch is a reviewable scaffold and is not yet a fully qualified scientific test suite.
