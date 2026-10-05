"""Run all policies over several simulated worlds (in parallel), pick the best fixed interval, save KPIs + replay data.

    py -3.11 -m src.fleet.compare
"""
import json
import pickle
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from ..paths import MODELS, REPORTS
from .sim import ART

from .sim import DAYS, N_AC, load_engines, make_world, simulate

SEEDS = list(range(8))
T_GRID = list(range(100, 201, 10))
_E = None


def _engines():
    global _E
    if _E is None:
        _E = load_engines()
    return _E


def job(args):
    policy, seed, T = args
    e = _engines()
    r = simulate(e, make_world(e, seed), policy, T)
    return policy, seed, T, r["kpi"], r["avail_series"]


def main():
    jobs = [("corrective", s, None) for s in SEEDS] + [("predictive", s, None) for s in SEEDS] \
        + [("oracle", s, None) for s in SEEDS] + [("time_based", s, T) for s in SEEDS for T in T_GRID]
    with ProcessPoolExecutor(6) as ex:
        res = list(ex.map(job, jobs, chunksize=1))
    agg = {}
    for policy, seed, T, kpi, series in res:
        agg.setdefault((policy, T), []).append(kpi)
    summary = {}
    for (policy, T), ks in agg.items():
        summary[f"{policy}{'' if T is None else '@' + str(T)}"] = {
            k: [float(np.mean([x[k] for x in ks])), float(np.std([x[k] for x in ks]))]
            for k in ("availability", "failures", "planned", "mean_wasted_cycles", "aog_aircraft_days", "cost", "spare_wait_days")}
    best_T = min((T for (p, T) in agg if p == "time_based"), key=lambda T: summary[f"time_based@{T}"]["cost"][0])
    headline = {"corrective": summary["corrective"], f"time_based (best T={best_T})": summary[f"time_based@{best_T}"],
                "predictive (ours)": summary["predictive"], "oracle (perfect RUL)": summary["oracle"]}
    print(f"{len(SEEDS)} worlds, {N_AC} aircraft, {DAYS} days. mean (std) over worlds")
    print(f"{'policy':28s} {'avail%':>8s} {'fail':>6s} {'planned':>8s} {'wasted':>8s} {'cost':>9s}")
    for name, s in headline.items():
        print(f"{name:28s} {100 * s['availability'][0]:8.2f} {s['failures'][0]:6.1f} {s['planned'][0]:8.1f} "
              f"{s['mean_wasted_cycles'][0]:8.1f} {s['cost'][0]:9.0f}")
    out = MODELS / "fleet"
    out.mkdir(parents=True, exist_ok=True); REPORTS.mkdir(exist_ok=True)
    (REPORTS / "fleet_comparison.json").write_text(json.dumps(dict(headline=headline, all=summary, best_T=best_T, seeds=SEEDS), indent=1))
    # replay data for the platform: world seed 0, predictive vs corrective vs best time-based
    e = _engines()
    replay = {}
    for name, (pol, T) in {"predictive": ("predictive", None), "corrective": ("corrective", None),
                           "time_based": ("time_based", best_T)}.items():
        r = simulate(e, make_world(e, 0), pol, T, record=True)
        replay[name] = dict(kpi=r["kpi"], avail=r["avail_series"], stock=r["stock"], events=r["events"],
                            plans=r.get("plans"), rec={k: v for k, v in r["rec"].items()})
    with open(out / "replay.pkl", "wb") as f:
        pickle.dump(replay, f)


if __name__ == "__main__":
    main()
