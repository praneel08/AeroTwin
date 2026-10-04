"""Capture screenshots of every view (visual QA / demo stills).  py -3.11 scripts/screenshots.py [outdir]"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/shots"); out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"])
    pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errs.append(f"PAGEERROR {e}"))
    pg.goto("http://127.0.0.1:8000/"); pg.wait_for_timeout(2500)
    pg.screenshot(path=out / "1_overview.png")
    for i, name in enumerate(["Digital twin", "Schedule", "Impact"], start=2):
        pg.get_by_role("tab", name=name).click(); pg.wait_for_timeout(5500 if i == 2 else 2000)
        pg.screenshot(path=out / f"{i}_{name.split()[-1].lower()}.png", full_page=False)
    print("console issues:", errs[:10])
    b.close()
