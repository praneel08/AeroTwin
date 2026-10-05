# Datasets

Downloaded by `src/download_datasets.py`. Not committed to git.

## `cmapss/`
NASA C-MAPSS turbofan degradation (FD001-FD004)

- Cite: Saxena et al., 'Damage propagation modeling for aircraft engine run-to-failure simulation', PHM 2008
- Sources:
  - https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip

## `tiny_ncmapss/`
tiny-N-CMAPSS (decimated N-CMAPSS, PHM 2021 challenge)

- Cite: Arias Chao et al., Data 6(1):5, 2021; Lovberg, PHM Society 2021
- Sources:
  - https://raw.githubusercontent.com/alovberg/tiny-N-CMAPSS/main/data/train_df.pkl
  - https://raw.githubusercontent.com/alovberg/tiny-N-CMAPSS/main/data/test_df.pkl

## `flight_anomaly_cvae/`
NASA DASHlink flight data (flap-position windows) from the CVAE repo

- Cite: Memarzadeh et al., 'Unsupervised anomaly detection in flight data using CVAE', Aerospace 7(8):115, 2020
- Sources:
  - https://raw.githubusercontent.com/nasa/CVAE/main/data/DASHlink_binary_Flaps_noAnomaly_train.npz
  - https://raw.githubusercontent.com/nasa/CVAE/main/data/DASHlink_binary_Flaps_noAnomaly_valid.npz
  - https://raw.githubusercontent.com/nasa/CVAE/main/data/DASHlink_binary_Flaps_noAnomaly_test.npz
  - https://raw.githubusercontent.com/nasa/CVAE/main/data/Sample_raw_data.npz

## `maintnet/`
MaintNet aviation maintenance logs (cleaned community release)

- Cite: Akhbardeh et al., MaintNet, COLING 2020 demos
- Sources:
  - https://raw.githubusercontent.com/nadine-amin/Cleaned-MaintNet-Aviation-Maintenance-Dataset/main/Cleaned%20Version%20of%20MaintNet%27s%20Aviation%20Maintenance%20Dataset.xlsx
  - https://raw.githubusercontent.com/nadine-amin/Cleaned-MaintNet-Aviation-Maintenance-Dataset/main/Abbreviations%20in%20MaintNet%27s%20Aviation%20Maintenance%20Dataset%20%2B%20Their%20Expansions.xlsx
  - https://raw.githubusercontent.com/nadine-amin/Cleaned-MaintNet-Aviation-Maintenance-Dataset/main/Misspellings%20from%20MaintNet%27s%20Aviation%20Maintenance%20Dataset%20%2B%20Their%20Corrections.xlsx
  - https://raw.githubusercontent.com/nadine-amin/Cleaned-MaintNet-Aviation-Maintenance-Dataset/main/Unexpanded%20Abbreviations%20from%20MaintNet%27s%20Aviation%20Maintenance%20Dataset.xlsx

Spares, maintenance depots and fleet records are **synthetic** (see `fleet/`): no public military data exists.
