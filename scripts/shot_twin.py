from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"])
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://127.0.0.1:8000/"); pg.wait_for_timeout(1500)
    pg.get_by_role("tab", name="Digital twin").click(); pg.wait_for_timeout(5000)
    pg.get_by_role("button", name="Starboard").first.click(); pg.wait_for_timeout(3500)
    pg.screenshot(path="artifacts/shots/5_twin_selected.png"); print(errs)
    b.close()
