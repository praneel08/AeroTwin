"""Download the datasets used by AeroTwin into ./dataset (stdlib only, safe to re-run).

    py -3.11 -m src.download_datasets                 # default set (~230 MB)
    py -3.11 -m src.download_datasets --with-ngafid   # + NGAFID flights/maintenance (~1.1 GB)
"""
import argparse
import sys
import tarfile
import time
import urllib.request
import zipfile
from pathlib import Path

from .paths import DATA
GH = "https://raw.githubusercontent.com"

DATASETS = {
    "cmapss": {
        "title": "NASA C-MAPSS turbofan degradation (FD001-FD004)",
        "cite": "Saxena et al., 'Damage propagation modeling for aircraft engine run-to-failure simulation', PHM 2008",
        "files": [("https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip",
                   "CMAPSS.zip")],
        "expect": [f"{k}_FD00{i}.txt" for k in ("train", "test", "RUL") for i in range(1, 5)],
    },
    "tiny_ncmapss": {
        "title": "tiny-N-CMAPSS (decimated N-CMAPSS, PHM 2021 challenge)",
        "cite": "Arias Chao et al., Data 6(1):5, 2021; Lovberg, PHM Society 2021",
        "files": [(f"{GH}/alovberg/tiny-N-CMAPSS/main/data/{n}", n) for n in ("train_df.pkl", "test_df.pkl")],
        "expect": ["train_df.pkl", "test_df.pkl"],
    },
    "flight_anomaly_cvae": {
        "title": "NASA DASHlink flight data (flap-position windows) from the CVAE repo",
        "cite": "Memarzadeh et al., 'Unsupervised anomaly detection in flight data using CVAE', Aerospace 7(8):115, 2020",
        "files": [(f"{GH}/nasa/CVAE/main/data/{n}", n) for n in (
            "DASHlink_binary_Flaps_noAnomaly_train.npz", "DASHlink_binary_Flaps_noAnomaly_valid.npz",
            "DASHlink_binary_Flaps_noAnomaly_test.npz", "Sample_raw_data.npz")],
        "expect": ["DASHlink_binary_Flaps_noAnomaly_train.npz"],
    },
    "maintnet": {
        "title": "MaintNet aviation maintenance logs (cleaned community release)",
        "cite": "Akhbardeh et al., MaintNet, COLING 2020 demos",
        "files": [(f"{GH}/nadine-amin/Cleaned-MaintNet-Aviation-Maintenance-Dataset/main/" + n.replace(" ", "%20")
                   .replace("'", "%27").replace("+", "%2B"), n) for n in (
            "Cleaned Version of MaintNet's Aviation Maintenance Dataset.xlsx",
            "Abbreviations in MaintNet's Aviation Maintenance Dataset + Their Expansions.xlsx",
            "Misspellings from MaintNet's Aviation Maintenance Dataset + Their Corrections.xlsx",
            "Unexpanded Abbreviations from MaintNet's Aviation Maintenance Dataset.xlsx")],
        "expect": ["Cleaned Version of MaintNet's Aviation Maintenance Dataset.xlsx"],
    },
}
OPTIONAL = {
    "ngafid": {
        "title": "NGAFID: Cessna 172 flights linked to maintenance events (2-day subset)",
        "cite": "Yang & Desell, arXiv:2210.07317, 2022 (Zenodo 10.5281/zenodo.6624956)",
        "files": [("https://zenodo.org/records/6624956/files/2days.tar.gz?download=1", "2days.tar.gz")],
        "expect": ["2days.tar.gz"],
    },
}


def fetch(url: str, dest: Path):
    req = urllib.request.Request(url, headers={"User-Agent": "aerotwin-downloader"})
    with urllib.request.urlopen(req, timeout=60) as r:
        total = int(r.headers.get("Content-Length") or 0)
        if dest.exists() and total and dest.stat().st_size == total:
            print(f"    skip {dest.name} (already present)")
            return False
        part = dest.with_suffix(dest.suffix + ".part")
        done, t0 = 0, time.time()
        with open(part, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
                done += len(chunk)
                rate = done / max(time.time() - t0, 1e-6) / 1e6
                pct = f"{100 * done / total:5.1f}%" if total else "  ?  "
                if sys.stdout.isatty():
                    print(f"\r    {dest.name}: {done / 1e6:8.1f} MB {pct} {rate:5.1f} MB/s", end="", flush=True)
        print(f"{chr(13) if sys.stdout.isatty() else ''}    {dest.name}: {done / 1e6:.1f} MB downloaded")
        if total and done != total:
            part.unlink()
            raise IOError(f"size mismatch for {dest.name}: got {done}, expected {total}")
        part.replace(dest)
        return True


def unpack(folder: Path):
    """Extract zips (including nested ones) and tarballs-as-is; delete extracted zip archives."""
    while True:
        zips = list(folder.rglob("*.zip"))
        if not zips:
            return
        for z in zips:
            with zipfile.ZipFile(z) as zf:
                zf.extractall(z.parent)
            z.unlink()


def flatten(folder: Path):
    """Move files nested in archive sub-folders up to the dataset folder, then drop the empty folders."""
    for f in [p for p in folder.rglob("*") if p.is_file() and p.parent != folder]:
        target = folder / f.name
        if target.exists():
            f.unlink()
        else:
            f.replace(target)
    for d in sorted((p for p in folder.rglob("*") if p.is_dir()), reverse=True):
        try:
            d.rmdir()
        except OSError:
            pass


def get(name: str, spec: dict):
    print(f"[{name}] {spec['title']}")
    folder = DATA / name
    folder.mkdir(parents=True, exist_ok=True)
    if all((folder / n).exists() for n in spec["expect"]):
        print("    already present, skipped")
        return
    for url, fname in spec["files"]:
        fetch(url, folder / fname)
    unpack(folder)
    flatten(folder)


def write_readme(selected: dict):
    lines = ["# Datasets", "", "Downloaded by `src/download_datasets.py`. Not committed to git.", ""]
    for name, s in selected.items():
        lines += [f"## `{name}/`", s["title"], "", f"- Cite: {s['cite']}", "- Sources:"]
        lines += [f"  - {u.split('?')[0]}" for u, _ in s["files"]]
        lines.append("")
    lines += ["Spares, maintenance depots and fleet records are **synthetic** (see `fleet/`): no public military data exists."]
    (DATA / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def verify():
    ok = True
    try:
        import numpy as np
        import pandas as pd
        n = pd.read_csv(DATA / "cmapss/train_FD001.txt", sep=r"\s+", header=None).shape
        print(f"  cmapss train_FD001: {n[0]} rows x {n[1]} cols (expect 26 cols)")
        ok &= n[1] == 26
        a = np.load(DATA / "flight_anomaly_cvae/DASHlink_binary_Flaps_noAnomaly_train.npz")
        print(f"  CVAE npz arrays: {list(a.keys())}")
        for f in ("train_df.pkl", "test_df.pkl"):
            d = pd.read_pickle(DATA / "tiny_ncmapss" / f)
            print(f"  tiny_ncmapss {f}: {d.shape}")
    except Exception as e:  # report but don't crash the download step
        print(f"  verify problem: {e!r}")
        ok = False
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--with-ngafid", action="store_true", help="also download NGAFID 2-day subset (~1.1 GB)")
    args = ap.parse_args()
    selected = dict(DATASETS)
    if args.with_ngafid:
        selected.update(OPTIONAL)
    DATA.mkdir(exist_ok=True)
    for name, spec in selected.items():
        get(name, spec)
    write_readme(selected)
    print("Verifying:")
    sys.exit(0 if verify() else 1)


if __name__ == "__main__":
    main()
