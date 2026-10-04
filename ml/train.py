"""Train and evaluate RUL models on C-MAPSS.

    py -3.11 -m ml.train --fd FD001 --model cnn --seeds 3
    py -3.11 -m ml.train --all            # every model x FD001..FD004, results -> artifacts/ml/results.json
"""
import argparse
import json
import pickle
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from .data import SENSORS, WINDOW, phm_score, prepare, rmse
from .models import MODELS, predict

ART = Path(__file__).resolve().parent.parent / "artifacts" / "ml"
DEV = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def train_one(name, d, seed, epochs, bs=256, lr=1e-3):
    torch.manual_seed(seed); np.random.seed(seed)
    model = MODELS[name]().to(DEV)
    Xtr = torch.as_tensor(d["Xtr"], device=DEV); ytr = torch.as_tensor(d["ytr"], device=DEV)
    Xva = torch.as_tensor(d["Xva"], device=DEV); yva = torch.as_tensor(d["yva"], device=DEV)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, factor=0.5, patience=4)
    best, best_state, bad = 1e9, None, 0
    for ep in range(epochs):
        model.train()
        perm = torch.randperm(len(Xtr), device=DEV)
        for i in range(0, len(perm), bs):
            idx = perm[i:i + bs]
            loss = nn.functional.mse_loss(model(Xtr[idx]), ytr[idx])
            opt.zero_grad(set_to_none=True); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step()
        model.eval()
        with torch.no_grad():
            val = float(torch.sqrt(nn.functional.mse_loss(model(Xva), yva)))
        sched.step(val)
        if val < best - 1e-3:
            best, bad = val, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= 12:
                break
    model.load_state_dict(best_state)
    return model, best


def evaluate(model, d):
    pred = predict(model, d["Xte"], DEV)
    mean, std = predict(model, d["Xte"], DEV, mc=30)
    return dict(rmse=rmse(pred, d["rul_te"]), score=phm_score(pred, d["rul_te"]),
                rmse_mc=rmse(mean, d["rul_te"]), mean_std=float(std.mean()),
                # empirical coverage of the +-2 sigma MC-dropout interval on the true RUL
                cover2sigma=float(np.mean(np.abs(mean - d["rul_te"]) <= 2 * std + 1e-9)))


def run_xgb(d):
    import xgboost as xgb
    flat = lambda X: X.reshape(len(X), -1)
    m = xgb.XGBRegressor(n_estimators=400, max_depth=6, learning_rate=0.05, subsample=0.8,
                         colsample_bytree=0.5, tree_method="hist", device="cuda" if DEV.type == "cuda" else "cpu")
    m.fit(flat(d["Xtr"]), d["ytr"])
    p = m.predict(flat(d["Xte"]))
    return dict(rmse=rmse(p, d["rul_te"]), score=phm_score(p, d["rul_te"])), m


def run(fd, name, seeds, epochs):
    d = prepare(fd)
    t0 = time.time()
    if name == "xgb":
        res, model = run_xgb(d)
        ART.mkdir(parents=True, exist_ok=True)
        pickle.dump(model, open(ART / f"xgb_{fd}.pkl", "wb"))
        runs = [res]
    else:
        runs, best_rmse = [], 1e9
        for s in range(seeds):
            model, val = train_one(name, d, s, epochs)
            r = evaluate(model, d); r["val_rmse"] = val; runs.append(r)
            if r["rmse"] < best_rmse:  # keep the best seed's weights for the platform
                ART.mkdir(parents=True, exist_ok=True)
                torch.save(model.state_dict(), ART / f"{name}_{fd}.pt")
                best_rmse = r["rmse"]
    with open(ART / f"pre_{fd}.pkl", "wb") as f:
        pickle.dump(d["pre"], f)
    agg = {k: (float(np.mean([r[k] for r in runs])), float(np.std([r[k] for r in runs]))) for k in runs[0]}
    print(f"{fd} {name:11s} RMSE {agg['rmse'][0]:6.2f}±{agg['rmse'][1]:.2f}  Score {agg['score'][0]:9.0f}  "
          f"({len(runs)} runs, {time.time() - t0:.0f}s)", flush=True)
    return dict(fd=fd, model=name, runs=runs, summary=agg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fd", default="FD001"); ap.add_argument("--model", default="cnn", choices=[*MODELS, "xgb"])
    ap.add_argument("--seeds", type=int, default=3); ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    print(f"device: {DEV} ({torch.cuda.get_device_name(0) if DEV.type == 'cuda' else 'cpu'}); {len(SENSORS)} sensors, window {WINDOW}")
    jobs = [(fd, m) for fd in ("FD001", "FD002", "FD003", "FD004") for m in ("xgb", *MODELS)] if a.all else [(a.fd, a.model)]
    results = [run(fd, m, a.seeds, a.epochs) for fd, m in jobs]
    ART.mkdir(parents=True, exist_ok=True)
    out = ART / "results.json"
    old = json.loads(out.read_text()) if out.exists() else []
    keep = [r for r in old if (r["fd"], r["model"]) not in {(r2["fd"], r2["model"]) for r2 in results}]
    out.write_text(json.dumps(keep + results, indent=1))


if __name__ == "__main__":
    main()
