"""Maintenance-log NLP on MaintNet aviation records: cleaning -> TF-IDF -> LSA -> k-means issue clusters + component tags.

Domain-aware cleaning follows the Technical Language Processing warnings (Brundage et al. 2021):
negations ("not") and alphanumeric part IDs are kept; abbreviations and known misspellings are expanded from the
MaintNet dictionaries.

    py -3.11 -m nlp.logs
"""
import json
import pickle
import re
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import Normalizer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "dataset" / "maintnet"
ART = ROOT / "artifacts" / "nlp"
STOP = set(ENGLISH_STOP_WORDS) - {"not", "no", "nor", "off", "out", "over", "under", "up", "down", "low", "high"}

# Component taxonomy used to link a log entry to a spares line / subsystem (first match wins, in this order).
COMPONENTS = {
    "Propeller / governor": r"\b(prop|propeller|governor|spinner)\b",
    "Landing gear / brakes / tyres": r"\b(brake|brakes|tire|tires|tyre|nose gear|main gear|gear|wheel|strut|shimmy|rotor|caliper)\b",
    "Fuel system": r"\b(fuel|carburetor|carb|injector|primer|boost pump|gascolator|tank)\b",
    "Ignition / magnetos": r"\b(magneto|mag|spark plug|plugs|ignition|harness)\b",
    "Engine / cylinders / oil": r"\b(engine|cylinder|cylinders|oil|compression|valve|piston|crankcase|idle|rpm|exhaust|muffler|baffle|cowl|cowling|gasket|gaskets|intake|rocker|cover|bolt|bolts|cooler|rod|tie|seal|screw|plug|leak|leaking|rtv)\b",
    "Electrical / battery": r"\b(battery|alternator|generator|voltage|regulator|breaker|wiring|wire|light|lights|strobe|starter|electrical|switch)\b",
    "Avionics / instruments": r"\b(radio|transponder|gps|altimeter|compass|gyro|instrument|pitot|static|antenna|avionics|vacuum|gauge|indicator)\b",
    "Flight controls": r"\b(flap|flaps|aileron|elevator|rudder|trim|cable|control|controls|yoke|pedal)\b",
    "Airframe / cabin": r"\b(door|window|seat|belt|latch|panel|skin|crack|cracked|corrosion|fairing|windshield|canopy)\b",
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9/#\-\.\s]", " ", str(s).lower())).strip()


def load_dictionaries():
    ab = pd.read_excel(next(SRC.glob("Abbreviations*")), header=1)
    ms = pd.read_excel(next(SRC.glob("Misspellings*")), header=1)
    abbr = {_norm(a): _norm(e) for a, e in zip(ab.iloc[:, 0], ab.iloc[:, 1]) if isinstance(a, str) and isinstance(e, str)}
    miss = {_norm(a): _norm(c) for a, c in zip(ms.iloc[:, 0], ms.iloc[:, 1]) if isinstance(a, str) and isinstance(c, str)}
    return abbr, miss


def load_records():
    df = pd.read_excel(next(SRC.glob("Cleaned Version*")), header=0)
    df = df.iloc[1:].reset_index(drop=True)  # first row repeats the PROBLEM/ACTION sub-header
    df = df.rename(columns={df.columns[0]: "id", df.columns[3]: "text"})
    df = df[df["text"].notna()].copy()
    df["id"] = df["id"].astype(int)
    return df[["id", "text"]]


class Cleaner:
    def __init__(self):
        self.abbr, self.miss = load_dictionaries()

    def __call__(self, s: str) -> str:
        toks = []
        for t in _norm(s).split():
            t = self.miss.get(t, t)
            t = self.abbr.get(t, t)
            toks.extend(t.split())
        return " ".join(t for t in toks if t not in STOP)


def component(text: str) -> str:
    for name, pat in COMPONENTS.items():
        if re.search(pat, text):
            return name
    return "Other"


def build(k_range=range(8, 15, 2), seed=0):
    df = load_records()
    clean = Cleaner()
    df["clean"] = [clean(t) for t in df["text"]]
    # keep part numbers / alphanumerics and negations (token pattern allows digits and hyphens)
    tfidf = TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_df=0.5, token_pattern=r"[a-z0-9][a-z0-9\-/#]+")
    lsa = make_pipeline(TruncatedSVD(80, random_state=seed), Normalizer(copy=False))
    X = lsa.fit_transform(tfidf.fit_transform(df["clean"]))
    scores = {}
    for k in k_range:
        lab = KMeans(k, n_init=5, random_state=seed).fit_predict(X)
        scores[k] = float(silhouette_score(X, lab, sample_size=3000, random_state=seed))
    k = max(scores, key=scores.get)
    km = KMeans(k, n_init=10, random_state=seed).fit(X)
    df["cluster"] = km.labels_
    df["component"] = [component(t) for t in df["clean"]]
    # cluster descriptions: top terms from the TF-IDF-space centroids
    terms = np.array(tfidf.get_feature_names_out())
    Xt = tfidf.transform(df["clean"])
    clusters = []
    for c in range(k):
        m = (df["cluster"] == c).values
        top = terms[np.asarray(Xt[m].mean(0)).ravel().argsort()[::-1][:6]].tolist()
        comp = df.loc[m, "component"].value_counts()
        clusters.append(dict(id=c, size=int(m.sum()), top_terms=top, main_component=comp.index[0],
                             component_share=float(comp.iloc[0] / m.sum()),
                             examples=df.loc[m, "text"].head(3).tolist()))
    return df, dict(tfidf=tfidf, lsa=lsa, km=km, cleaner=clean), clusters, scores


def classify(models, text: str) -> dict:
    """Assign a new log entry to an issue cluster and component (used by the platform)."""
    c = models["cleaner"](text)
    cl = int(models["km"].predict(models["lsa"].transform(models["tfidf"].transform([c])))[0])
    return dict(cluster=cl, component=component(c), clean=c)


def main():
    df, models, clusters, scores = build()
    ART.mkdir(parents=True, exist_ok=True)
    with open(ART / "models.pkl", "wb") as f:
        pickle.dump(models, f)
    df.drop(columns=["clean"]).to_csv(ART / "records.csv", index=False)
    (ART / "clusters.json").write_text(json.dumps(dict(silhouette_by_k=scores, clusters=clusters), indent=1))
    print(f"{len(df)} records; silhouette by k: " + ", ".join(f"{k}:{v:.3f}" for k, v in scores.items()))
    print("component mix:", df["component"].value_counts().to_dict())
    for c in sorted(clusters, key=lambda c: -c["size"]):
        print(f"  cluster {c['id']:2d} n={c['size']:4d} [{c['main_component']} {c['component_share']:.0%}] {', '.join(c['top_terms'][:5])}")


if __name__ == "__main__":
    main()
