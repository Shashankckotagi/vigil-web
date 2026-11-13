"""Tests for VIGIL FastAPI backend server, endpoints, and WebSocket hub.

Covers:
- GET / (serves HTML frontend)
- Static asset delivery (/css/theme.css, /css/layout.css, /css/components.css, /js/app.js, /static/...)
- GET /api/status
- GET /api/pricing
- POST /api/upload
- POST /api/start
- POST /api/stop
- GET /api/feed
- WebSocket /ws hub connection and broadcasting
"""
from __future__ import annotations

import io
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from server import app, hub


def test_index_page():
    """GET / serves the dashboard HTML with proper title and assets."""
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    text = response.text
    assert "<title>VIGIL" in text
    assert 'href="./css/theme.css"' in text or 'href="/static/css/theme.css"' in text
    assert 'src="./js/app.js"' in text or 'src="/static/js/app.js"' in text
    assert 'id="btnStart"' in text
    assert 'id="btnStop"' in text
    assert 'id="ssimChart"' in text
    assert 'id="timelineFeed"' in text


def test_static_assets():
    """Verify modular CSS and JS assets are served correctly."""
    client = TestClient(app)
    for path in [
        "/css/theme.css",
        "/css/layout.css",
        "/css/components.css",
        "/js/api.js",
        "/js/ws.js",
        "/js/chart.js",
        "/js/timeline.js",
        "/js/state.js",
        "/js/app.js",
        "/static/index.html",
    ]:
        resp = client.get(path)
        assert resp.status_code == 200, f"Failed to fetch {path}"
        assert len(resp.content) > 0, f"Empty asset: {path}"


def test_pricing_endpoint():
    """GET /api/pricing returns pricing configurations including USD to INR."""
    client = TestClient(app)
    resp = client.get("/api/pricing")
    assert resp.status_code == 200
    data = resp.json()
    assert "gemini-2.5-flash" in data or "default" in data
    assert "usd_to_inr" in data
    assert data["usd_to_inr"] > 0


def test_status_when_idle():
    """GET /api/status returns running: False when no stream is active."""
    client = TestClient(app)
    hub.pipeline = None
    resp = client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("running") is False


def test_upload_video_endpoint():
    """POST /api/upload accepts multipart file upload and saves to disk."""
    client = TestClient(app)
    fake_content = b"RIFF....AVI LIST....video-bytes-placeholder"
    files = {"file": ("test_clip.avi", io.BytesIO(fake_content), "video/x-msvideo")}
    resp = client.post("/api/upload", files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("ok") is True
    assert "path" in data
    assert os.path.exists(data["path"])
    # Clean up uploaded test file
    try:
        os.remove(data["path"])
    except OSError:
        pass


def test_stop_when_not_running():
    """POST /api/stop returns 400 when nothing is running."""
    client = TestClient(app)
    hub.pipeline = None
    resp = client.post("/api/stop")
    assert resp.status_code == 400
    assert "error" in resp.json()


def test_start_and_stop_pipeline():
    """POST /api/start starts pipeline on demo clip and POST /api/stop stops it."""
    client = TestClient(app)
    clip_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "sample", "demo_clip.avi"
    )
    assert os.path.exists(clip_path)

    # Start pipeline
    payload = {
        "url": clip_path,
        "tau": 0.90,
        "escalation": False,
        "provider": "mock",
        "bounded": True,
        "audio": False,
        "gate": True,
        "run_id": f"test-server-{int(time.time())}"
    }
    resp = client.post("/api/start", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("ok") is True
    assert "run_id" in data
    assert data.get("status", {}).get("running") is True

    # Check status endpoint while running
    status_resp = client.get("/api/status")
    assert status_resp.status_code == 200
    assert status_resp.json().get("running") is True

    # Stop pipeline
    stop_resp = client.post("/api/stop")
    assert stop_resp.status_code == 200
    stop_data = stop_resp.json()
    assert stop_data.get("ok") is True
    assert stop_data.get("status", {}).get("running") is False


def test_video_feed_endpoint():
    """GET /api/feed returns multipart/x-mixed-replace streaming response."""
    client = TestClient(app)
    with client.stream("GET", "/api/feed") as resp:
        assert resp.status_code == 200
        assert "multipart/x-mixed-replace" in resp.headers["content-type"]


def test_websocket_endpoint_and_hub():
    """WS /ws connects, responds to keepalive ping, and receives hub events."""
    hub._recent.clear()
    hub._recent.append({
        "type": "description",
        "text": "WebSocket integration test event",
        "cost": "billed",
        "tokens": 42,
        "t": 1.5
    })
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_text("ping")
            msg = ws.receive_json()
            assert msg.get("text") == "WebSocket integration test event"
            assert msg.get("tokens") == 42


if __name__ == "__main__":
    import traceback
    fns = [(n, f) for n, f in sorted(globals().items())
           if n.startswith("test_") and callable(f)]
    passed = failed = 0
    for name, fn in fns:
        try:
            fn()
            print(f"  PASS  {name}")
            passed += 1
        except Exception:
            print(f"  FAIL  {name}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
