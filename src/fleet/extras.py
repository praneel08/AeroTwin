"""Attach flight-anomaly scores and maintenance-log entries to the simulated fleet timeline (precomputed for the API).

SIMULATED LINK (stated in the UI): each aircraft flies real NASA nominal flight windows; as its weakest engine's
predicted RUL drops, faults of the kinds used in anomaly/ evaluation are injected into some of those windows with rising
probability. The trained autoencoder then scores every window, so scores/flags are genuine model outputs on the
injected data. Maintenance events get log text sampled from real MaintNet records (cluster + component from nlp/).

    py -3.11 -m src.fleet.extras
"""
import json
import pickle

import numpy as np
import pandas as pd
import torch

from ..anomaly.detector import ART as A_ART, ConvAE, FAULTS, errors, inject, load
from ..nlp.logs import ART as N_ART
from ..paths import MODELS, REPORTS

from .sim import DAYS, N_AC

OUT = MODELS / "fleet"


def main(seed=3):
    rng = np.random.default_rng(seed)
    replay = pickle.load(open(OUT / "replay.pkl", "rb"))
    cfg = json.loads((A_ART / "config.json").read_text())
    scale, thr, params = np.array(cfg["scale"]), cfg["threshold"], cfg["params"]
    model = ConvAE(len(params)).to("cuda" if torch.cuda.is_available() else "cpu")
    model.load_state_dict(torch.load(A_ART / "convae.pt", map_location="cpu"))
    Xte, _ = load("test")
    recs = pd.read_csv(N_ART / "records.csv")
    clusters = json.loads((REPORTS / "nlp_clusters.json").read_text())["clusters"]
    cinfo = {c["id"]: c for c in clusters}
    out = {}
    for name, r in replay.items():
        mu = r["rec"]["mu"].reshape(DAYS, N_AC, 2).min(2)  # weakest engine per aircraft per day
        state = r["rec"]["state"].reshape(DAYS, N_AC, 2).max(2)
        # one flight window per aircraft per day, drawn from real nominal test windows
        idx = rng.integers(0, len(Xte), (DAYS, N_AC))
        W = Xte[idx.ravel()].copy()
        p_fault = np.where(mu < 50, 0.45, np.where(mu < 80, 0.12, 0.02)).ravel()
        kind = np.full(len(W), -1)
        for i in np.where(rng.random(len(W)) < p_fault)[0]:
            k = int(rng.integers(0, len(FAULTS)))
            W[i] = inject(W[i:i + 1], FAULTS[k], rng)[0]
            kind[i] = k
        e = errors(model, W) / scale  # (N, params), >1 means above that parameter's nominal 95th percentile
        ratio = (e.max(1) / thr).reshape(DAYS, N_AC)
        top = e.argmax(1).reshape(DAYS, N_AC)
        # maintenance / failure events -> sampled log entries
        logs = []
        for ev in r["events"]:
            if ev[0] in ("maint_start", "failure"):
                row = recs.sample(1, random_state=int(rng.integers(1 << 30))).iloc[0]
                c = cinfo[int(row["cluster"])]
                logs.append(dict(day=ev[1], aircraft=ev[2] // 2, engine=ev[2] % 2, kind=ev[0], text=str(row["text"]),
                                 cluster=int(row["cluster"]), cluster_terms=c["top_terms"][:3], component=str(row["component"])))
        out[name] = dict(ratio=ratio.astype(np.float32), top=top.astype(np.int8), injected=kind.reshape(DAYS, N_AC),
                         logs=logs, params=params, state=state)
        flagged = ratio > 1
        inj = kind.reshape(DAYS, N_AC) >= 0
        print(f"{name}: flagged {flagged.mean():.3f} of flights; on injected faults recall {flagged[inj].mean():.2f}, "
              f"on nominal false alarms {flagged[~inj].mean():.3f}; {len(logs)} log entries", flush=True)
    with open(OUT / "extras.pkl", "wb") as f:
        pickle.dump(out, f)


if __name__ == "__main__":
    main()
