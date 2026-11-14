"""Batch 11: cross-topology generalization for gyroid-inspired coupling.

Classical CPU tight-binding simulations only. Compares simple-cubic and
body-centered-cubic periodic graphs; neither is a physical gyroid material.
All reported comparisons use paired nonzero-disorder replicates.
"""
import csv
import hashlib
import json
import math
import platform
import sys
import time
from pathlib import Path

import numpy as np
import scipy
from scipy.integrate import trapezoid
from scipy.linalg import eigh
from scipy.stats import t as student_t

OUT = Path(__file__).resolve().parent
N = 4
CELL_COUNT = N ** 3
ALPHA = 0.35
GAMMA = 0.577215664901532860606512090082402431042159335939923598805767
MULTIPLIERS = [0.25, 0.5, GAMMA, 1.0]
DISORDER_LEVELS = [0.10, 0.25, 0.50]
N_REPLICATES = 12
MASTER_SEED = 20261114
TIMES = np.linspace(0.0, 8.0, 81)
METRICS = ("peak_probability", "time_average_probability")


def idx(x, y, z):
    return (x % N) + N * ((y % N) + N * (z % N))


def gyroid(x, y, z):
    a, b, c = 2 * math.pi * x, 2 * math.pi * y, 2 * math.pi * z
    return (
        math.sin(a) * math.cos(b)
        + math.sin(b) * math.cos(c)
        + math.sin(c) * math.cos(a)
    )


def build_simple_cubic():
    edges = []
    for z in range(N):
        for y in range(N):
            for x in range(N):
                i = idx(x, y, z)
                for dx, dy, dz in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
                    j = idx(x + dx, y + dy, z + dz)
                    midpoint = (
                        (x + 0.5 * dx) % N,
                        (y + 0.5 * dy) % N,
                        (z + 0.5 * dz) % N,
                    )
                    profile = gyroid(*(v / N for v in midpoint))
                    edges.append((i, j, profile))
    return {
        "name": "simple_cubic_periodic",
        "nodes": CELL_COUNT,
        "edges": edges,
        "pairs": [(0, 42), (5, 58), (21, 47)],
    }


def build_body_centered_cubic():
    # Two interpenetrating sublattices: integer corners (A) and body centers (B).
    # Each A site connects to its eight nearest B sites under periodic boundaries.
    edges = []
    for z in range(N):
        for y in range(N):
            for x in range(N):
                i = idx(x, y, z)
                for dx in (0, -1):
                    for dy in (0, -1):
                        for dz in (0, -1):
                            cx, cy, cz = x + dx, y + dy, z + dz
                            j = CELL_COUNT + idx(cx, cy, cz)
                            bpos = (
                                (cx + 0.5) % N,
                                (cy + 0.5) % N,
                                (cz + 0.5) % N,
                            )
                            midpoint = (
                                ((x + bpos[0]) / 2.0) % N,
                                ((y + bpos[1]) / 2.0) % N,
                                ((z + bpos[2]) / 2.0) % N,
                            )
                            profile = gyroid(*(v / N for v in midpoint))
                            edges.append((i, j, profile))
    return {
        "name": "body_centered_cubic_periodic",
        "nodes": 2 * CELL_COUNT,
        "edges": edges,
        "pairs": [
            (idx(0, 0, 0), idx(2, 2, 2)),
            (idx(0, 0, 0), CELL_COUNT + idx(0, 0, 0)),
            (idx(1, 2, 0), CELL_COUNT + idx(2, 2, 1)),
        ],
    }


def confidence_interval(values):
    values = np.asarray(values, dtype=float)
    n = len(values)
    mean = float(np.mean(values))
    if n < 2:
        return {
            "mean": mean,
            "ci95_low": None,
            "ci95_high": None,
            "n": n,
            "interval_status": "not_estimable",
        }
    half = float(
        student_t.ppf(0.975, n - 1)
        * np.std(values, ddof=1)
        / math.sqrt(n)
    )
    return {
        "mean": mean,
        "ci95_low": mean - half,
        "ci95_high": mean + half,
        "n": n,
        "interval_status": "approximate_paired_t",
    }


def simulate(topology, weights):
    node_count = topology["nodes"]
    hamiltonian = np.zeros((node_count, node_count), dtype=np.float64)
    for (i, j, _), weight in zip(topology["edges"], weights):
        hamiltonian[i, j] = hamiltonian[j, i] = -float(weight)

    hermiticity_error = float(
        np.max(np.abs(hamiltonian - hamiltonian.T.conj()))
    )
    eigenvalues, eigenvectors = eigh(hamiltonian)

    # Vectorize time evolution: one phase matrix and one matrix multiply per source.
    phases = np.exp(-1j * np.outer(TIMES, eigenvalues))
    max_norm_error = 0.0
    results = {}
    for source, target in topology["pairs"]:
        coefficients = eigenvectors[source, :].conj()
        states = (phases * coefficients[None, :]) @ eigenvectors.conj().T
        norms = np.sum(np.abs(states) ** 2, axis=1)
        max_norm_error = max(
            max_norm_error,
            float(np.max(np.abs(norms - 1.0))),
        )
        probabilities = np.abs(states[:, target]) ** 2
        results[f"{source}->{target}"] = {
            "peak_probability": float(np.max(probabilities)),
            "time_average_probability": float(
                trapezoid(probabilities, TIMES) / (TIMES[-1] - TIMES[0])
            ),
        }

    return (
        results,
        hermiticity_error,
        max_norm_error,
        float(np.min(weights)),
        np.isrealobj(eigenvalues),
    )


started = time.time()
topologies = [build_simple_cubic(), build_body_centered_cubic()]
rows = []
checks = []
lookup = {}

for topology_index, topology in enumerate(topologies):
    profile = np.asarray([math.tanh(edge[2]) for edge in topology["edges"]])
    for disorder in DISORDER_LEVELS:
        for replicate in range(N_REPLICATES):
            seed = (
                MASTER_SEED
                + topology_index * 100000
                + int(disorder * 10000)
                + replicate * 1009
            )
            rng = np.random.default_rng(seed)
            perturbation = rng.uniform(-1.0, 1.0, size=len(topology["edges"]))
            shuffled_profile = profile[rng.permutation(len(profile))]

            for multiplier in MULTIPLIERS:
                base_arms = {
                    "gyroid": 1.0 + ALPHA * multiplier * profile,
                    "shuffled": 1.0 + ALPHA * multiplier * shuffled_profile,
                    "uniform": np.ones(len(topology["edges"])),
                }
                for arm, base_weights in base_arms.items():
                    weights = base_weights * (1.0 + disorder * perturbation)
                    (
                        metrics,
                        hermiticity_error,
                        norm_error,
                        minimum_hopping,
                        eigenvalues_real,
                    ) = simulate(topology, weights)

                    checks.extend(
                        [
                            hermiticity_error < 1e-12,
                            norm_error < 1e-10,
                            minimum_hopping > 0.0,
                            eigenvalues_real,
                        ]
                    )

                    for pair, values in metrics.items():
                        row = {
                            "topology": topology["name"],
                            "disorder": disorder,
                            "replicate": replicate,
                            "seed": seed,
                            "multiplier": multiplier,
                            "arm": arm,
                            "pair": pair,
                            **values,
                            "hermiticity_error": hermiticity_error,
                            "max_norm_error": norm_error,
                            "minimum_hopping": minimum_hopping,
                        }
                        rows.append(row)
                        key = (
                            topology["name"],
                            disorder,
                            replicate,
                            round(multiplier, 12),
                            arm,
                            pair,
                        )
                        lookup[key] = row


def value(topology, disorder, replicate, multiplier, arm, pair, metric):
    key = (
        topology,
        disorder,
        replicate,
        round(multiplier, 12),
        arm,
        pair,
    )
    return lookup[key][metric]


gamma_rankings = {}
gamma_vs_multipliers = []
gamma_vs_controls = []

for topology in topologies:
    topology_name = topology["name"]
    for disorder in DISORDER_LEVELS:
        for source, target in topology["pairs"]:
            pair = f"{source}->{target}"
            means = []
            for multiplier in MULTIPLIERS:
                samples = [
                    value(
                        topology_name, disorder, replicate, multiplier,
                        "gyroid", pair, "peak_probability"
                    )
                    for replicate in range(N_REPLICATES)
                ]
                means.append((multiplier, float(np.mean(samples))))

            ranked = sorted(means, key=lambda item: item[1], reverse=True)
            gamma_rankings[
                f"{topology_name};disorder={disorder};pair={pair}"
            ] = {
                "best_multiplier_in_finite_grid": ranked[0][0],
                "gamma_rank": next(
                    i + 1
                    for i, item in enumerate(ranked)
                    if abs(item[0] - GAMMA) < 1e-12
                ),
                "gamma_mean_peak_probability": next(
                    mean for multiplier, mean in means
                    if abs(multiplier - GAMMA) < 1e-12
                ),
                "multiplier_mean_peak_probabilities": {
                    str(multiplier): mean for multiplier, mean in means
                },
            }

            for metric in METRICS:
                for comparator in (0.25, 0.5, 1.0):
                    differences = [
                        value(
                            topology_name, disorder, replicate, GAMMA,
                            "gyroid", pair, metric
                        )
                        - value(
                            topology_name, disorder, replicate, comparator,
                            "gyroid", pair, metric
                        )
                        for replicate in range(N_REPLICATES)
                    ]
                    gamma_vs_multipliers.append(
                        {
                            "topology": topology_name,
                            "disorder": disorder,
                            "pair": pair,
                            "metric": metric,
                            "gamma_minus_multiplier": comparator,
                            "paired_difference_ci95": confidence_interval(differences),
                        }
                    )

                for control in ("shuffled", "uniform"):
                    differences = [
                        value(
                            topology_name, disorder, replicate, GAMMA,
                            "gyroid", pair, metric
                        )
                        - value(
                            topology_name, disorder, replicate, GAMMA,
                            control, pair, metric
                        )
                        for replicate in range(N_REPLICATES)
                    ]
                    gamma_vs_controls.append(
                        {
                            "topology": topology_name,
                            "disorder": disorder,
                            "pair": pair,
                            "metric": metric,
                            "comparison": f"gyroid_minus_{control}",
                            "paired_difference_ci95": confidence_interval(differences),
                        }
                    )

report = {
    "title": "HeavenzFire Batch 11 - cross-topology generalization",
    "status": "PASS" if all(checks) else "FAIL",
    "numerical_checks": {
        "passed": int(sum(checks)),
        "total": len(checks),
        "criteria": (
            "Hermiticity error <1e-12; state norm error <1e-10; "
            "positive hopping weights; real eigenvalues."
        ),
    },
    "design": {
        "classification": (
            "Classical CPU finite-dimensional single-particle tight-binding "
            "toy models; not quantum hardware or a physical gyroid material."
        ),
        "topologies": [
            {
                "name": topology["name"],
                "nodes": topology["nodes"],
                "undirected_edges": len(topology["edges"]),
                "source_target_pairs": [list(pair) for pair in topology["pairs"]],
            }
            for topology in topologies
        ],
        "alpha": ALPHA,
        "weight_rule": "w_e = (1 + alpha * multiplier * tanh(gyroid(midpoint))) * (1 + disorder * paired_noise)",
        "multipliers_predeclared": MULTIPLIERS,
        "euler_mascheroni_gamma": GAMMA,
        "disorder_levels": DISORDER_LEVELS,
        "replicates_per_level": N_REPLICATES,
        "master_seed": MASTER_SEED,
        "paired_design": (
            "Within each topology/disorder/replicate, the same edge-wise "
            "disorder vector is used across all multipliers and arms; the "
            "shuffled control preserves the gyroid profile value multiset."
        ),
        "zero_disorder_policy": (
            "Zero disorder is excluded from inferential comparisons so "
            "deterministic repetitions cannot masquerade as independent samples."
        ),
        "metrics": list(METRICS),
        "confidence_intervals": (
            "Two-sided 95% Student-t intervals on paired replicate differences; "
            "approximate with 12 replicates."
        ),
        "time_window": [float(TIMES[0]), float(TIMES[-1])],
        "time_samples": len(TIMES),
        "implementation_performance": (
            "Time propagation is vectorized across the time grid; one eigendecomposition "
            "is reused for all source-target pairs within each Hamiltonian."
        ),
    },
    "gamma_rankings": gamma_rankings,
    "gamma_vs_multipliers_paired_intervals": gamma_vs_multipliers,
    "gamma_vs_controls_paired_intervals": gamma_vs_controls,
    "interpretation": [
        "Ranks are conditional on the finite multiplier grid, graph, node pairs, disorder, time window and metric.",
        "A rank that changes across topology or source-target pairs is evidence against a universal optimum.",
        "Intervals containing zero do not establish a difference.",
        "No physical law, quantum advantage, material property or universal role for gamma is established.",
    ],
    "limitations": [
        "Only two idealized periodic graph topologies are modeled.",
        "The scalar field is gyroid-inspired; the graph is not a true gyroid minimal surface.",
        "Twelve paired replicates per nonzero disorder level; Student-t intervals are approximate.",
        "Closed single-particle systems omit leads, interactions, thermal effects and calibrated device noise.",
        "Simulation performance does not establish performance on physical quantum hardware.",
    ],
    "runtime_seconds": round(time.time() - started, 3),
    "environment": {
        "python": sys.version,
        "platform": platform.platform(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
    },
}

report_path = OUT / "phase-batch11-cross-topology-report.json"
csv_path = OUT / "phase-batch11-cross-topology-replicates.csv"
report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
with csv_path.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

print(
    json.dumps(
        {
            "status": report["status"],
            "numerical_checks": report["numerical_checks"],
            "gamma_rankings": gamma_rankings,
            "runtime_seconds": report["runtime_seconds"],
            "report_sha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
            "replicates_sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest(),
        },
        indent=2,
    )
)
if report["status"] != "PASS":
    raise SystemExit(1)
