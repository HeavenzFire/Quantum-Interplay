"""Batch 9: paired disorder-robustness study for gyroid-inspired tight-binding models.
Classical CPU simulation only; not a physical quantum-device experiment.
"""
import csv
import json
import math
import platform
import sys
import time
from pathlib import Path

import numpy as np
from scipy.integrate import trapezoid
from scipy.linalg import eigh
from scipy.stats import t as student_t

OUT = Path(__file__).resolve().parent
N = 4
M = N**3
ALPHA = 0.35
DISORDER_LEVELS = [0.0, 0.10, 0.25, 0.50]
N_REPLICATES = 32
TIMES = np.linspace(0.0, 8.0, 161)
MASTER_SEED = 20261018
SOURCE, TARGET = 0, 42


def idx(x, y, z):
    return (x % N) + N * ((y % N) + N * (z % N))


def gyroid(x, y, z):
    a, b, c = 2 * math.pi * x, 2 * math.pi * y, 2 * math.pi * z
    return math.sin(a) * math.cos(b) + math.sin(b) * math.cos(c) + math.sin(c) * math.cos(a)


edges = []
for z in range(N):
    for y in range(N):
        for x in range(N):
            i = idx(x, y, z)
            for dx, dy, dz in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
                j = idx(x + dx, y + dy, z + dz)
                mx, my, mz = ((x + 0.5 * dx) % N, (y + 0.5 * dy) % N, (z + 0.5 * dz) % N)
                edges.append((i, j, gyroid(mx / N, my / N, mz / N)))

rng0 = np.random.default_rng(MASTER_SEED)
gyroid_weights = np.array([1.0 + ALPHA * math.tanh(p) for _, _, p in edges])
shuffled_weights = gyroid_weights.copy()
rng0.shuffle(shuffled_weights)
base_weights = {
    "uniform_cubic": np.ones(len(edges)),
    "gyroid_modulated": gyroid_weights,
    "shuffled_weight_control": shuffled_weights,
}


def build_h(weights):
    h = np.zeros((M, M), dtype=float)
    for (i, j, _), w in zip(edges, weights):
        h[i, j] = h[j, i] = -float(w)
    return h


def ci95(values):
    a = np.asarray(values, dtype=float)
    n = len(a)
    mean = float(np.mean(a))
    if n < 2:
        return {"mean": mean, "ci95_low": None, "ci95_high": None, "n": n}
    se = float(np.std(a, ddof=1) / math.sqrt(n))
    half = float(student_t.ppf(0.975, n - 1) * se)
    return {"mean": mean, "ci95_low": mean - half, "ci95_high": mean + half, "n": n}


started = time.time()
rows, checks = [], []
for disorder in DISORDER_LEVELS:
    for rep in range(N_REPLICATES):
        seed = MASTER_SEED + int(disorder * 10000) + rep * 1009
        rng = np.random.default_rng(seed)
        # Paired design: each arm receives the same edge perturbation vector.
        perturb = rng.uniform(-1.0, 1.0, size=len(edges))
        for arm, weights in base_weights.items():
            actual = weights * (1.0 + disorder * perturb)
            h = build_h(actual)
            herm_err = float(np.max(np.abs(h - h.T)))
            eigvals, eigvecs = eigh(h)
            coeff = eigvecs[SOURCE, :].conj()
            probs = []
            max_norm_err = 0.0
            for tm in TIMES:
                psi = eigvecs @ (np.exp(-1j * eigvals * tm) * coeff)
                norm_err = abs(float(np.vdot(psi, psi).real) - 1.0)
                max_norm_err = max(max_norm_err, norm_err)
                probs.append(float(abs(psi[TARGET]) ** 2))
            probs = np.asarray(probs)
            peak_idx = int(np.argmax(probs))
            checks.extend([
                herm_err < 1e-12,
                max_norm_err < 1e-10,
                float(np.min(actual)) > 0.0,
                np.isrealobj(eigvals),
            ])
            rows.append({
                "disorder_level": disorder, "replicate": rep, "seed": seed, "arm": arm,
                "peak_probability": float(probs[peak_idx]),
                "peak_time": float(TIMES[peak_idx]),
                "time_average_probability": float(trapezoid(probs, TIMES) / (TIMES[-1] - TIMES[0])),
                "spectral_bandwidth": float(eigvals[-1] - eigvals[0]),
                "max_norm_error": max_norm_err,
                "hermiticity_error": herm_err,
                "minimum_hopping": float(np.min(actual)),
            })

metrics = ("peak_probability", "time_average_probability", "spectral_bandwidth")
summary = {}
for disorder in DISORDER_LEVELS:
    group = [r for r in rows if r["disorder_level"] == disorder]
    entry = {"arms": {}, "paired_differences_gyroid_minus_controls": {}}
    for arm in base_weights:
        arm_rows = [r for r in group if r["arm"] == arm]
        entry["arms"][arm] = {m: ci95([r[m] for r in arm_rows]) for m in metrics}
        entry["arms"][arm]["max_norm_error"] = max(r["max_norm_error"] for r in arm_rows)
        entry["arms"][arm]["max_hermiticity_error"] = max(r["hermiticity_error"] for r in arm_rows)
    for control in ("uniform_cubic", "shuffled_weight_control"):
        paired = {}
        for metric in ("peak_probability", "time_average_probability"):
            diffs = []
            for rep in range(N_REPLICATES):
                gy = next(r[metric] for r in group if r["replicate"] == rep and r["arm"] == "gyroid_modulated")
                co = next(r[metric] for r in group if r["replicate"] == rep and r["arm"] == control)
                diffs.append(gy - co)
            paired[metric] = ci95(diffs)
        entry["paired_differences_gyroid_minus_controls"][control] = paired
    summary[str(disorder)] = entry

report = {
    "title": "HeavenzFire Batch 9 - paired disorder robustness study",
    "status": "PASS" if all(checks) else "FAIL",
    "numerical_checks_passed": int(sum(checks)),
    "numerical_checks_total": len(checks),
    "grid": [N, N, N], "nodes": M, "undirected_edges": len(edges),
    "source_node": SOURCE, "target_node": TARGET,
    "time_window": [float(TIMES[0]), float(TIMES[-1])],
    "time_points_per_trajectory": len(TIMES),
    "replicates_per_disorder_level": N_REPLICATES,
    "disorder_levels": DISORDER_LEVELS, "master_seed": MASTER_SEED,
    "paired_design": "Same edge-wise disorder vector applied to all three arms within each replicate.",
    "model": "Closed single-particle tight-binding model; H real symmetric; psi(t)=exp(-iHt)psi(0); hbar=1.",
    "confidence_intervals": "Two-sided 95% Student-t intervals; paired intervals for gyroid-minus-control differences.",
    "summary": summary,
    "limitations": [
        "Classical CPU simulation of a toy lattice, not a physical quantum device or material.",
        "Gyroid-inspired hopping modulation does not prove a true gyroid geometry or topological phase.",
        "Closed system without leads, interactions, or experimentally calibrated noise.",
        "Intervals crossing zero do not establish a difference for that metric and setting.",
        "A model difference does not establish quantum advantage or real-world device performance."
    ],
    "python": sys.version, "platform": platform.platform(), "numpy": np.__version__,
    "elapsed_seconds": round(time.time() - started, 3),
}
report_path = OUT / "phase-batch9-disorder-robustness-report.json"
csv_path = OUT / "phase-batch9-disorder-robustness-replicates.csv"
report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
with csv_path.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
print(json.dumps({
    "status": report["status"], "numerical_checks_passed": report["numerical_checks_passed"],
    "numerical_checks_total": report["numerical_checks_total"], "nodes": M,
    "edges": len(edges), "replicates_per_level": N_REPLICATES,
    "disorder_levels": DISORDER_LEVELS, "summary": summary,
    "elapsed_seconds": report["elapsed_seconds"],
    "report_path": str(report_path), "replicates_csv_path": str(csv_path),
}, indent=2))
raise SystemExit(0 if report["status"] == "PASS" else 1)
