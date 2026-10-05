"""Run the whole AeroTwin pipeline end to end; every step is skipped if its output already exists.

    py -3.11 -m src.pipeline            # data -> models -> simulation -> report -> frontend build
    py -3.11 -m src.pipeline --force    # redo everything
    py -3.11 -m src.pipeline --serve    # then start the app on http://127.0.0.1:8000
"""
import argparse
import os
import subprocess
import sys

from .paths import DATA, FRONTEND, MODELS, REPORTS, ROOT

PY = sys.executable
MAINTNET = DATA / "maintnet" / "Cleaned Version of MaintNet's Aviation Maintenance Dataset.xlsx"
# (name, command, output that proves the step is done, rough time)
STEPS = [
    ("download datasets", [PY, "-m", "src.download_datasets"], MAINTNET, "1 min"),
    ("train RUL models (4 models x 4 subsets)", [PY, "-m", "src.ml.train", "--all", "--seeds", "3"], REPORTS / "ml_results.json", "~20 min on a laptop GPU"),
    ("out-of-fold predictions for the fleet", [PY, "-m", "src.ml.oof"], MODELS / "ml" / "oof_FD001.pkl", "~3 min"),
    ("flight-anomaly autoencoder", [PY, "-m", "src.anomaly.detector"], REPORTS / "anomaly_results.json", "~1 min"),
    ("maintenance-log analysis", [PY, "-m", "src.nlp.logs"], REPORTS / "nlp_clusters.json", "~1 min"),
    ("policy comparison on simulated fleets", [PY, "-m", "src.fleet.compare"], MODELS / "fleet" / "replay.pkl", "~6 min"),
    ("attach anomalies and logs to the timeline", [PY, "-m", "src.fleet.extras"], MODELS / "fleet" / "extras.pkl", "~1 min"),
    ("spare-pool sensitivity", [PY, "-m", "src.fleet.sensitivity"], REPORTS / "fleet_sensitivity.json", "~4 min"),
    ("benchmark report", [PY, "-m", "src.make_report"], REPORTS / "benchmark.md", "seconds"),
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
    dist = FRONTEND / "dist" / "index.html"
    if a.force or not dist.exists():
        print("[run ] build frontend  (~30 s)", flush=True)
        npm = "npm.cmd" if os.name == "nt" else "npm"
        if not (FRONTEND / "node_modules").exists():
            subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=FRONTEND, check=True)
        subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True)
    print("Done.")
    if a.serve:
        subprocess.run([PY, "-m", "uvicorn", "demo.backend.app:app", "--port", "8000"], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
