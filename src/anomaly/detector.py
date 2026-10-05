"""Flight-sensor anomaly detection: 1D conv autoencoder trained on nominal NASA DASHlink windows.

Score = reconstruction error. Threshold = a high percentile of error on *nominal validation* windows only
(no anomaly labels are used for training or thresholding). Per-parameter error shows which signal drove a flag.

    py -3.11 -m src.anomaly.detector    # train, evaluate on injected faults; weights -> models/anomaly/, results -> reports/
"""
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from ..paths import DATA as _DATA, MODELS, REPORTS

DATA = _DATA / "flight_anomaly_cvae"
ART = MODELS / "anomaly"
DEV = torch.device("cuda" if torch.cuda.is_available() else "cpu")
FAULTS = ("spike", "drift", "stuck", "noise_burst")


class ConvAE(nn.Module):
    def __init__(self, n_ch=10, latent=96):
        super().__init__()
        self.enc = nn.Sequential(
            nn.Conv1d(n_ch, 32, 5, 2, 2), nn.ReLU(), nn.Conv1d(32, 64, 5, 2, 2), nn.ReLU(),
            nn.Conv1d(64, 64, 5, 2, 2), nn.ReLU(), nn.Flatten(), nn.Linear(64 * 20, latent))
        self.dec_fc = nn.Linear(latent, 64 * 20)
        self.dec = nn.Sequential(
            nn.ConvTranspose1d(64, 64, 4, 2, 1), nn.ReLU(), nn.ConvTranspose1d(64, 32, 4, 2, 1), nn.ReLU(),
            nn.ConvTranspose1d(32, n_ch, 4, 2, 1))

    def forward(self, x):  # x: (B, 160, C)
        z = self.enc(x.transpose(1, 2))
        return self.dec(self.dec_fc(z).view(-1, 64, 20)).transpose(1, 2)


def load(split):
    a = np.load(DATA / f"DASHlink_binary_Flaps_noAnomaly_{split}.npz", allow_pickle=True)
    return a["data"].astype(np.float32), [str(p) for p in a["param_names"]]


@torch.no_grad()
def errors(model, X, bs=1024):
    """Per-window, per-parameter mean squared reconstruction error -> (N, C)."""
    model.eval()
    out = []
    for i in range(0, len(X), bs):
        x = torch.as_tensor(X[i:i + bs], device=DEV)
        out.append(((model(x) - x) ** 2).mean(1).cpu().numpy())
    return np.concatenate(out)


def inject(X, kind, rng):
    """Return a copy with one synthetic fault on 1-2 random parameters per window."""
    Y = X.copy()
    n, T, C = Y.shape
    for i in range(n):
        for c in rng.choice(C, rng.integers(1, 3), replace=False):
            t0 = int(rng.integers(20, T - 50))
            if kind == "spike":
                Y[i, t0:t0 + int(rng.integers(4, 10)), c] += rng.choice([-1, 1]) * 0.35
            elif kind == "drift":
                Y[i, t0:, c] += np.linspace(0, rng.choice([-1, 1]) * 0.3, T - t0)
            elif kind == "stuck":
                Y[i, t0:, c] = Y[i, t0, c]
            elif kind == "noise_burst":
                Y[i, t0:t0 + 25, c] += rng.normal(0, 0.12, 25)
    return Y


def fit(epochs=100, seed=0):
    torch.manual_seed(seed)
    Xtr, names = load("train")
    Xva, _ = load("valid")
    model = ConvAE(Xtr.shape[2]).to(DEV)
    opt = torch.optim.AdamW(model.parameters(), 1e-3, weight_decay=1e-5)
    Xt = torch.as_tensor(Xtr, device=DEV)
    best, best_state = 1e9, None
    for ep in range(epochs):
        model.train()
        perm = torch.randperm(len(Xt), device=DEV)
        for i in range(0, len(perm), 128):
            x = Xt[perm[i:i + 128]]
            loss = nn.functional.mse_loss(model(x), x)
            opt.zero_grad(); loss.backward(); opt.step()
        v = errors(model, Xva).mean()
        if v < best:
            best, best_state = v, {k: t.clone() for k, t in model.state_dict().items()}
    model.load_state_dict(best_state)
    return model, names


def evaluate(model, names):
    from sklearn.metrics import average_precision_score, roc_auc_score
    Xva, _ = load("valid")
    Xte, _ = load("test")
    ev, ee = errors(model, Xva), errors(model, Xte)
    # Threshold from nominal validation windows only: 99th percentile of the window score (max over parameters,
    # each parameter scaled by its own nominal error so noisy channels don't dominate).
    scale = np.percentile(ev, 95, axis=0) + 1e-9
    score = lambda e: (e / scale).max(1)
    thr = float(np.percentile(score(ev), 99))
    rng = np.random.default_rng(1)
    res = {"threshold": thr, "false_alarm_rate_nominal_test": float((score(ee) > thr).mean()), "faults": {}}
    for k in FAULTS:
        Xa = inject(Xte, k, rng)
        ea = errors(model, Xa)
        y = np.r_[np.zeros(len(ee)), np.ones(len(ea))]
        s = np.r_[score(ee), score(ea)]
        res["faults"][k] = dict(auroc=float(roc_auc_score(y, s)), auprc=float(average_precision_score(y, s)),
                                recall_at_thr=float((score(ea) > thr).mean()))
    return res, dict(scale=scale.tolist(), threshold=thr, params=names)


def main():
    model, names = fit()
    res, cfg = evaluate(model, names)
    ART.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), ART / "convae.pt")
    (ART / "config.json").write_text(json.dumps(cfg, indent=1))
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "anomaly_results.json").write_text(json.dumps(res, indent=1))
    print(f"threshold {res['threshold']:.2f}  nominal false-alarm rate {res['false_alarm_rate_nominal_test']:.3f}")
    for k, v in res["faults"].items():
        print(f"  {k:12s} AUROC {v['auroc']:.3f}  AUPRC {v['auprc']:.3f}  recall@thr {v['recall_at_thr']:.3f}")


if __name__ == "__main__":
    main()
