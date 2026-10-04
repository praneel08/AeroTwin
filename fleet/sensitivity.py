"""How many spare engines does the fleet need? Availability vs spare-pool size for each policy.

    py -3.11 -m fleet.sensitivity      (about 3 minutes, 6 processes)
"""
import json
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from .sim import ART, load_engines, make_world, simulate

SPARES = [4, 6, 8, 10, 12, 14, 18]
SEEDS = [0, 1, 2, 3]
_E = None


def job(a):
    global _E
    _E = _E or load_engines()
    policy, T, n, seed = a
    k = simulate(_E, make_world(_E, seed), policy, T, spares=n)["kpi"]
    return policy, n, k["availability"], k["failures"]


def main():
    best_T = json.loads((ART.parent / "fleet" / "comparison.json").read_text())["best_T"]
    jobs = [(p, T, n, s) for p, T in (("predictive", None), ("time_based", best_T), ("corrective", None)) for n in SPARES for s in SEEDS]
    with ProcessPoolExecutor(6) as ex:
        res = list(ex.map(job, jobs, chunksize=2))
    out = {}
    for p in ("predictive", "time_based", "corrective"):
        out[p] = [dict(spares=n, availability=float(np.mean([r[2] for r in res if r[0] == p and r[1] == n])),
                       failures=float(np.mean([r[3] for r in res if r[0] == p and r[1] == n]))) for n in SPARES]
        print(p, " ".join(f"{d['spares']}:{d['availability'] * 100:.1f}%" for d in out[p]), flush=True)
    (ART.parent / "fleet" / "sensitivity.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
