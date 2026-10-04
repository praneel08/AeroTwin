# Literature survey

Survey behind AeroTwin's method (SIH 26249, Air Power: predictive maintenance and fleet availability). 24 papers across four areas. 22 were read in full from the source; **Babu 2016, Li 2018 and Zheng 2017 are paywalled**, so their metadata was checked but their FD001 numbers come from comparison tables in papers that were read (Ragab et al. 2020, DAST). Items marked *unverified* could not be confirmed from the source.

## 1. Remaining useful life on C-MAPSS (the core model)

| # | Paper | What it contributes | Code |
|---|---|---|---|
| 1 | Saxena, Goebel, Simon, Eklund. *Damage propagation modeling for aircraft engine run-to-failure simulation.* IEEE PHM 2008. DOI 10.1109/PHM.2008.4711414 | The C-MAPSS dataset (6 flight conditions, 21 sensors + 3 settings) and the asymmetric PHM08 Score. Its Eq. 9 attaches the weights to the wrong sign relative to its text; later papers use exp(−d/13)−1 for d<0 and exp(d/10)−1 for d≥0, with d = predicted − true. | none |
| 2 | Babu, Zhao, Li. *Deep CNN based regression approach for estimation of RUL.* DASFAA 2016, LNCS 9642, pp. 214–228 | First CNN for RUL. FD001 RMSE 18.45 (via Ragab et al.). | none found |
| 3 | Li, Ding, Sun. *RUL estimation in prognostics using deep convolution neural networks.* Reliability Eng. & System Safety 172:1–11, 2018 | 1D-CNN on windows. FD001 RMSE 12.61 (via secondary tables). | third-party baselines: biswajitsahoo1111/rul_codes_open |
| 4 | Zheng, Ristovski, Farahat, Gupta. *LSTM network for RUL estimation.* IEEE ICPHM 2017, pp. 88–95 | Deep LSTM regression, piecewise RUL cap. FD001 RMSE 16.14 (via secondary tables). | third-party only |
| 5 | Zhang, Song, Li. *Dual Aspect Self-Attention based on Transformer for RUL Prediction (DAST).* arXiv:2106.15842, 2021 | Transformer with sensor and time-step attention. FD001 RMSE 11.43, window 40/60, cap 125, 14 sensors. | github.com/Zzzsdu/DAST |
| 6 | Fu, Hu, Peng, Chu. *Supervised Contrastive Learning based Dual-Mixer Model for RUL Prediction.* RESS 251:110398, 2024. arXiv:2401.16462 | MLP-Mixer style model plus supervised contrastive training. Reports RMSE on RUL scaled to [0,1], so not directly comparable. | github.com/fuen1590/PhmDeepLearningProjects |

Also used as a reference: Ragab et al., *Attention Sequence to Sequence Model for Machine RUL Prediction*, arXiv:2007.09868 (tabulates random forest, gradient boosting, SVM baselines).

**Standard pipeline adopted:** drop the 7 constant sensors (1, 5, 6, 10, 16, 18, 19), min-max scale (per operating regime for FD002/FD004), stride-1 windows of 30, RUL label capped at 125, one prediction per test engine from its last window, RMSE + PHM08 Score.

## 2. N-CMAPSS, physics-plus-ML hybrids and digital twins

| # | Paper | What it contributes |
|---|---|---|
| 7 | Arias Chao, Kulkarni, Goebel, Fink. *Aircraft Engine Run-to-Failure Dataset under Real Flight Conditions for Prognostics and Diagnostics.* Data 6(1):5, 2021. DOI 10.3390/data6010005 | N-CMAPSS: 8 subsets, 128 units, 7 failure modes, driven by real recorded flights. The full download is about 15.8 GB, so this project uses the decimated tiny-N-CMAPSS. |
| 8 | Arias Chao et al. *Fusing physics-based and deep learning models for prognostics.* RESS 217 (2022) 107961. arXiv:2003.00732 | A Kalman filter calibrates the physics model's health parameters, which are fed to the network. Reduces RMSE by 16–47% and extends the prediction horizon by 127% on DS02. No official code found. |
| 9 | Lövberg. *RUL Prediction of Aircraft Engines with Variable Length Input Sequences.* PHM Society 2021. DOI 10.36001/phmconf.2021.v13i1.3108 | PHM 2021 challenge winner (score 3.006). Healthy-model residuals as the degradation signal plus a dilated CNN. Released tiny-N-CMAPSS: github.com/alovberg/tiny-N-CMAPSS. |
| 10 | Solís-Martín, Galán-Páez, Borrego-Díaz. *A stacked deep convolutional neural network to predict the RUL of a turbofan engine.* PHM Society 2021. arXiv:2111.12689 | 3rd place (3.651). Two stacked CNNs. Official code: DatrikIntelligence/Stacked-DCNN-RUL-PHM21. |
| 11 | Kapteyn, Pretorius, Willcox. *A probabilistic graphical model foundation for enabling predictive digital twins at scale.* Nature Computational Science 1(5):337–347, 2021. DOI 10.1038/s43588-021-00069-0 | The reference digital-twin design: a dynamic Bayesian network linking asset state, twin state, sensor data and control decisions; demonstrated on a UAV wing. Code: michaelkapteyn/UAV-Digital-Twin. |
| 12 | Wu, Li. *A Framework of Dynamic Data Driven Digital Twin for Complex Engineering Products: the Example of Aircraft Engine Health Management.* Procedia Manufacturing 55:139–146, 2021 | Weaker example: an LSTM on C-MAPSS FD004 inside an IIoT diagram. No code. |

## 3. From predictions to maintenance decisions

| # | Paper | What it contributes |
|---|---|---|
| 13 | de Pater, Mitici. *Predictive maintenance for multi-component systems of repairables with RUL prognostics and a limited stock of spare components.* RESS 214:107761, 2021 | Particle-filter RUL, rolling-horizon integer program with spare stock and leasing; 13 wide-bodies. Cost 48% below corrective and 30% below preventive, zero aircraft-on-ground events. |
| 14 | de Pater, Reijns, Mitici. *Alarm-based predictive maintenance scheduling for aircraft engines with imperfect RUL prognostics.* RESS 221:108341, 2022 | CNN RUL on C-MAPSS, alarm threshold, rolling-horizon ILP; total cost 24.3% above perfect prognostics. |
| 15 | Lee, Mitici. *Deep reinforcement learning for predictive aircraft maintenance using probabilistic RUL prognostics.* RESS 230:108908, 2023 | MC-dropout RUL distribution as the state of a soft actor-critic agent. Cost 29.3% below replace-at-mean-RUL; 95.6% of unscheduled replacements prevented. |
| 16 | Mitici, de Pater, Barros, Zeng. *Dynamic predictive maintenance for multiple components using data-driven probabilistic RUL prognostics: the case of turbofan engines.* RESS 234:109199, 2023 | Probabilistic RUL plus renewal-reward model plus rolling ILP for 50 engines. Cost 53% below time-based. |
| 17 | Tseremoglou, Santos. *Condition-Based Maintenance scheduling of an aircraft fleet under partial observability: a Deep RL approach.* RESS 241:109582, 2024 | POMDP policy per component, then a DQN fleet scheduler with manpower/material limits; real data from a European airline (34 aircraft). Cost 46.2% below corrective. |
| 18 | Peschiera, Battaïa, Haït, Dupin. *Long term planning of military aircraft flight and maintenance operations.* arXiv:2001.09856, 2020 | Military baseline: mixed-integer model maximising fleet availability on fixed calendar/flight-hour limits (no prognostics), French Air Force-inspired scenarios. |

None of the scheduling papers (13–17) release code; AeroTwin's scheduler is our own implementation with OR-Tools CP-SAT.

**Shared framework:** probabilistic RUL → trigger (threshold with safety margin, risk cap, or policy) → rolling-horizon schedule under slot, workforce and spares limits → compare against corrective, time-based and perfect-RUL baselines on cost, failures, wasted life, aircraft on ground.

## 4. Anomaly detection, maintenance-log text and platform design

| # | Paper | What it contributes |
|---|---|---|
| 19 | Das, Matthews, Srivastava, Oza. *Multiple Kernel Learning for Heterogeneous Anomaly Detection (MKAD).* KDD 2010, pp. 47–56. DOI 10.1145/1835804.1835813 | One-class SVM over discrete-sequence and continuous (SAX) kernels on flight data. Code: nasa/PyMKAD. |
| 20 | Memarzadeh, Matthews, Avrekh. *Unsupervised Anomaly Detection in Flight Data Using Convolutional Variational Auto-Encoder.* Aerospace 7(8):115, 2020. DOI 10.3390/aerospace7080115 | Conv-VAE, reconstruction-error score, threshold from nominal data only. Code and data: nasa/CVAE (used here). |
| 21 | Akhbardeh, Desell, Zampieri. *MaintNet: A Collaborative Open-Source Library for Predictive Maintenance Language Resources.* COLING 2020 demos, pp. 7–11. arXiv:2005.12443 | 6,169 aviation maintenance log records plus abbreviation and misspelling dictionaries. A cleaned community release is used here. |
| 22 | Brundage, Sexton, Hodkiewicz, Dima, Lukens. *Technical Language Processing: Unlocking Maintenance Knowledge.* Manufacturing Letters 27:42–46, 2021 | Position paper: generic NLP breaks on maintenance text (stop-word removal deletes "not"; cleaning strips asset IDs). Motivates our domain-aware cleaning. |
| 23 | Yang, Desell. *A Large-Scale Annotated Multivariate Time Series Aviation Maintenance Dataset from the NGAFID.* arXiv:2210.07317, 2022 | The only public dataset linking per-flight sensors to maintenance events (28,935 Cessna 172 flights, 2,111 events). Results are modest (about 76% binary accuracy), which calibrates expectations for real data. Optional in this project (`--with-ngafid`). |
| 24 | Kabashkin, Susanin. *Unified Ecosystem for Data Sharing and AI-Driven Predictive Maintenance in Aviation.* Computers 13(12):318, 2024 | Conceptual layered architecture (ingest, store, analytics, alerts, compliance). No empirical validation; used for framing only. |

Not read: Korvesis, Besseau, Vazirgiannis, *Predictive Maintenance in Aviation: Failure Prediction from Post-Flight Reports*, IEEE ICDE 2018 (*unverified*, from search results only).

## Licensing notes

nasa/CVAE and the MaintNet community release declare no licence on GitHub; they are used here for research and demonstration and are not redistributed in this repository (`dataset/` is git-ignored and downloaded on demand).
