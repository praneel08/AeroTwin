"""Fleet simulation and maintenance policies.

World (synthetic, clearly labelled): 40 aircraft x 2 engines, 365 days, one flight cycle per serviceable day, 3 depots
(maintenance agencies) with limited daily start slots, and a limited pool of serviceable spare engines that are
refurbished and return after REPAIR_DAYS. Engine life/degradation is real C-MAPSS FD001 run-to-failure data; every
RUL prediction comes from an out-of-fold model (see ml/oof.py).

Policies compared on identical worlds:
  corrective   replace only after failure
  time_based   replace at a fixed number of cycles (interval tuned on the same worlds - a strong baseline)
  predictive   probabilistic RUL -> CP-SAT rolling-horizon schedule under depot-slot and spares constraints
  oracle       same scheduler with perfect RUL (upper bound)
"""
import pickle
from dataclasses import dataclass, field

import numpy as np
from ortools.sat.python import cp_model
from scipy.stats import norm

from pathlib import Path

ART = Path(__file__).resolve().parent.parent / "artifacts" / "ml"

N_AC, DAYS, N_DEPOTS = 40, 365, 3
DEPOT_NAMES = ["Depot North", "Depot West", "Depot East"]
SLOTS_PER_DEPOT_PER_DAY = 1
PLANNED_DOWN, FAIL_DOWN, REPAIR_DAYS, SPARES0 = 3, 12, 20, 10
C_ENGINE, C_DOWN_DAY, C_FAIL_SECONDARY, MEAN_LIFE = 100.0, 8.0, 60.0, 206.0
C_FAIL = C_DOWN_DAY * (FAIL_DOWN - PLANNED_DOWN) + C_FAIL_SECONDARY  # extra cost of a failure vs planned swap
HORIZON = 30           # planning horizon (days)
ALARM_WINDOW, ALARM_P = 40, 0.03  # engine enters the plan if P(fail within window) exceeds this
OK, MAINT, FAILED, WAIT = 0, 1, 2, 3  # engine states


SIGMA_CAL = 3.0  # MC-dropout sigma is overconfident; x3 gives 96.6% coverage of the 2-sigma interval on OOF (RUL<100)


def load_engines():
    with open(ART / "oof_FD001.pkl", "rb") as f:
        engines = pickle.load(f)["engines"]
    for e in engines.values():
        e["sigma"] = e["sigma"] * SIGMA_CAL
    return engines


@dataclass
class World:
    seq: np.ndarray    # (n_engines, depth) trajectory ids per engine position
    start: np.ndarray  # starting cycle of the first trajectory


def make_world(engines, seed):
    rng = np.random.default_rng(seed)
    ids = np.array(sorted(engines))
    seq = rng.choice(ids, (2 * N_AC, 10))
    start = np.array([rng.integers(5, int(0.8 * engines[t]["n_cycles"])) for t in seq[:, 0]])
    return World(seq, start)


def _pred(engines, traj, cycle, oracle):
    e = engines[traj]
    i = min(max(cycle - 1, 0), e["n_cycles"] - 1)
    if oracle:
        return float(e["true_rul"][min(cycle, e["n_cycles"] - 1)]), 4.0
    return float(e["mu"][i]), max(float(e["sigma"][i]), 1.0)


def _plan(tasks, stock_now, returns, day):
    """CP-SAT: assign each alarmed engine a start day within HORIZON (or defer) minimising expected failure + waste cost.

    tasks: list of (slot, mu, sigma). returns: sorted list of days when spares become serviceable.
    Constraints: <= N_DEPOTS * SLOTS_PER_DEPOT_PER_DAY starts per day; cumulative starts <= spares available by that day.
    """
    if not tasks:
        return {}
    D = HORIZON + 1  # day offsets 0..HORIZON; offset D = defer
    avail = [stock_now + sum(1 for r in returns if r <= day + d) for d in range(D)]
    m = cp_model.CpModel()
    x = {}
    cost = {}
    for i, (_, mu, sg) in enumerate(tasks):
        for d in range(D + 1):
            z = (mu - d) / sg
            p_fail = norm.cdf(-z)
            waste = sg * norm.pdf(z) + (mu - d) * norm.cdf(z)  # E[(RUL - d)+]
            cost[i, d] = int(round(100 * (C_FAIL * p_fail + C_ENGINE / MEAN_LIFE * waste)))
            x[i, d] = m.NewBoolVar(f"x{i}_{d}")
        m.AddExactlyOne(x[i, d] for d in range(D + 1))
    cap = N_DEPOTS * SLOTS_PER_DEPOT_PER_DAY
    for d in range(D):
        m.Add(sum(x[i, d] for i in range(len(tasks))) <= cap)
        m.Add(sum(x[i, dd] for i in range(len(tasks)) for dd in range(d + 1)) <= avail[d])
    m.Minimize(sum(cost[k] * x[k] for k in x))
    s = cp_model.CpSolver()
    s.parameters.max_time_in_seconds = 2.0
    s.parameters.num_workers = 1
    st = s.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {}
    return {tasks[i][0]: d for i in range(len(tasks)) for d in range(D) if s.Value(x[i, d])}


def simulate(engines, world, policy, T=None, record=False, spares=SPARES0):
    n = len(world.seq)
    traj = world.seq[:, 0].copy(); depth = np.zeros(n, int); cycle = world.start.copy()
    state = np.full(n, OK); until = np.zeros(n, int)
    stock, returns = spares, []
    waiting = []  # failed engines waiting for a spare
    plan = {}     # slot -> (start_day, depot)
    depot_load = np.zeros(N_DEPOTS)
    k = dict(failures=0, planned=0, wasted=[], aog_days=0, spare_wait_days=0, avail_series=[], stock_series=[])
    events, plans = [], []
    rec = {f: np.zeros((DAYS, n), dtype=np.float32) for f in ("state", "cycle", "traj", "mu", "sigma")} if record else None

    def remove_engine(s, day, dur):
        nonlocal stock
        returns.append(day + REPAIR_DAYS)
        until[s] = day + dur

    for day in range(DAYS):
        # spares refurbished and back in stock
        back = [r for r in returns if r <= day]
        stock += len(back); returns[:] = [r for r in returns if r > day]
        # maintenance / repair completions: fresh engine from this position's sequence
        for s in range(n):
            if state[s] in (MAINT, FAILED) and until[s] <= day:
                depth[s] += 1; traj[s] = world.seq[s, depth[s] % world.seq.shape[1]]; cycle[s] = 0; state[s] = OK
        # failed engines waiting for a spare
        for s in list(waiting):
            if stock > 0:
                stock -= 1; waiting.remove(s); state[s] = FAILED; remove_engine(s, day, FAIL_DOWN)
                events.append(("repair_start", day, int(s)))
        # --- decide planned maintenance ---
        starts = []
        if policy in ("predictive", "oracle"):
            tasks = []
            for s in range(n):
                if state[s] != OK:
                    continue
                mu, sg = _pred(engines, traj[s], cycle[s], policy == "oracle")
                if norm.cdf((ALARM_WINDOW - mu) / sg) > ALARM_P:
                    tasks.append((s, mu, sg))
            new = _plan(tasks, stock, returns, day)
            for s, d in new.items():
                if s not in plan or plan[s][0] != day + d:
                    if s not in plan:
                        events.append(("scheduled", day, int(s), day + d))
                    plan[s] = (day + d, None)
            for s in list(plan):
                if s not in new:  # fell out of the alarm set / deferred
                    plan.pop(s)
            starts = [s for s, (sd, _) in plan.items() if sd <= day and state[s] == OK]
        elif policy == "time_based":
            starts = [s for s in np.argsort(-cycle) if state[s] == OK and cycle[s] >= T]
        starts = starts[: N_DEPOTS * SLOTS_PER_DEPOT_PER_DAY]
        for s in starts:
            if stock <= 0:
                k["spare_wait_days"] += 1
                continue
            stock -= 1
            e = engines[traj[s]]
            k["planned"] += 1; k["wasted"].append(max(e["n_cycles"] - cycle[s], 0))
            depot = int(np.argmin(depot_load)); depot_load[depot] += 1
            state[s] = MAINT; remove_engine(s, day, PLANNED_DOWN); plan.pop(s, None)
            events.append(("maint_start", day, int(s), depot, int(e["n_cycles"] - cycle[s])))
        depot_load *= 0.95
        # --- fly: an aircraft flies only if both its engines are serviceable ---
        ok_pair = (state[0::2] == OK) & (state[1::2] == OK)
        for a in range(N_AC):
            if ok_pair[a]:
                for s in (2 * a, 2 * a + 1):
                    cycle[s] += 1
                    if cycle[s] >= engines[traj[s]]["n_cycles"]:
                        k["failures"] += 1
                        events.append(("failure", day, int(s)))
                        plan.pop(s, None)
                        if stock > 0:
                            stock -= 1; state[s] = FAILED; remove_engine(s, day, FAIL_DOWN)
                        else:
                            state[s] = WAIT; waiting.append(s)
        avail = ((state[0::2] == OK) & (state[1::2] == OK)).mean()
        k["avail_series"].append(float(avail)); k["stock_series"].append(int(stock))
        k["aog_days"] += int(((state[0::2] >= FAILED) | (state[1::2] >= FAILED)).sum())
        if record:
            for s in range(n):
                mu, sg = _pred(engines, traj[s], cycle[s], False)
                rec["state"][day, s] = state[s]; rec["cycle"][day, s] = cycle[s]; rec["traj"][day, s] = traj[s]
                rec["mu"][day, s] = mu; rec["sigma"][day, s] = sg
            plans.append([[int(s), int(sd)] for s, (sd, _) in sorted(plan.items())])
    wasted = float(np.mean(k["wasted"])) if k["wasted"] else 0.0
    down_days = (1 - np.array(k["avail_series"])).sum() * N_AC
    cost = k["planned"] * C_ENGINE + k["failures"] * (C_ENGINE + C_FAIL_SECONDARY) + down_days * C_DOWN_DAY \
        + sum(k["wasted"]) * 0.0
    kpi = dict(policy=policy, T=T, availability=float(np.mean(k["avail_series"])), failures=k["failures"],
               planned=k["planned"], mean_wasted_cycles=wasted, aog_aircraft_days=k["aog_days"],
               cost=float(cost), spare_wait_days=k["spare_wait_days"])
    out = dict(kpi=kpi, avail_series=k["avail_series"], stock=k["stock_series"], events=events)
    if record:
        out.update(rec=rec, plans=plans)
    return out
