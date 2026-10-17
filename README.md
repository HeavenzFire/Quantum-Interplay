# Quantum Interplay — Reproducible Lattice Experiments

This repository collects reproducible numerical experiments on graph-based tight-binding models, geometry-inspired coupling, phase evolution, and disorder robustness.

## Scientific scope

The first experiment, Batch 8, is a **classical CPU simulation** of a single-particle tight-binding Hamiltonian on a periodic 4×4×4 cubic graph. It compares:
- uniform nearest-neighbour hopping;
- gyroid-field-modulated hopping strengths;
- a shuffled-weight control preserving the same weight multiset.

The state evolves as

\[
i\partial_t |\psi(t)\rangle = H|\psi(t)\rangle, \quad \hbar=1.
\]

The code checks Hermiticity, real eigenvalues, and norm conservation. Its output is a model-specific result, not evidence of quantum advantage, a physical gyroid material, or topological protection.

## Reproduce Batch 8

Requirements: Python 3.12+, NumPy, SciPy.

```powershell
python -m pip install numpy scipy
python experiments/phase_batch8_tight_binding.py
```

The script writes a JSON report and CSV trajectories beside itself. It uses a fixed seed.

## Research gates

1. Reproduce the baseline from a clean environment.
2. Run paired disorder sweeps over independent random seeds.
3. Report paired effect sizes and confidence intervals against both controls.
4. Expand to lead-coupled transmission only after the closed-system model is independently checked.
5. Preserve failed and null results; do not claim an advantage unless a predeclared metric survives controls.

## Status

- Batch 8: executed on Windows 11 / Python 3.12.3 with NumPy 1.26.4 and SciPy 1.13.1; the run reported 9/9 numerical checks passing.
- Batch 9: planned as a paired disorder-robustness study. Do not treat it as complete until its script runs and its report is independently reviewed.

## Limitations

This is a simplified toy lattice. It does not represent an atomistically resolved gyroid, a calibrated device, or quantum hardware. Model differences depend on the Hamiltonian, boundary conditions, target sites, and observation window.

## License

License selection is pending. Do not assume reuse terms until a license file is added.
