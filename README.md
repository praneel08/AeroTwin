# AeroTwin — Predictive Maintenance & Fleet Availability

## 1. Project Information

- **Project Title:** AeroTwin — Predictive Maintenance & Fleet Availability
- **PS ID:** 26249
- **PS Title:** Air Power - Predictive Maintenance & Fleet Availability
- **Category:** Software
- **Theme:** Transportation & Logistics
- **Organisation:** Ministry of Defence (MoD)
- **Department:** Defence Services Staff College

## 2. Problem Statement

Low aircraft availability due to fragmented and largely reactive maintenance practices across the air fleet. Maintenance data from aircraft health-monitoring systems, technical records, spares and maintenance agencies is not adequately integrated, resulting in delayed fault prediction, avoidable aircraft downtime and sub-optimal utilisation of critical assets.

## 3. Proposed Solution

AeroTwin integrates engine health data, flight data, maintenance records, spares and workshop capacity into one platform and turns them into decisions:

1. **Predict** how many flights each engine has left (remaining useful life, RUL), with an uncertainty range.
2. **Plan** engine swaps every day with a constraint solver that respects workshop slots and the spare-engine pool, so each swap happens just before the predicted failure: not too early (wasted engine life) and not too late (a breakdown).
3. **Show** the result in a dashboard with a 3D digital twin of every aircraft, so a maintainer can see which engine is wearing, why, and what is booked.

The same simulated fleet is also run under two baseline strategies (run to failure, fixed interval) so the benefit is measured, not claimed.

> **What is real and what is simulated.** No public military data exists. Engine wear is **real NASA C-MAPSS run-to-failure data**. The fleet (40 aircraft, 80 engines), three workshops, the spare-engine pool, costs and the repair notes attached to events are **simulated**, and the UI says so. Every prediction driving the demo comes from a model that never trained on that engine (5-fold out-of-fold).

## 4. Key Features

- Remaining-useful-life models (XGBoost, 1D-CNN, LSTM, Transformer) on NASA C-MAPSS FD001–FD004 with Monte Carlo dropout uncertainty, recalibrated so the 95% range really covers about 95% of cases.
- Flight-data anomaly detection: a convolutional autoencoder trained on nominal NASA flight windows, threshold set from nominal data only.
- Maintenance-log analysis: domain-aware cleaning (keeps "not" and part numbers), TF-IDF, LSA and k-means issue clusters, component tagging.
- Fleet simulator and rolling-horizon scheduler (OR-Tools CP-SAT) under workshop-slot and spare-engine limits, compared with two baselines.
- Web dashboard in plain-but-technical language: **Fleet**, **Aircraft twin** (hover, open an engine into labelled sections, Condition / X-ray / Alerts layers, a "how this engine wore out" slider) and **Results** (headline scorecard, fleet impact, model performance). Light theme by default, dark theme on toggle.
- One-command pipeline that downloads the data, trains, simulates, builds the report and the UI.

## 5. Technology Stack

- **ML / modelling:** PyTorch (CNN, LSTM, Transformer), XGBoost, scikit-learn
- **Optimisation:** Google OR-Tools (CP-SAT)
- **Data:** pandas, NumPy, SciPy; NASA C-MAPSS, NASA DASHlink flight data, MaintNet logs
- **Backend:** FastAPI, Uvicorn
- **Frontend:** React, Vite, Three.js (React Three Fiber)
- **Language:** Python 3.11, JavaScript

## 6. Architecture

```
NASA C-MAPSS run-to-failure data
        │
        ▼
src/ml        preprocess → XGBoost / CNN / LSTM / Transformer + MC-dropout uncertainty
        │      5-fold out-of-fold RUL (mean, sigma) for every engine
        │
NASA flight data ──► src/anomaly   conv autoencoder, per-parameter attribution   ┐
MaintNet logs ─────► src/nlp       TF-IDF → LSA → k-means issue clusters         │
                                                                                 ▼
                                              src/fleet   simulator + CP-SAT rolling-horizon scheduler
                                                          policies: run to failure · fixed interval · AeroTwin
                                                                                 │
                                                                                 ▼
                                   demo/backend (FastAPI)  ──►  demo/frontend (React + Three.js)
```

Full detail: [docs/architecture.md](docs/architecture.md). Literature behind the design: [docs/literature_survey.md](docs/literature_survey.md).

## 7. Setup and Run

Requirements: Python 3.11, Node 18+. An NVIDIA GPU helps but is not required.

```bash
pip install -r requirements.txt
python -m src.pipeline --serve      # download data, train, simulate, report, build UI, start on http://127.0.0.1:8000
```

`src.pipeline` skips any step whose output already exists (`--force` redoes everything). Individual steps:

```bash
python -m src.download_datasets     # ~200 MB into data/ (optional: --with-ngafid, +1.1 GB)
python -m src.ml.train --all --seeds 3   # RUL models -> models/ml, reports/ml_results.json
python -m src.ml.oof                # out-of-fold predictions for the fleet
python -m src.anomaly.detector      # flight-anomaly autoencoder
python -m src.nlp.logs              # maintenance-log clusters
python -m src.fleet.compare         # policy comparison + replay data
python -m src.fleet.extras          # attach anomalies and logs to the timeline
python -m src.fleet.sensitivity     # availability vs spare-pool size
python -m src.make_report           # reports/benchmark.md
cd demo/frontend && npm install && npm run build
python -m uvicorn demo.backend.app:app --port 8000
```

Frontend development: `cd demo/frontend && npm run dev` (proxies `/api` to port 8000). Run every command from the repository root.

## 8. Results

Same simulated fleets (8 worlds, 40 aircraft, 365 days, 3 workshops, 10 spare engines), same failures, different maintenance strategy:

| Strategy | Availability | Failures / yr | Planned swaps | Life wasted per swap | Cost |
|---|---|---|---|---|---|
| Run to failure (corrective) | 88.9% | 125 | 0 | – | 32.9k |
| Fixed interval (tuned to 140 flights on these same fleets) | 94.6% | 18 | 170 | 60 flights | 26.1k |
| **AeroTwin (predictive)** | **96.6%** | **7** | 134 | 12 flights | **18.6k** |
| Perfect-RUL reference | 95.6% | 20 | 119 | 10 flights | 20.2k |

The fixed interval is tuned on the same fleets it is scored on, which favours that baseline. The perfect-RUL reference plans with a small safety margin, so it is a reference point rather than a hard bound. Spares are the binding constraint: AeroTwin pulls ahead from about 8 spare engines, and with fewer every strategy struggles (and the fixed interval does slightly better).

Remaining-life prediction, test RMSE in flights (lower is better, mean of 3 seeds): FD001 — XGBoost 14.7, LSTM 14.9, Transformer 15.1, 1D-CNN 17.4; published references on FD001: Babu 2016 18.45, Zheng 2017 16.14, Li 2018 12.61, DAST 2021 11.43. One standard pipeline with no per-subset tuning puts us in the range of the early deep-learning baselines, not the 2021 attention models. The raw uncertainty range covered only 49% of true values in the wear-out phase, so it is rescaled ×3 (about 97% coverage) before the scheduler uses it; the factor was chosen on this same data, so treat it as optimistic.

Flight-data anomaly detection (faults injected into held-out nominal flights): AUROC 0.93 spikes, 0.91 drift, 0.91 noise bursts, 0.67 stuck sensors, with 0.7% false alarms on nominal flights.

All tables, generated from the result files: [reports/benchmark.md](reports/benchmark.md).

## 9. Screenshots

| | |
|---|---|
| ![Fleet](assets/screenshots/01-fleet.png) | ![Aircraft twin](assets/screenshots/02-aircraft-twin.png) |
| ![Engine open](assets/screenshots/03-engine-open.png) | ![Wear slider](assets/screenshots/04-wear-slider.png) |

More, with captions: [assets/screenshots/](assets/screenshots/README.md).

## 10. Repository Structure

```
README.md · SUBMISSION_GUIDE.md · requirements.txt
src/        all Python: ml/ anomaly/ nlp/ fleet/, pipeline.py, download_datasets.py, make_report.py, paths.py
demo/       backend/ (FastAPI) · frontend/ (React + Three.js) · screenshots.py
data/       downloaded datasets (git-ignored)
models/     trained weights and generated binaries (git-ignored)
reports/    result files and benchmark.md
docs/       architecture.md · literature_survey.md · problem_statement.txt
assets/     screenshots/
submission/ DEMO.md · PRESENTATION.md
```

## 11. Team

Team members and roles: _to be added_.

## 12. Limits

- Fleet, workshops, spares, costs and maintenance-log attachments are simulation assumptions; the engine lives are real but come from one family of turbofan engines.
- Section-level wear (Fan, Compressor, Combustor, Turbine) is a sensor-drift index from an illustrative grouping of sensors; C-MAPSS does not label section-level faults.
- The link between flight anomalies and engine health is simulated: faults are injected into real nominal flights with probability rising as the engine degrades.
- Intended as decision support for maintainers, not autonomous maintenance authority.
