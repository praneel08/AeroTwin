"""Capture the README screenshots into assets/screenshots/ (needs the app running on :8000 and `playwright install chromium`).

    py -3.11 -m demo.screenshots
"""
import sys

from playwright.sync_api import sync_playwright

from src.paths import SCREENSHOTS

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]  # software GL works headless


def main(url="http://127.0.0.1:8000/"):
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    shot = lambda pg, name: pg.screenshot(path=SCREENSHOTS / name)
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={"width": 1600, "height": 900})
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(f"PAGEERROR {e}"))
        pg.goto(url); pg.wait_for_timeout(2500)
        pg.get_by_role("tab", name="Fleet").click(); pg.wait_for_timeout(1500); shot(pg, "01-fleet.png")
        pg.get_by_role("tab", name="Aircraft twin").click(); pg.wait_for_timeout(7000); shot(pg, "02-aircraft-twin.png")
        pg.locator(".eng").first.click(); pg.wait_for_timeout(5000); shot(pg, "03-engine-open.png")
        pg.locator('input[aria-label="Engine age"]').fill("70"); pg.wait_for_timeout(2500); shot(pg, "04-wear-slider.png")
        pg.get_by_role("button", name="X-ray").click(); pg.wait_for_timeout(2500); shot(pg, "05-xray.png")
        pg.set_viewport_size({"width": 1600, "height": 2900})
        pg.get_by_role("tab", name="Results").click(); pg.wait_for_timeout(2000); shot(pg, "06-results.png")
        pg.set_viewport_size({"width": 1600, "height": 900})
        pg.get_by_role("button", name="Switch to dark theme").click(); pg.wait_for_timeout(1000)
        pg.get_by_role("tab", name="Fleet").click(); pg.wait_for_timeout(1500); shot(pg, "07-fleet-dark.png")
        pg.get_by_role("tab", name="Aircraft twin").click(); pg.wait_for_timeout(6000)
        pg.locator(".eng").first.click(); pg.wait_for_timeout(5000); shot(pg, "08-engine-open-dark.png")
        pg.get_by_role("button", name="Switch to light theme").click()  # leave the stored preference as light
        print("console errors:", errs[:8])
        b.close()


if __name__ == "__main__":
    main(*sys.argv[1:])
