"""C-MAPSS loading, preprocessing and windowing (standard pipeline from the literature survey).

- 21 sensors -> drop the 7 constant ones (1,5,6,10,16,18,19), keep 14.
- Min-max scaling per operating regime (6 regimes for FD002/FD004, found by k-means on the 3 settings).
- Sliding windows of 30 cycles, label = RUL at the last cycle, capped at 125.
- Test: one window per engine (its last cycles) vs the RUL_FDxxx.txt ground truth.
"""
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view
from sklearn.cluster import KMeans

DATA = Path(__file__).resolve().parent.parent / "dataset" / "cmapss"
SETTINGS = ["s1", "s2", "s3"]
ALL_SENSORS = [f"x{i}" for i in range(1, 22)]
DROP = {1, 5, 6, 10, 16, 18, 19}
SENSORS = [f"x{i}" for i in range(1, 22) if i not in DROP]  # 14 sensors
COLS = ["unit", "cycle"] + SETTINGS + ALL_SENSORS
WINDOW, RUL_CAP = 30, 125
MULTI_REGIME = {"FD002", "FD004"}


def load_fd(fd: str):
    """Return (train_df, test_df, true_rul[ndarray]) for FD001..FD004."""
    rd = lambda name: pd.read_csv(DATA / f"{name}_{fd}.txt", sep=r"\s+", header=None, names=COLS if name != "RUL" else None)
    train, test = rd("train"), rd("test")
    rul = pd.read_csv(DATA / f"RUL_{fd}.txt", header=None).values.ravel().astype(np.float32)
    return train, test, rul


@dataclass
class Preprocessor:
    fd: str
    kmeans: KMeans | None = None
    lo: np.ndarray | None = None  # (regimes, n_sensors)
    hi: np.ndarray | None = None

    def _regime(self, df):
        return self.kmeans.predict(df[SETTINGS].values) if self.kmeans is not None else np.zeros(len(df), int)

    def fit(self, train: pd.DataFrame):
        if self.fd in MULTI_REGIME:
            self.kmeans = KMeans(6, n_init=10, random_state=0).fit(train[SETTINGS].values)
        reg = self._regime(train)
        n = int(reg.max()) + 1
        x = train[SENSORS].values
        self.lo = np.stack([x[reg == r].min(0) for r in range(n)])
        self.hi = np.stack([x[reg == r].max(0) for r in range(n)])
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        reg = self._regime(df)
        lo, hi = self.lo[reg], self.hi[reg]
        return ((df[SENSORS].values - lo) / np.maximum(hi - lo, 1e-6)).astype(np.float32).clip(-0.5, 1.5)


def _units(df, x):
    for u, idx in df.groupby("unit").indices.items():
        yield u, x[idx]


def make_train(df: pd.DataFrame, x: np.ndarray, window=WINDOW):
    """All stride-1 windows. Returns X (N,window,14), y (N,), unit ids (N,)."""
    xs, ys, us = [], [], []
    for u, ux in _units(df, x):
        n = len(ux)
        rul = np.minimum(np.arange(n - 1, -1, -1), RUL_CAP).astype(np.float32)
        if n < window:
            ux = np.concatenate([np.repeat(ux[:1], window - n, 0), ux])
            rul = np.concatenate([np.repeat(rul[:1], window - n), rul])
        w = sliding_window_view(ux, window, axis=0).transpose(0, 2, 1)  # (n-window+1, window, 14)
        xs.append(w); ys.append(rul[window - 1:]); us.append(np.full(len(w), u))
    return np.concatenate(xs), np.concatenate(ys), np.concatenate(us)


def make_test(df: pd.DataFrame, x: np.ndarray, window=WINDOW):
    """Last window of every test engine (front-padded by repeating the first row if short)."""
    out = []
    for _, ux in _units(df, x):
        if len(ux) < window:
            ux = np.concatenate([np.repeat(ux[:1], window - len(ux), 0), ux])
        out.append(ux[-window:])
    return np.stack(out)


def rmse(pred, true):
    return float(np.sqrt(np.mean((np.asarray(pred) - np.asarray(true)) ** 2)))


def phm_score(pred, true):
    """PHM08 asymmetric score, d = pred - true (late predictions penalised more)."""
    d = np.asarray(pred) - np.asarray(true)
    return float(np.sum(np.where(d < 0, np.exp(-d / 13) - 1, np.exp(d / 10) - 1)))


def prepare(fd: str, val_frac=0.15, seed=0):
    """Everything a training run needs. Validation = held-out engines from the train set."""
    train, test, rul = load_fd(fd)
    pre = Preprocessor(fd).fit(train)
    X, y, u = make_train(train, pre.transform(train))
    Xt = make_test(test, pre.transform(test))
    units = np.unique(u)
    rng = np.random.default_rng(seed)
    val_units = rng.choice(units, max(1, int(len(units) * val_frac)), replace=False)
    vm = np.isin(u, val_units)
    return dict(pre=pre, Xtr=X[~vm], ytr=y[~vm], Xva=X[vm], yva=y[vm], Xte=Xt, rul_te=rul)
