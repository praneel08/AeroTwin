"""Out-of-fold RUL predictions for every FD001 run-to-failure engine (5-fold by engine).

Each engine's per-cycle prediction (MC-dropout mean and std) comes from a model that never trained on that engine,
so the fleet simulation is driven by honest held-out predictions rather than overfit ones.

    py -3.11 -m src.ml.oof
"""
import pickle
import time

import numpy as np

from .data import SENSORS, WINDOW, Preprocessor, load_fd, make_train, rmse
from .models import predict
from .train import ART, DEV, train_one

FD = "FD001"


def main(model_name="lstm", folds=5, seeds=2, epochs=80):
    train, _, _ = load_fd(FD)
    pre = Preprocessor(FD).fit(train)
    x = pre.transform(train)
    X, y, u = make_train(train, x)
    units = np.unique(u)
    rng = np.random.default_rng(42)
    order = rng.permutation(units)
    fold_of = {int(un): i % folds for i, un in enumerate(order)}
    mu = np.zeros(len(X), np.float32); sd = np.zeros(len(X), np.float32)
    t0 = time.time()
    for f in range(folds):
        te_units = [un for un in units if fold_of[int(un)] == f]
        rest = [un for un in units if fold_of[int(un)] != f]
        val_units = rng.choice(rest, 10, replace=False)
        te_m, va_m = np.isin(u, te_units), np.isin(u, val_units)
        tr_m = ~(te_m | va_m)
        d = dict(Xtr=X[tr_m], ytr=y[tr_m], Xva=X[va_m], yva=y[va_m])
        ms, ss = [], []
        for s in range(seeds):
            model, _ = train_one(model_name, d, 100 * f + s, epochs)
            m, sdv = predict(model, X[te_m], DEV, mc=30)
            ms.append(m); ss.append(sdv)
        ms, ss = np.stack(ms), np.stack(ss)
        mu[te_m] = ms.mean(0)
        sd[te_m] = np.sqrt((ss ** 2).mean(0) + ms.var(0))  # MC variance + between-seed variance
        print(f"fold {f}: engines {len(te_units)}, RMSE vs capped RUL {rmse(mu[te_m], y[te_m]):.2f} ({time.time() - t0:.0f}s)", flush=True)
    print(f"overall OOF RMSE vs capped RUL: {rmse(mu, y):.2f}; mean sigma {sd.mean():.2f}; "
          f"2-sigma coverage {np.mean(np.abs(mu - y) <= 2 * sd):.2f}")
    engines = {}
    raw = train.copy()
    for un in units:
        idx = np.where(u == un)[0]  # windows end at cycles WINDOW..n
        n = len(idx) + WINDOW - 1
        mus = np.concatenate([np.full(WINDOW - 1, mu[idx[0]]), mu[idx]])
        sds = np.concatenate([np.full(WINDOW - 1, sd[idx[0]]), sd[idx]])
        r = raw[raw.unit == un]
        engines[int(un)] = dict(n_cycles=n, mu=mus.astype(np.float32), sigma=sds.astype(np.float32),
                                true_rul=np.arange(n - 1, -1, -1, dtype=np.float32),
                                sensors=pre.transform(r).astype(np.float32))
    ART.mkdir(parents=True, exist_ok=True)
    with open(ART / "oof_FD001.pkl", "wb") as f:
        pickle.dump(dict(engines=engines, sensors=SENSORS), f)


if __name__ == "__main__":
    main()
