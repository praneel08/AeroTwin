# Presentation

## Presentation link

_Place the final `.pptx` in this folder, or add a shareable Google Drive / OneDrive viewer link here._

## Suggested slide outline

1. **Title:** AeroTwin — Predictive Maintenance & Fleet Availability (SIH 26249, Ministry of Defence).
2. **The problem:** reactive, fragmented maintenance leaves aircraft grounded; engines fail unexpectedly or are replaced long before they wear out.
3. **Our idea:** predict each engine's remaining life, plan swaps against workshop slots and spares, show it in a digital twin.
4. **Data:** real NASA C-MAPSS engine run-to-failure data, NASA flight data, real maintenance logs; fleet, workshops and spares simulated (stated openly).
5. **Prediction:** XGBoost / CNN / LSTM / Transformer with calibrated uncertainty, out-of-fold so no engine is predicted by a model that saw it. FD001 RMSE about 14.7 flights.
6. **Planning:** CP-SAT scheduler, re-solved daily, minimising expected failure cost plus wasted life under workshop and spare-engine limits.
7. **Results:** 96.6% ready to fly vs 88.9% (run to failure) and 94.6% (best fixed interval); 7 unplanned failures a year vs 125; cost −43%.
8. **Spares matter:** AeroTwin pulls ahead from about 8 spare engines; below that every strategy struggles.
9. **Digital twin demo:** screenshots from `assets/screenshots/` (fleet, engine open, wear slider).
10. **Honest limits and next steps:** simulated fleet, in-sample calibration, per-subset tuning and N-CMAPSS next.
