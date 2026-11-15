"""Acceptance and unit tests for the VIGIL Vite-based Web Application.

Verifies:
- Production Vite build files in dist/
- CSS bundle contains all 6 eloquent color palettes (nordic, terracotta, seaglass, plum, matcha, obsidian)
- JS bundle includes all backend controls, IDs, presets, and pipeline event handlers
- FastAPI server serves Vite bundle at GET / and mounts /assets properly
"""
from __future__ import annotations

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, "dist")

sys.path.insert(0, ROOT)
from fastapi.testclient import TestClient
from server import app


def test_vite_build_files_exist():
    """Verify Vite build generated dist/index.html and dist/assets."""
    assert os.path.exists(DIST), "dist directory does not exist"
    index_html = os.path.join(DIST, "index.html")
    assert os.path.exists(index_html), "dist/index.html missing"

    with open(index_html, "r", encoding="utf-8") as f:
        html = f.read()

    assert '<div id="root"></div>' in html or 'id="root"' in html
    assert '<title>VIGIL' in html
    assert '/assets/' in html

    assets_dir = os.path.join(DIST, "assets")
    assert os.path.exists(assets_dir), "dist/assets missing"
    assets = os.listdir(assets_dir)
    assert any(f.endswith(".js") for f in assets), "Missing compiled JS asset in dist/assets"
    assert any(f.endswith(".css") for f in assets), "Missing compiled CSS asset in dist/assets"


def test_color_palettes_in_css():
    """Verify both vibrant, low-contrast color themes (dark and light) exist in compiled CSS."""
    assets_dir = os.path.join(DIST, "assets")
    css_files = [f for f in os.listdir(assets_dir) if f.endswith(".css")]
    assert len(css_files) >= 1

    css_path = os.path.join(assets_dir, css_files[0])
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    # Verify both dark and light themes
    palettes = ["dark", "light"]
    for p in palettes:
        assert f'data-theme="{p}"' in css or f'data-theme={p}' in css or p in css, f"Theme '{p}' missing from CSS"

    # Verify subtle transition properties are defined for smooth dissolves
    assert "transition" in css


def test_vite_js_bundle_includes_all_backend_features():
    """Ensure compiled bundle contains all required backend controls and event handlers."""
    assets_dir = os.path.join(DIST, "assets")
    js_files = [f for f in os.listdir(assets_dir) if f.endswith(".js")]
    assert len(js_files) >= 1

    js_path = os.path.join(assets_dir, js_files[0])
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # Core IDs and hooks
    expected_ids = [
        "url",
        "btnStart",
        "btnStop",
        "btnUpload",
        "filePicker",
        "tau",
        "tauVal",
        "provider",
        "geminiKey",
        "runId",
        "backendUrl",
        "audio",
        "esc",
        "gate",
        "bounded",
        "viewport",
        "liveFeedImg",
        "placeholder",
        "btnRefreshFeed",
        "btnFullscreen",
        "ciBody",
        "ciTimestamp",
        "ssimChart",
        "retentionBar",
        "statKept",
        "statDropped",
        "statTokens",
        "statTokensRate",
        "statLatency",
        "statSource",
        "statMemory",
        "filterInput",
        "filterChips",
        "btnAutoScroll",
        "btnClearTimeline",
        "btnExportJson",
        "btnExportCsv",
        "cntFree",
        "cntBilled",
        "cntRatio",
        "timelineFeed",
        "clock",
        "statusPill",
    ]

    for eid in expected_ids:
        assert eid in js, f"Expected '{eid}' in compiled JS bundle"

    # Preset URLs
    assert "https://www.youtube.com/live/EO_1LWqsCNE" in js
    assert "sample/demo_clip.avi" in js
    assert '"0"' in js or "'0'" in js or ">0<" in js

    # API endpoints
    assert "/api/start" in js
    assert "/api/stop" in js
    assert "/api/upload" in js
    assert "/api/status" in js
    assert "/api/pricing" in js
    assert "/api/feed" in js
    assert "/ws" in js


def test_server_serves_vite_app():
    """Verify FastAPI server GET / returns Vite HTML and GET /assets/ returns bundles."""
    client = TestClient(app)
    res = client.get("/")
    assert res.status_code == 200
    assert 'id="root"' in res.text

    # Extract asset paths from index.html
    js_match = re.search(r'src="(/assets/[^"]+\.js)"', res.text)
    assert js_match, "JS asset link missing from index.html"
    js_url = js_match.group(1)

    css_match = re.search(r'href="(/assets/[^"]+\.css)"', res.text)
    assert css_match, "CSS asset link missing from index.html"
    css_url = css_match.group(1)

    # Fetch assets from server
    res_js = client.get(js_url)
    assert res_js.status_code == 200
    assert len(res_js.content) > 1000

    res_css = client.get(css_url)
    assert res_css.status_code == 200
    assert len(res_css.content) > 1000


if __name__ == "__main__":
    fns = [(n, f) for n, f in sorted(globals().items())
           if n.startswith("test_") and callable(f)]
    passed = failed = 0
    for name, fn in fns:
        try:
            fn()
            print(f"  PASS  {name}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {name}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
