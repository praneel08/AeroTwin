# Demo Video

## Demo video link

_Add the YouTube / Google Drive link here once recorded (make sure it opens without requesting permission)._

## Suggested script (about 3–4 minutes)

Run the app first: `python -m src.pipeline --serve`, then open http://127.0.0.1:8000.

1. **Fleet (30 s).** "This is a simulated fleet of 40 aircraft over one year, driven by real NASA engine-wear data." Point at *Ready to fly*, *Need attention* and *Spare engines*, and at the status map.
2. **Compare strategies (30 s).** Switch the top control between *Run to failure*, *Fixed interval* and *AeroTwin* and show how the same fleet changes. Press play on the replay bar.
3. **Aircraft twin (90 s).** Click an aircraft with an engine at risk. Hover an engine, click it to open it into Fan / Compressor / Combustor / Turbine, toggle **X-ray** and **Alerts**, then drag **How this engine wore out** from new to today. Read the plain-language summary on the right.
4. **Results (60 s).** Walk the scorecard (ready to fly, failures, cost, prediction error, anomaly detection), then the model-performance section: accuracy against published results, the uncertainty calibration, anomaly detection by fault type.
5. **Close (15 s).** State what is real (NASA engine wear) and what is simulated (fleet, workshops, spares, costs), and that AeroTwin is decision support for maintainers.
