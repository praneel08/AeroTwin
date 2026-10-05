"""Visual QA: screenshot every screen and 3D interaction in light and dark.  py -3.11 scripts/screenshots.py [outdir]"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/shots"); out.mkdir(parents=True, exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]

def run(pg, theme):
    s = lambda n: pg.screenshot(path=out / f"{theme}_{n}.png")
    pg.set_viewport_size({"width": 1600, "height": 900})
    pg.get_by_role("tab", name="Fleet").click(); pg.wait_for_timeout(1500); s("1_fleet")
    pg.get_by_role("tab", name="Aircraft twin").click(); pg.wait_for_timeout(7000); s("2_twin_idle")
    pg.locator(".eng").first.click(); pg.wait_for_timeout(5000); s("3_twin_engine")
    pg.locator('input[aria-label="Engine age"]').fill("70"); pg.wait_for_timeout(2500); s("4_twin_wear")
    pg.get_by_role("button", name="X-ray").click(); pg.wait_for_timeout(2500); s("5_twin_xray")
    pg.set_viewport_size({"width": 1600, "height": 3000})
    pg.get_by_role("tab", name="Results").click(); pg.wait_for_timeout(2000); s("6_results")

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(f"PAGEERROR {e}"))
    pg.goto("http://127.0.0.1:8000/"); pg.wait_for_timeout(2500)
    run(pg, "light")
    pg.set_viewport_size({"width": 1600, "height": 900}); pg.get_by_role("button", name="Switch to dark theme").click(); pg.wait_for_timeout(800)
    run(pg, "dark")
    pg.reload(); pg.wait_for_timeout(2000)
    print("theme persisted after reload:", pg.evaluate("document.documentElement.getAttribute('data-theme')"))
    print("console errors:", errs[:8])
    b.close()
