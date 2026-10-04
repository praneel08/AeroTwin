"""Run the whole AeroTwin pipeline end to end; every step is skipped if its output already exists.

    py -3.11 scripts/pipeline.py            # data -> models -> simulation -> frontend build
    py -3.11 scripts/pipeline.py --force    # redo everything
    py -3.11 scripts/pipeline.py --serve    # then start the app on http://127.0.0.1:8000
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "artifacts"
PY = sys.executable
# (name, command, output that proves the step is done, rough time)
STEPS = [
    ("download datasets", [PY, "scripts/download_datasets.py"], ROOT / "dataset/maintnet/Cleaned Version of MaintNet's Aviation Maintenance Dataset.xlsx", "1 min"),
    ("train RUL models (4 models x 4 subsets)", [PY, "-m", "ml.train", "--all", "--seeds", "3"], A / "ml/results.json", "~20 min on a laptop GPU"),
    ("out-of-fold predictions for the fleet", [PY, "-m", "ml.oof"], A / "ml/oof_FD001.pkl", "~3 min"),
    ("flight-anomaly autoencoder", [PY, "-m", "anomaly.detector"], A / "anomaly/results.json", "~1 min"),
    ("maintenance-log analysis", [PY, "-m", "nlp.logs"], A / "nlp/clusters.json", "~1 min"),
    ("policy comparison on simulated fleets", [PY, "-m", "fleet.compare"], A / "fleet/replay.pkl", "~6 min"),
    ("attach anomalies and logs to the timeline", [PY, "-m", "fleet.extras"], A / "fleet/extras.pkl", "~1 min"),
    ("spare-pool sensitivity", [PY, "-m", "fleet.sensitivity"], A / "fleet/sensitivity.json", "~4 min"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--serve", action="store_true")
    a = ap.parse_args()
    env = dict(os.environ, OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="1", MKL_NUM_THREADS="1")  # keep RAM low in worker pools
    for name, cmd, out, eta in STEPS:
        if out.exists() and not a.force:
            print(f"[skip] {name}")
            continue
        print(f"[run ] {name}  ({eta})", flush=True)
        subprocess.run(cmd, cwd=ROOT, env=env, check=True)
    dist = ROOT / "frontend/dist/index.html"
    if a.force or not dist.exists():
        print("[run ] build frontend  (~30 s)", flush=True)
        npm = "npm.cmd" if os.name == "nt" else "npm"
        if not (ROOT / "frontend/node_modules").exists():
            subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=ROOT / "frontend", check=True)
        subprocess.run([npm, "run", "build"], cwd=ROOT / "frontend", check=True)
    print("Done.")
    if a.serve:
        subprocess.run([PY, "-m", "uvicorn", "backend.app:app", "--port", "8000"], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
