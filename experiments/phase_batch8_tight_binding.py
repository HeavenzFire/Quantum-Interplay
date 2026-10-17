"""Batch 8: gyroid-inspired tight-binding toy model.
Classical numerical simulation only; not a physical quantum-device result.
"""
import csv
import hashlib
import json
import math
import platform
import sys
from pathlib import Path

import numpy as np
from scipy.linalg import eigh

OUT = Path(__file__).resolve().parent
N = 4
M = N**3
ALPHA = 0.35
TIMES = np.linspace(0.0, 8.0, 321)
SEED = 20261017


def idx(x, y, z):
    return (x % N) + N * ((y % N) + N * (z % N))


def gyroid(x, y, z):
    a, b, c = 2 * math.pi * x, 2 * math.pi * y, 2 * math.pi * z
    return (
        math.sin(a) * math.cos(b)
        + math.sin(b) * math.cos(c)
        + math.sin(c) * math.cos(a)
    )


edges = []
for z in range(N):
    for y in range(N):
        for x in range(N):
            i = idx(x, y, z)
            for dx, dy, dz in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
                j = idx(x + dx, y + dy, z + dz)
                mx, my, mz = (
                    (x + 0.5 * dx) % N,
                    (y + 0.5 * dy) % N,
                    (z + 0.5 * dz) % N,
                )
                edges.append((i, j, gyroid(mx / N, my / N, mz / N)))

rng = np.random.default_rng(SEED)
gyroid_weights = np.array([1.0 + ALPHA * math.tanh(p) for _, _, p in edges])
shuffled_weights = gyroid_weights.copy()
rng.shuffle(shuffled_weights)


def build_h(weights):
    h = np.zeros((M, M), dtype=np.float64)
    for (i, j, _), weight in zip(edges, weights):
        h[i, j] = h[j, i] = -float(weight)
    return h


arms = {
    "uniform_cubic": build_h(np.ones(len(edges))),
    "gyroid_modulated": build_h(gyroid_weights),
    "shuffled_weight_control": build_h(shuffled_weights),
}
source, target = idx(0, 0, 0), idx(2, 2, 2)
results, checks, all_rows = {}, [], []

for name, h in arms.items():
    herm_err = float(np.max(np.abs(h - h.T.conj())))
    eigvals, eigvecs = eigh(h)
    coeff = eigvecs[source, :].conj()
    rows, max_norm_err = [], 0.0
    peak = {"probability": -1.0, "time": 0.0}

    for t in TIMES:
        psi = eigvecs @ (np.exp(-1j * eigvals * t) * coeff)
        norm_err = abs(float(np.vdot(psi, psi).real) - 1.0)
        max_norm_err = max(max_norm_err, norm_err)
        probability = float(abs(psi[target]) ** 2)
        rows.append({
            "arm": name, "time": float(t),
            "target_probability": probability, "norm_error": norm_err,
        })
        if probability > peak["probability"]:
            peak = {"probability": probability, "time": float(t)}

    checks.extend([
        {"name": name + "_hermitian", "pass": herm_err < 1e-12, "value": herm_err},
        {"name": name + "_real_spectrum", "pass": np.isrealobj(eigvals), "value": 0.0},
        {"name": name + "_norm_conservation", "pass": max_norm_err < 1e-10, "value": max_norm_err},
    ])
    weights = (
        np.ones(len(edges)) if name == "uniform_cubic"
        else gyroid_weights if name == "gyroid_modulated"
        else shuffled_weights
    )
    results[name] = {
        "nodes": M, "undirected_edges": len(edges),
        "hermiticity_max_abs_error": herm_err,
        "spectrum_min": float(eigvals[0]), "spectrum_max": float(eigvals[-1]),
        "spectral_bandwidth": float(eigvals[-1] - eigvals[0]),
        "max_norm_error": max_norm_err, "source_node": source, "target_node": target,
        "peak_target_probability": peak["probability"], "peak_time": peak["time"],
        "weights_min": float(np.min(weights)), "weights_max": float(np.max(weights)),
    }
    all_rows.extend(rows)

report = {
    "title": "HeavenzFire Batch 8 - gyroid-inspired tight-binding toy model",
    "status": "PASS" if all(item["pass"] for item in checks) else "FAIL",
    "checks_passed": sum(item["pass"] for item in checks),
    "checks_total": len(checks), "seed": SEED, "grid": [N, N, N],
    "boundary_conditions": "periodic",
    "model": "single-particle tight-binding Hamiltonian with real symmetric nearest-neighbour hopping",
    "gyroid_weight_rule": "w_e = 1 + alpha*tanh(g(midpoint)), alpha=0.35",
    "controls": ["uniform cubic lattice", "shuffled gyroid-derived weights with same weight multiset"],
    "simulation": "classical eigendecomposition; psi(t)=exp(-iHt)psi(0), hbar=1",
    "time_points": len(TIMES), "results": results, "checks": checks,
    "limitations": [
        "Toy gyroid-inspired hopping modulation, not an atomistic gyroid material.",
        "Closed single-particle system; no leads, disorder ensemble, interactions, or device noise.",
        "Model differences do not establish quantum advantage or topological protection.",
        "Classical CPU calculation; no physical quantum hardware used.",
    ],
    "python": sys.version, "platform": platform.platform(), "numpy": np.__version__,
}
report_path = OUT / "phase-batch8-tight-binding-report.json"
csv_path = OUT / "phase-batch8-tight-binding-trajectories.csv"
report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
with csv_path.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=[
        "arm", "time", "target_probability", "norm_error"
    ])
    writer.writeheader()
    writer.writerows(all_rows)
report["report_sha256"] = hashlib.sha256(report_path.read_bytes()).hexdigest()
report["trajectory_csv_sha256"] = hashlib.sha256(csv_path.read_bytes()).hexdigest()
report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({
    "status": report["status"], "checks_passed": report["checks_passed"],
    "checks_total": report["checks_total"], "nodes": M, "edges": len(edges),
    "report": report_path.name, "trajectories": csv_path.name,
    "report_sha256": report["report_sha256"],
    "trajectory_csv_sha256": report["trajectory_csv_sha256"],
}, indent=2))
raise SystemExit(0 if report["status"] == "PASS" else 1)
