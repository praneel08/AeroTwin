"""AeroTwin API. Serves the precomputed fleet replay (no torch at runtime, low RAM).

    py -3.11 -m uvicorn demo.backend.app:app --port 8000
"""
import json
import pickle
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from scipy.stats import norm

from src.fleet.sim import DAYS, DEPOT_NAMES, N_AC, N_DEPOTS, PLANNED_DOWN, SPARES0
from src.paths import FRONTEND, MODELS, REPORTS

SENSOR_INFO = {  # C-MAPSS sensor id -> (short name, description, module)
    2: ("T24", "LPC outlet temperature", "Compressor"), 3: ("T30", "HPC outlet temperature", "Compressor"),
    4: ("T50", "LPT outlet temperature", "Turbine"), 7: ("P30", "HPC outlet pressure", "Compressor"),
    8: ("Nf", "Fan speed", "Fan"), 9: ("Nc", "Core speed", "Compressor"), 11: ("Ps30", "HPC static pressure", "Compressor"),
    12: ("phi", "Fuel flow / Ps30", "Combustor"), 13: ("NRf", "Corrected fan speed", "Fan"),
    14: ("NRc", "Corrected core speed", "Compressor"), 15: ("BPR", "Bypass ratio", "Fan"),
    17: ("htBleed", "Bleed enthalpy", "Combustor"), 20: ("W31", "HPT coolant bleed", "Turbine"),
    21: ("W32", "LPT coolant bleed", "Turbine")}
SENSOR_IDS = [2, 3, 4, 7, 8, 9, 11, 12, 13, 14, 15, 17, 20, 21]
MODULES = ["Fan", "Compressor", "Combustor", "Turbine"]
STATE_NAME = {0: "operational", 1: "in_maintenance", 2: "failed", 3: "awaiting_spare"}
POLICIES = ("predictive", "corrective", "time_based")
ALARM_WINDOW = 40

replay = pickle.load(open(MODELS / "fleet" / "replay.pkl", "rb"))
extras = pickle.load(open(MODELS / "fleet" / "extras.pkl", "rb"))
comparison = json.loads((REPORTS / "fleet_comparison.json").read_text())
engines = pickle.load(open(MODELS / "ml" / "oof_FD001.pkl", "rb"))["engines"]
ml_results = json.loads((REPORTS / "ml_results.json").read_text())
anomaly_results = json.loads((REPORTS / "anomaly_results.json").read_text())
nlp_clusters = json.loads((REPORTS / "nlp_clusters.json").read_text())

# the sensor-drift index needs a scale; use the spread of end-of-life drift over all engines
def _drift(sens, upto):
    upto = max(upto, 1)
    base = sens[:15].mean(0)
    cur = sens[max(upto - 5, 0):upto].mean(0)
    return np.abs(cur - base)


def _coverage():
    """Share of true RUL inside the +-2 sigma interval during the degradation phase (RUL < 100), raw and after calibration."""
    from src.fleet.sim import SIGMA_CAL
    mu = np.concatenate([e["mu"] for e in engines.values()]); sd = np.concatenate([e["sigma"] for e in engines.values()])
    y = np.concatenate([np.minimum(e["true_rul"], 125) for e in engines.values()])
    m = y < 100
    err = np.abs(mu - y)[m]
    return dict(raw=float(np.mean(err <= 2 * sd[m])), calibrated=float(np.mean(err <= 2 * SIGMA_CAL * sd[m])), factor=SIGMA_CAL)


COVERAGE = _coverage()

app = FastAPI(title="AeroTwin API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def tail(a):
    return f"AC-{101 + a}"


def _rec(policy):
    if policy not in replay:
        raise HTTPException(404, f"unknown policy {policy}")
    return replay[policy]


def _day(day):
    return int(min(max(day, 0), DAYS - 1))


def _risk(mu, sg):
    return float(norm.cdf((ALARM_WINDOW - mu) / max(sg, 1e-6)))


def _engine_class(state, risk):
    if state in (2, 3):
        return "failed"
    if state == 1:
        return "maintenance"
    return "critical" if risk > 0.5 else "watch" if risk > 0.05 else "healthy"


def _plan_map(r, day):
    return {s: sd for s, sd in r["plans"][day]}


def _plan_depots(r, day):
    out, by_day = {}, {}
    for s, sd in sorted(r["plans"][day], key=lambda x: x[1]):
        k = by_day.get(sd, 0); by_day[sd] = k + 1
        out[s] = DEPOT_NAMES[k % N_DEPOTS]
    return out


def _modules(sens, cyc):
    """Wear (0-1) per engine section from sensor drift vs this engine's own early-life baseline (illustrative mapping)."""
    drift = _drift(sens, cyc)
    return {m: float(np.clip(np.mean([drift[i] for i, sid in enumerate(SENSOR_IDS) if SENSOR_INFO[sid][2] == m]) / 0.25, 0, 1)) for m in MODULES}


def _engine_state(r, day, s, plan, depots=None):
    rec = r["rec"]
    mu, sg, st = float(rec["mu"][day, s]), float(rec["sigma"][day, s]), int(rec["state"][day, s])
    risk = _risk(mu, sg)
    return dict(slot=s, position="Port" if s % 2 == 0 else "Starboard", state=STATE_NAME[st],
                cycle=int(rec["cycle"][day, s]), rul_mean=round(mu, 1), rul_sigma=round(sg, 1), risk=round(risk, 3),
                health=_engine_class(st, risk), scheduled_day=plan.get(s), scheduled_depot=(depots or {}).get(s))


def _aircraft_status(engs, stock=1):
    st = [e["state"] for e in engs]
    if any(s in ("failed", "awaiting_spare") for s in st):
        return "AOG"
    if "in_maintenance" in st:
        return "In maintenance"
    if any(e["scheduled_day"] is not None for e in engs):
        return "Maintenance scheduled"
    if stock <= 0 and any(e["health"] == "critical" for e in engs):
        return "Awaiting spare"
    if any(e["health"] in ("watch", "critical") for e in engs):
        return "Watch"
    return "Serviceable"


@app.get("/api/meta")
def meta():
    return dict(days=DAYS, aircraft=N_AC, engines=2 * N_AC, depots=DEPOT_NAMES, spares_initial=SPARES0,
                policies=list(POLICIES), alarm_window_days=ALARM_WINDOW,
                synthetic_notice="Engine degradation is real NASA C-MAPSS data; fleet, depots, spares and maintenance "
                                 "logs are simulated. Predictions are out-of-fold.")


@app.get("/api/fleet")
def fleet(day: int = 0, policy: str = "predictive"):
    r, day = _rec(policy), _day(day)
    plan = _plan_map(r, day)
    ex = extras[policy]
    aircraft = []
    for a in range(N_AC):
        engs = [_engine_state(r, day, 2 * a + e, plan) for e in range(2)]
        aircraft.append(dict(index=a, tail=tail(a), status=_aircraft_status(engs, int(r["stock"][day])), engines=engs,
                             min_rul=min(e["rul_mean"] for e in engs),
                             anomaly=round(float(ex["ratio"][day, a]), 2), anomaly_flag=bool(ex["ratio"][day, a] > 1)))
    counts = {}
    for x in aircraft:
        counts[x["status"]] = counts.get(x["status"], 0) + 1
    avail = r["avail"]
    ev = [e for e in r["events"] if e[1] <= day]
    upcoming = sum(1 for s, sd in r["plans"][day] if sd <= day + 14)
    return dict(day=day, policy=policy, aircraft=aircraft, counts=counts,
                kpi=dict(availability_today=round(avail[day] * 100, 1), availability_to_date=round(float(np.mean(avail[:day + 1])) * 100, 1),
                         spares_stock=int(r["stock"][day]), spares_initial=SPARES0,
                         failures_to_date=sum(1 for e in ev if e[0] == "failure"),
                         planned_to_date=sum(1 for e in ev if e[0] == "maint_start"),
                         scheduled_next_14d=upcoming, grounded=counts.get("AOG", 0) + counts.get("In maintenance", 0)))


@app.get("/api/aircraft/{a}")
def aircraft(a: int, day: int = 0, policy: str = "predictive"):
    if not 0 <= a < N_AC:
        raise HTTPException(404, "no such aircraft")
    r, day = _rec(policy), _day(day)
    rec, plan, ex = r["rec"], _plan_map(r, day), extras[policy]
    depots = _plan_depots(r, day)
    out_eng = []
    for e in range(2):
        s = 2 * a + e
        eng = _engine_state(r, day, s, plan, depots)
        traj, cyc = int(rec["traj"][day, s]), int(rec["cycle"][day, s])
        sens = engines[traj]["sensors"]
        win = sens[max(cyc - 60, 0):max(cyc, 1)]
        mod = _modules(sens, cyc)
        # wear history for the "how this engine wore out" slider: every 5 cycles from new to now
        steps = sorted(set(list(range(0, max(cyc, 1), 5)) + [cyc]))
        wear_hist = [dict(cycle=c, **{k: round(v, 3) for k, v in _modules(sens, c).items()}) for c in steps]
        # RUL history: same trajectory, up to today, every day the engine was operating
        hist = []
        for d in range(max(day - 120, 0), day + 1):
            if int(rec["traj"][d, s]) == traj and int(rec["state"][d, s]) == 0:
                hist.append([d, round(float(rec["mu"][d, s]), 1), round(float(rec["sigma"][d, s]), 1)])
        eng.update(modules={k: round(v, 3) for k, v in mod.items()}, modules_history=wear_hist, rul_history=hist,
                   sensors={SENSOR_INFO[sid][0]: [round(float(x), 3) for x in win[:, i]] for i, sid in enumerate(SENSOR_IDS)})
        out_eng.append(eng)
    d0 = max(day - 29, 0)
    params = extras[policy]["params"]
    top = params[int(ex["top"][day, a])]
    logs = [l for l in ex["logs"] if l["aircraft"] == a and l["day"] <= day][-8:][::-1]
    events = [dict(kind=e[0], day=e[1], engine="Port" if e[2] % 2 == 0 else "Starboard") for e in r["events"]
              if e[1] <= day and e[0] in ("failure", "maint_start") and e[2] // 2 == a][-8:][::-1]
    return dict(index=a, tail=tail(a), day=day, status=_aircraft_status(out_eng, int(r["stock"][day])), engines=out_eng,
                anomaly=dict(ratio=[round(float(x), 2) for x in ex["ratio"][d0:day + 1, a]], days=list(range(d0, day + 1)),
                             latest_top_parameter=top, flagged_days=int((ex["ratio"][d0:day + 1, a] > 1).sum())),
                logs=logs, events=events)


@app.get("/api/schedule")
def schedule(day: int = 0, policy: str = "predictive"):
    r, day = _rec(policy), _day(day)
    rec = r["rec"]
    items = []
    by_day = {}
    for s, sd in sorted(r["plans"][day], key=lambda x: x[1]):
        k = by_day.get(sd, 0); by_day[sd] = k + 1
        mu, sg = float(rec["mu"][day, s]), float(rec["sigma"][day, s])
        items.append(dict(tail=tail(s // 2), aircraft=s // 2, engine="Port" if s % 2 == 0 else "Starboard", start_day=int(sd),
                          in_days=int(sd - day), depot=DEPOT_NAMES[k % N_DEPOTS], rul_mean=round(mu, 1),
                          risk_before_start=round(float(norm.cdf((sd - day - mu) / max(sg, 1e-6))), 3)))
    started = [dict(day=e[1], tail=tail(e[2] // 2), engine="Port" if e[2] % 2 == 0 else "Starboard", depot=DEPOT_NAMES[e[3]],
                    remaining_life=e[4]) for e in r["events"] if e[0] == "maint_start" and day - PLANNED_DOWN < e[1] <= day]
    load = {n: 0 for n in DEPOT_NAMES}
    for x in started:
        load[x["depot"]] += 1
    return dict(day=day, upcoming=items[:40], in_progress=started, depot_load=load, spares_stock=int(r["stock"][day]),
                spares_series=[int(x) for x in r["stock"]])


@app.get("/api/kpis")
def kpis():
    series = {p: [round(float(x) * 100, 2) for x in replay[p]["avail"]] for p in replay}
    return dict(headline=comparison["headline"], best_T=comparison["best_T"], worlds=len(comparison["seeds"]),
                replay_kpi={p: replay[p]["kpi"] for p in replay}, availability_series=series, days=DAYS)


@app.get("/api/sensitivity")
def sensitivity():
    path = REPORTS / "fleet_sensitivity.json"
    if not path.exists():
        raise HTTPException(404, "run `py -3.11 -m src.fleet.sensitivity` first")
    return json.loads(path.read_text())


@app.get("/api/models")
def models():
    rows = [dict(fd=r["fd"], model=r["model"], rmse=r["summary"]["rmse"], score=r["summary"]["score"]) for r in ml_results]
    fd1 = min((r for r in rows if r["fd"] == "FD001"), key=lambda r: r["rmse"][0])
    return dict(rul=rows, best_fd001=fd1, uncertainty=COVERAGE, anomaly=anomaly_results, nlp=dict(silhouette_by_k=nlp_clusters["silhouette_by_k"],
                clusters=[{k: c[k] for k in ("id", "size", "top_terms", "main_component", "component_share")} for c in nlp_clusters["clusters"]]),
                published_fd001_rmse={"Babu 2016 (CNN)": 18.45, "Zheng 2017 (LSTM)": 16.14, "Li 2018 (DCNN)": 12.61, "DAST 2021 (Transformer)": 11.43})


_static = FRONTEND / "dist"
if _static.exists():
    app.mount("/", StaticFiles(directory=_static, html=True), name="static")
