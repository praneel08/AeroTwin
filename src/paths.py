"""Single source of truth for where things live. Every module imports its paths from here."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"                       # downloaded datasets (git-ignored, see data/README.md)
MODELS = ROOT / "models"                   # trained weights and generated binaries (git-ignored)
REPORTS = ROOT / "reports"                 # small result files and benchmark.md (tracked)
DEMO = ROOT / "demo"                       # API + web UI
FRONTEND = DEMO / "frontend"
SCREENSHOTS = ROOT / "assets" / "screenshots"
