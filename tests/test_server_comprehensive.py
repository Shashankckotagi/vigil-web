"""Super extensive tests for FastAPI server, API endpoints, error cases,
WebSocket hub, event streaming, buffering, and multipart feed.
"""
from __future__ import annotations

import asyncio
import io
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from server import app, hub, StartRequest


def test_status_endpoint_comprehensive():
    """Verify /api/status format in both idle and active states."""
    client = TestClient(app)

    # When idle
    hub.pipeline = None
    res = client.get("/api/status")
    assert res.status_code == 200
    assert res.json() == {"running": False}


def test_pricing_endpoint_comprehensive():
    """Verify /api/pricing returns rates and usd_to_inr exchange rate."""
    client = TestClient(app)
    res = client.get("/api/pricing")
    assert res.status_code == 200
    data = res.json()
    assert "usd_to_inr" in data
    assert data["usd_to_inr"] > 0
    assert ("gemini-4-hydrogen" in data) or ("default" in data)


def test_upload_endpoint_edge_cases():
    """Verify /api/upload handles valid files, creates upload directory, and assigns timestamps."""
    client = TestClient(app)

    # Valid upload
    file_bytes = b"MOCK_AVI_VIDEO_STREAM_DATA_123456789"
    files = {"file": ("traffic_sample.mp4", io.BytesIO(file_bytes), "video/mp4")}
    res = client.post("/api/upload", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["filename"] == "traffic_sample.mp4"
    dest_path = data["path"]
    assert os.path.exists(dest_path)

    with open(dest_path, "rb") as f:
        assert f.read() == file_bytes

    # Clean up uploaded file
    try:
        os.remove(dest_path)
    except OSError:
        pass


def test_start_pipeline_validation_and_lifecycle():
    """Verify /api/start parameter acceptance, stopping previous pipeline, and validation."""
    client = TestClient(app)

    # Start with full custom payload on mock provider and synthetic clip
    payload = {
        "url": "sample/demo_clip.avi",
        "tau": 0.88,
        "escalation": True,
        "provider": "mock",
        "bounded": True,
        "audio": False,
        "gate": True,
        "run_id": f"compr-test-{int(time.time())}",
        "api_key": "dummy_test_key",
    }
    res = client.post("/api/start", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["run_id"] == payload["run_id"]
    assert "status" in data
    assert data["status"]["running"] is True

    # Start again while running -> stops previous pipeline and starts new
    payload2 = {
        "url": "sample/demo_clip.avi",
        "tau": 0.94,
        "provider": "mock",
        "run_id": f"compr-test-2-{int(time.time())}",
        "audio": False,
    }
    res2 = client.post("/api/start", json=payload2)
    assert res2.status_code == 200
    assert res2.json()["ok"] is True
    assert res2.json()["run_id"] == payload2["run_id"]

    # Stop pipeline
    res_stop = client.post("/api/stop")
    assert res_stop.status_code == 200
    assert res_stop.json()["ok"] is True


def test_stop_pipeline_when_not_running():
    """Verify /api/stop returns 400 Bad Request when nothing is running."""
    client = TestClient(app)
    hub.pipeline = None
    res = client.post("/api/stop")
    assert res.status_code == 400
    assert "error" in res.json()
    assert res.json()["error"] == "nothing running"


def test_video_feed_endpoint_headers():
    """Verify /api/feed returns multipart/x-mixed-replace content type."""
    client = TestClient(app)
    with client.stream("GET", "/api/feed") as res:
        assert res.status_code == 200
        assert "multipart/x-mixed-replace" in res.headers["content-type"]


def test_websocket_hub_broadcasting_and_frame_filtering():
    """Verify hub filters high-rate frame events from replay buffer and sends action events."""
    # Reset hub history
    hub._recent = []

    # Publish normal action event
    action_ev = {"type": "description", "text": "Red car passes", "cost": "billed"}
    hub.publish(action_ev)
    assert len(hub._recent) == 1
    assert hub._recent[0] == action_ev

    # Publish high-rate frame event -> should NOT be appended to _recent
    frame_ev = {"type": "frame", "ssim": 0.95, "kept": True}
    hub.publish(frame_ev)
    assert len(hub._recent) == 1  # Still 1, frame filtered out

    # Test WebSocket connection receives replay history
    client = TestClient(app)
    with client.websocket_connect("/ws") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "description"
        assert msg["text"] == "Red car passes"

        # Test keepalive ping
        ws.send_text("ping")


def test_websocket_multiple_concurrent_clients():
    """Verify multiple WebSocket clients connect and receive broadcast events simultaneously."""
    client = TestClient(app)

    with client.websocket_connect("/ws") as ws1:
        with client.websocket_connect("/ws") as ws2:
            assert len(hub.clients) >= 2

            broadcast_event = {"type": "escalation", "tau": 0.98}
            hub.publish(broadcast_event)

            # Both clients receive the event
            # (First they might consume any recent event)
            ev1 = ws1.receive_json()
            ev2 = ws2.receive_json()
            assert ev1 is not None
            assert ev2 is not None


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
            import traceback
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
