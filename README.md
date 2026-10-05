# AeroTwin

Predictive maintenance and fleet-availability platform for **SIH 2026 problem 26249 (Air Power: Predictive Maintenance & Fleet Availability, Ministry of Defence)**.

Fragmented, reactive maintenance leaves aircraft on the ground. AeroTwin turns engine health data into a probabilistic remaining-useful-life (RUL) forecast, schedules maintenance against hangar slots and spare engines, and shows the result in a fleet dashboard with a 3D digital twin of each aircraft.

> **Honesty note.** No public military data exists. Engine degradation is **real NASA C-MAPSS run-to-failure data**; the fleet (40 aircraft, 80 engines), the three depots, the spare pool, costs and the maintenance-log attachments are **simulated** and labelled as such in the UI. Every RUL prediction driving the demo comes from a model that never trained on that engine (5-fold out-of-fold).

## What it does

| Module | What | Data |
|---|---|---|
| `ml/` | RUL prediction (XGBoost, 1D-CNN, LSTM, Transformer) with Monte Carlo dropout uncertainty | NASA C-MAPSS FD001–FD004 |
| `anomaly/` | Flight-sensor anomaly detection: conv autoencoder, threshold from nominal data only, per-parameter attribution | NASA DASHlink flight windows |
| `nlp/` | Maintenance-log analysis: domain-aware cleaning (keeps "not" and part numbers), TF-IDF, LSA, k-means issue clusters, component tagging | MaintNet aviation logs (6,169 records) |
| `fleet/` | Fleet simulator and rolling-horizon scheduler (OR-Tools CP-SAT) under depot-slot and spares limits; policy comparison | simulated fleet on C-MAPSS lives |
| `backend/` | FastAPI service over the replay | – |
| `frontend/` | React + Three.js dashboard: fleet board, 3D digital twin with exploded engine modules, schedule, impact | – |

## Results

Same simulated fleets (8 worlds, 40 aircraft, 365 days, 3 depots, 10 spare engines), same failures, different maintenance policy:

| Policy | Availability | Failures / yr | Planned swaps | Life wasted per swap | Cost |
|---|---|---|---|---|---|
| Repair on failure | 88.9% | 125 | 0 | – | 32.9k |
| Fixed interval (tuned to 140 cycles on these same fleets) | 94.7% | 18 | 170 | 60 cycles | 26.1k |
| **AeroTwin predictive** | **96.6%** | **7** | 134 | 12 cycles | **18.6k** |
| Perfect-RUL reference | 95.6% | 20 | 119 | 10 cycles | 20.2k |

The fixed interval is tuned on the same fleets it is scored on, which favours that baseline. The perfect-RUL reference plans with a small safety margin, so it is a reference point rather than a hard bound. Spares are the binding constraint (4 simulated fleets per point; AeroTwin / fixed interval / repair on failure): with 4 spares availability is 55.4% / 58.0% / 53.8%, with 6 it is 76.5% / 79.1% / 74.1%, with 8 it is 91.0% / 90.7% / 85.4%, with 10 it is 96.4% / 94.7% / 88.8%, and beyond about 12 extra engines add almost nothing. AeroTwin's advantage therefore depends on a sensible spare pool; with very few spares the fixed interval does slightly better.

RUL test-set RMSE in cycles (lower is better; mean of 3 seeds):

| Model | FD001 | FD002 | FD003 | FD004 |
|---|---|---|---|---|
| XGBoost | 14.7 | 27.9 | 15.6 | 28.9 |
| 1D CNN | 17.4 | 28.0 | 21.2 | 29.3 |
| LSTM | 14.9 | 27.5 | 15.0 | 27.7 |
| Transformer | 15.1 | 27.4 | 14.9 | 27.8 |

For reference, published FD001 RMSE: Babu 2016 18.45, Zheng 2017 16.14, Li 2018 12.61, DAST 2021 11.43 (see `docs/literature_survey.md`). One standard pipeline with no per-subset tuning puts us in the range of the early deep-learning baselines, not the 2021 attention models. The MC-dropout uncertainty is overconfident out of the box (the ±2σ interval covered 63% of true RUL), so it is rescaled ×3 to reach about 96% coverage in the degradation phase before the scheduler uses it.

Flight-data anomaly detection (faults injected into held-out nominal flights): AUROC 0.93 spikes, 0.91 drift, 0.91 noise bursts, 0.67 stuck sensors, with 0.7% false alarms on nominal flights. Stuck readings on already-steady signals are inherently hard to see.

## Run it

Requirements: Python 3.11, Node 18+, an NVIDIA GPU helps but is not required (training takes a few minutes per model on CPU).

```bash
py -3.11 -m pip install -r requirements.txt
py -3.11 scripts/pipeline.py --serve      # download data, train, simulate, build UI, start on http://127.0.0.1:8000
```

`pipeline.py` skips any step whose output already exists (`--force` redoes everything). Individual steps:

```bash
py -3.11 scripts/download_datasets.py     # ~200 MB into dataset/ (optional: --with-ngafid, +1.1 GB)
py -3.11 -m ml.train --all --seeds 3      # RUL models
py -3.11 -m ml.oof                        # out-of-fold predictions for the fleet
py -3.11 -m anomaly.detector              # flight-anomaly autoencoder
py -3.11 -m nlp.logs                      # maintenance-log clusters
py -3.11 -m fleet.compare                 # policy comparison + replay data
py -3.11 -m fleet.extras                  # attach anomalies and logs to the timeline
py -3.11 -m fleet.sensitivity             # availability vs spare-pool size
cd frontend && npm install && npm run build
py -3.11 -m uvicorn backend.app:app --port 8000
```

Frontend development: `cd frontend && npm run dev` (proxies `/api` to port 8000).

## Using the dashboard

Three tabs, light theme by default with a dark toggle (top right; the choice is remembered).

- **Fleet:** the whole fleet at a glance: aircraft ready to fly, aircraft needing attention, spare engines in stock, a status map of all 40 aircraft, the engines most at risk and the swaps booked for the next two weeks. The switch at the top shows the same fleet under *Run to failure*, *Fixed interval* or *AeroTwin*, and the replay bar (bottom) plays or scrubs the simulated year. Click any aircraft to open its twin.
- **Aircraft twin:** a 3D model of the aircraft with a short plain-language summary on the right. Hover an engine for a tooltip; click it and it splits into Fan, Compressor, Combustor and Turbine with wear labels. The *Condition*, *X-ray* and *Alerts* chips change what the model shows, and the "How this engine wore out" slider replays the wear of the opened engine from new to today. Prev/next arrows step through the fleet.
- **Results:** the headline results page: a five-number scorecard (ready to fly, unplanned failures, cost, prediction error, anomaly detection), then fleet impact (comparison bars, the year at a glance, how many spare engines are needed) and model performance (prediction accuracy against published results, how far the uncertainty range can be trusted, anomaly detection by fault type, repair-note analysis). The maintenance plan and a note on what is real versus simulated sit in two collapsed sections at the bottom.

Screenshots of every screen in both themes: `py -3.11 scripts/screenshots.py` (needs `playwright install chromium`).

## Method

The design follows a literature survey of 24 papers (`docs/literature_survey.md`): standard C-MAPSS preprocessing, probabilistic RUL via Monte Carlo dropout, then a rolling-horizon schedule that trades expected failure cost against wasted engine life, as in the TU Delft line of work (de Pater and Mitici; Lee and Mitici). The scheduler solves a CP-SAT assignment every simulated day: each alarmed engine picks a start day (or defers) minimising `C_fail · P(fail before start) + C_engine/life · E[wasted life]`, subject to at most one start per depot per day and a cumulative limit from the spares that will be serviceable by then.

## Limits

- Fleet, depots, spares, costs and maintenance-log attachments are simulation assumptions; the engine lives are real but come from a single turbofan family.
- Module-level condition is a sensor-drift index from an illustrative sensor-to-module grouping; C-MAPSS does not label module faults.
- The flight-anomaly link to engine health is simulated: faults are injected into real nominal flights with probability rising as the engine degrades.
- Intended as decision support for maintainers, not autonomous maintenance authority.

## Layout

```
dataset/      downloaded data (git-ignored)      ml/         RUL models
anomaly/      flight anomaly detector            nlp/        maintenance-log analysis
fleet/        simulator, scheduler, comparison   backend/    FastAPI service
frontend/     React + Three.js UI                scripts/    download, pipeline, screenshots
docs/         literature survey                  artifacts/  trained models and results (generated)
```
