"""Batch 10: Euler-Mascheroni multiplier specificity test.

Classical CPU tight-binding toy simulation only. Tests whether Euler's constant
is unusually effective among a predeclared finite multiplier grid for a
gyroid-inspired hopping profile. It does not test a physical law.
"""
import csv, hashlib, json, math, platform, sys, time
from pathlib import Path
import numpy as np
from scipy.integrate import trapezoid
from scipy.linalg import eigh
from scipy.stats import t as student_t

OUT = Path(__file__).resolve().parent
N, M, ALPHA = 4, 64, 0.35
GAMMA = 0.577215664901532860606512090082402431042159335939923598805767
MULTIPLIERS = [0.25, 0.5, GAMMA, 0.75, 1.0, 1.25, 1.5, 1.0/GAMMA, 2.0]
DISORDER_LEVELS, N_REPLICATES, MASTER_SEED = [0.0, 0.10, 0.25, 0.50], 12, 20261114
TIMES = np.linspace(0.0, 8.0, 81)
PAIRS = [(0, 42), (5, 58), (21, 47)]

def idx(x, y, z): return (x % N) + N*((y % N) + N*(z % N))
def gyroid(x, y, z):
    a,b,c = 2*math.pi*x, 2*math.pi*y, 2*math.pi*z
    return math.sin(a)*math.cos(b)+math.sin(b)*math.cos(c)+math.sin(c)*math.cos(a)

edges=[]
for z in range(N):
    for y in range(N):
        for x in range(N):
            i=idx(x,y,z)
            for dx,dy,dz in ((1,0,0),(0,1,0),(0,0,1)):
                j=idx(x+dx,y+dy,z+dz)
                mx,my,mz=((x+.5*dx)%N,(y+.5*dy)%N,(z+.5*dz)%N)
                edges.append((i,j,gyroid(mx/N,my/N,mz/N)))
PROFILE=np.asarray([math.tanh(p) for _,_,p in edges])

def ci(values):
    a=np.asarray(values,float); n=len(a); mean=float(np.mean(a))
    half=float(student_t.ppf(.975,n-1)*np.std(a,ddof=1)/math.sqrt(n)) if n>1 else None
    return {"mean":mean,"ci95_low":mean-half if half is not None else None,
            "ci95_high":mean+half if half is not None else None,"n":n}

def simulate(weights):
    h=np.zeros((M,M),dtype=np.float64)
    for (i,j,_),w in zip(edges,weights): h[i,j]=h[j,i]=-float(w)
    herm=float(np.max(np.abs(h-h.T.conj())))
    ev,vec=eigh(h); norm=0.; result={}
    for src,dst in PAIRS:
        coeff=vec[src,:].conj(); probs=[]
        for tm in TIMES:
            psi=vec@(np.exp(-1j*ev*tm)*coeff)
            norm=max(norm,abs(float(np.vdot(psi,psi).real)-1.))
            probs.append(float(abs(psi[dst])**2))
        probs=np.asarray(probs)
        result[f"{src}->{dst}"]={"peak_probability":float(np.max(probs)),
            "time_average_probability":float(trapezoid(probs,TIMES)/(TIMES[-1]-TIMES[0]))}
    return result,herm,norm,float(np.min(weights))

started=time.time(); rows=[]; checks=[]
for disorder in DISORDER_LEVELS:
    for rep in range(N_REPLICATES):
        seed=MASTER_SEED+int(disorder*10000)+rep*1009
        rng=np.random.default_rng(seed)
        perturb=rng.uniform(-1.,1.,size=len(edges))
        shuffled=PROFILE[rng.permutation(len(edges))]
        for mult in MULTIPLIERS:
            arms={"gyroid":1.+ALPHA*mult*PROFILE,
                  "shuffled":1.+ALPHA*mult*shuffled,
                  "uniform":np.ones(len(edges))}
            for arm,base in arms.items():
                weights=base*(1.+disorder*perturb)
                metrics,herm,norm,minw=simulate(weights)
                checks.extend([herm<1e-12,norm<1e-10,minw>0.])
                for pair,values in metrics.items():
                    rows.append({"disorder":disorder,"replicate":rep,"seed":seed,
                        "multiplier":mult,"arm":arm,"pair":pair,**values,
                        "hermiticity_error":herm,"max_norm_error":norm,"minimum_hopping":minw})

def get_value(disorder,rep,mult,arm,pair,metric):
    return next(r[metric] for r in rows if r["disorder"]==disorder and r["replicate"]==rep
        and abs(r["multiplier"]-mult)<1e-12 and r["arm"]==arm and r["pair"]==pair)

gamma_vs=[]; control_comparisons=[]; rankings={}
for disorder in DISORDER_LEVELS:
    for src,dst in PAIRS:
        pair=f"{src}->{dst}"; means=[]
        for mult in MULTIPLIERS:
            vals=[get_value(disorder,rep,mult,"gyroid",pair,"peak_probability") for rep in range(N_REPLICATES)]
            means.append((mult,float(np.mean(vals))))
        ranked=sorted(means,key=lambda x:x[1],reverse=True)
        rankings[f"disorder={disorder};pair={pair}"]={
            "best_multiplier_in_finite_grid":ranked[0][0],
            "gamma_rank":next(i+1 for i,x in enumerate(ranked) if abs(x[0]-GAMMA)<1e-12),
            "gamma_mean_peak_probability":next(v for m,v in means if abs(m-GAMMA)<1e-12),
            "multiplier_mean_peak_probabilities":{str(m):v for m,v in means}}
        for metric in ("peak_probability","time_average_probability"):
            for comparator in (1.0,0.25,0.5,1.0/GAMMA):
                diffs=[get_value(disorder,r,GAMMA,"gyroid",pair,metric)-
                       get_value(disorder,r,comparator,"gyroid",pair,metric) for r in range(N_REPLICATES)]
                gamma_vs.append({"disorder":disorder,"pair":pair,"metric":metric,
                    "gamma_minus_multiplier":comparator,"paired_difference_ci95":ci(diffs)})
            for mult in MULTIPLIERS:
                for control in ("shuffled","uniform"):
                    diffs=[get_value(disorder,r,mult,"gyroid",pair,metric)-
                           get_value(disorder,r,mult,control,pair,metric) for r in range(N_REPLICATES)]
                    control_comparisons.append({"disorder":disorder,"pair":pair,"metric":metric,
                        "multiplier":mult,"comparison":f"gyroid_minus_{control}","paired_difference_ci95":ci(diffs)})

report={"title":"HeavenzFire Batch 10 - Euler-Mascheroni multiplier specificity",
 "status":"PASS" if all(checks) else "FAIL",
 "numerical_checks":{"passed":int(sum(checks)),"total":len(checks),
  "criteria":"Hermiticity error <1e-12; state norm error <1e-10; positive hopping weights under this multiplicative-disorder design."},
 "design":{"classification":"Classical CPU finite-dimensional single-particle tight-binding toy model; not quantum hardware.",
  "grid":[N,N,N],"nodes":M,"undirected_edges":len(edges),"alpha":ALPHA,
  "weight_rule":"w_e = 1 + alpha * multiplier * tanh(gyroid(midpoint))",
  "multipliers_predeclared":MULTIPLIERS,"euler_mascheroni_gamma":GAMMA,
  "disorder_levels":DISORDER_LEVELS,"replicates_per_level":N_REPLICATES,
  "source_target_pairs":[list(p) for p in PAIRS],"time_window":[0.,8.],"time_samples":len(TIMES),
  "paired_design":"Same replicate disorder vector applied to all multipliers and arms; shuffled control preserves the gyroid profile value multiset.",
  "master_seed":MASTER_SEED,"metrics":["peak target probability","time-averaged target probability"]},
 "gamma_rankings":rankings,"gamma_vs_control_paired_intervals":gamma_vs,
 "gyroid_vs_shuffled_and_uniform":control_comparisons,
 "interpretation":["Gamma ranks are conditional on this finite multiplier grid, graph, node pairs, time window and metric.",
  "Paired intervals containing zero do not establish a difference.",
  "No physical law, material property, quantum advantage or universal role for gamma is established."],
 "limitations":["One 4x4x4 periodic graph and one gyroid-inspired scalar profile.",
  "Three fixed source-target pairs and one finite time window.",
  "Twelve paired replicates per disorder level; Student-t intervals are approximate.",
  "Peak-over-time can favor temporal alignment; time-average is included as a companion metric.",
  "Classical CPU eigendecomposition only; no physical quantum device or material."],
 "runtime_seconds":round(time.time()-started,3),
 "environment":{"python":sys.version,"platform":platform.platform(),"numpy":np.__version__}}
report_path=OUT/"phase-batch10-euler-gamma-report.json"
csv_path=OUT/"phase-batch10-euler-gamma-replicates.csv"
report_path.write_text(json.dumps(report,indent=2),encoding="utf-8")
with csv_path.open("w",newline="",encoding="utf-8") as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0].keys())); writer.writeheader(); writer.writerows(rows)
print(json.dumps({"status":report["status"],"numerical_checks":report["numerical_checks"],
 "gamma_rankings":rankings,"runtime_seconds":report["runtime_seconds"],
 "report_sha256":hashlib.sha256(report_path.read_bytes()).hexdigest(),
 "replicates_sha256":hashlib.sha256(csv_path.read_bytes()).hexdigest()},indent=2))
if report["status"]!="PASS": raise SystemExit(1)
