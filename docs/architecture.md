# Architecture Document — AeroTwin
### Predictive Maintenance & Fleet Availability (SIH 26249, Ministry of Defence)

## 1. Problem framing

Reactive maintenance replaces an engine only after it fails (an unplanned, long grounding), and fixed-interval maintenance replaces it long before it has worn out (wasted life, scarce spares consumed early). The decision that matters is *when to swap each engine*, given an uncertain forecast of its remaining life and finite resources: workshop slots per day and a pool of spare engines that only come back after refurbishment.

AeroTwin treats this as two stacked problems:

1. **Prognostics:** estimate each engine's remaining useful life (RUL, in flights) with an honest uncertainty range.
2. **Decision:** choose swap dates that minimise expected failure cost plus wasted life, subject to workshop and spares limits.

## 2. Data

| Source | Used for | Notes |
|---|---|---|
| NASA C-MAPSS (FD001–FD004) | RUL models and the fleet simulation | Real run-to-failure engine simulations: 21 sensors + 3 settings, 100–260 engines per subset. 7 constant sensors dropped, 14 kept. |
| tiny-N-CMAPSS | Downloaded for extension | Decimated N-CMAPSS (real flight profiles). Not used by the shipped models. |
| NASA DASHlink flight windows (from the CVAE repo) | Flight-anomaly detector | 160-step windows of 10 parameters, all nominal. |
| MaintNet aviation logs | Maintenance-log analysis | 6,169 real maintenance notes plus abbreviation and misspelling dictionaries. |
| Simulated | Fleet, workshops, spares, costs, log attachments | No public military data exists; everything simulated is labelled as such in the UI. |

All downloads are handled by `src/download_datasets.py` into `data/`.

## 3. Remaining-useful-life models (`src/ml`)

Standard pipeline from the literature survey (see `docs/literature_survey.md`):

- 14 sensors, min-max scaled (per operating regime for FD002/FD004, found by k-means on the three settings).
- Stride-1 windows of 30 cycles; label = RUL at the last cycle, capped at 125.
- One prediction per test engine from its last window; metrics: RMSE and the asymmetric PHM08 score.
- Models: XGBoost baseline, 1D-CNN, LSTM, small Transformer, all with dropout so Monte Carlo dropout (30 passes) gives a mean and a spread.

`src/ml/oof.py` produces **5-fold out-of-fold** predictions for every FD001 engine at every cycle, so the fleet simulation is driven by predictions from models that never saw that engine.

**Uncertainty calibration.** Raw MC-dropout ranges were overconfident (the ±2σ interval covered 49% of true RUL in the wear-out phase). The scheduler therefore uses σ × 3 (`SIGMA_CAL` in `src/fleet/sim.py`), which gives about 97% coverage on the same out-of-fold data. This is an in-sample choice and is reported as optimistic.

## 4. Flight-data anomaly detection (`src/anomaly`)

A 1D convolutional autoencoder (latent size 96) is trained on nominal flight windows only. A window's score is the maximum, over the 10 parameters, of its reconstruction error divided by that parameter's nominal 95th-percentile error; the alert threshold is the 99th percentile of the score on nominal validation windows. The per-parameter breakdown tells a maintainer which signal drove a flag. It is evaluated by injecting four fault types (spikes, slow drift, stuck sensor, noise bursts) into held-out flights.

## 5. Maintenance-log analysis (`src/nlp`)

Domain-aware cleaning follows the Technical Language Processing literature: negations ("not") and part numbers survive, abbreviations and known misspellings are expanded from the MaintNet dictionaries. Then TF-IDF (1–2-grams), truncated SVD (LSA, 80 dimensions) and k-means (k chosen by silhouette from 8–14) give issue clusters, and a keyword taxonomy tags the aircraft component. `classify()` assigns a new note to a cluster and component.

## 6. Fleet simulation and scheduler (`src/fleet`)

**World.** 40 aircraft × 2 engines, 365 days, one flight cycle per serviceable day. Each engine position follows a real C-MAPSS run-to-failure trajectory (a new trajectory starts after each replacement). Three workshops can each start one swap per day. A pool of 10 spare engines is consumed by every swap and returns refurbished after 20 days. A planned swap grounds the aircraft for 3 days; a failure for 12 days (plus any wait for a spare).

**Strategies compared on identical worlds** (`src/fleet/sim.py`):

| Strategy | Rule |
|---|---|
| Run to failure | Replace only after failure. |
| Fixed interval | Replace after T flights; T is tuned over 100–200 on the same worlds (a strong baseline). |
| AeroTwin | Alarm when P(fail within 40 flights) > 3%; a CP-SAT model assigns each alarmed engine a start day within 30 days (or defers). |
| Perfect-RUL reference | The same scheduler with the true RUL plus a small margin. |

**Scheduler objective.** For each alarmed engine and candidate start day `d`:
`cost(d) = C_fail · P(fail before d) + (C_engine / L) · E[wasted life at d]`
with `C_fail = 8·(12−3) + 60 = 132` (extra downtime plus secondary damage), `C_engine = 100`, `L = 206` flights (mean life). Constraints: at most 3 starts per day (one per workshop) and, for every day, cumulative starts ≤ spares that will be serviceable by then. The model is re-solved daily (rolling horizon).

`compare.py` runs all strategies over 8 simulated fleets in parallel and records one fleet's full daily replay; `extras.py` attaches flight-anomaly scores and repair notes to that timeline; `sensitivity.py` varies the spare-pool size.

## 7. Backend (`demo/backend/app.py`)

A FastAPI service over the precomputed replay (no torch at run time).

| Endpoint | Returns |
|---|---|
| `GET /api/meta` | Fleet size, days, workshops, notice on real vs simulated data |
| `GET /api/fleet?day&policy` | Every aircraft's status, per-engine remaining life and plan, fleet KPIs |
| `GET /api/aircraft/{a}?day&policy` | One aircraft: sensors, wear by engine section and its history, anomaly bars, repair notes |
| `GET /api/schedule?day&policy` | Planned swaps with workshops, in-progress work, spares series |
| `GET /api/kpis` | Policy comparison and availability series |
| `GET /api/sensitivity` | Availability vs spare-pool size |
| `GET /api/models` | Model accuracy, anomaly results, repair-log clusters, uncertainty coverage |

It also serves the built frontend, so one process (`uvicorn demo.backend.app:app`) runs the whole demo.

## 8. Frontend (`demo/frontend`)

React + Vite, one stylesheet of CSS variables with a light theme (default) and a dark theme, and a Three.js scene (React Three Fiber).

- **Fleet:** headline numbers, a status map of all 40 aircraft, the engines most at risk, swaps booked, a policy switch and a replay bar.
- **Aircraft twin:** a 3D aircraft with a plain-language summary. Hover for tooltips; click an engine to open it into Fan / Compressor / Combustor / Turbine with wear labels; Condition, X-ray and Alerts layers; a slider that replays the opened engine's wear from new to today.
- **Results:** the headline scorecard, fleet impact and model performance.

Section-level wear is a sensor-drift index from an illustrative grouping of sensors (the NASA data does not label section-level faults).

## 9. Repository layout and conventions

- `src/paths.py` is the single place that defines `data/`, `models/`, `reports/` and the frontend location; nothing else hard-codes a path.
- Run everything from the repository root as modules (`python -m src.ml.train`, `python -m uvicorn demo.backend.app:app`).
- `data/` and `models/` are git-ignored and re-created by `python -m src.pipeline`; `reports/` is tracked.

## 10. Limitations and future work

- The fleet is simulated, and the fixed-interval baseline and the uncertainty factor are tuned on the same simulated data they are evaluated on.
- RUL accuracy is that of one standard pipeline (FD001 RMSE about 14.7), not the 2021 state of the art; per-subset tuning, N-CMAPSS and physics-informed hybrids are the obvious next steps (see the literature survey).
- Spare engines are the binding constraint in the simulation; modelling multiple part types, repair-agency queues and real fleet data are the main extensions.
- Intended as decision support for maintainers, not autonomous maintenance authority.
