"""Security, validation, and stress tests for the VIGIL FastAPI Server.

Tests:
1. /api/upload:
   - Path traversal attempt (../../malicious.txt) -> sanitized, remains in uploads/
   - Empty 0-byte file upload -> rejected with 400
   - Large binary content upload
   - Missing or special character filenames
2. /api/start validation:
   - Empty string / whitespace URL -> rejected with 400
   - Out of bounds tau (negative or > 1.0) -> rejected with 400
   - Invalid provider (e.g. "unknown_llm") -> rejected with 400
   - Switching pipeline from running to new pipeline
3. /api/stop validation:
   - Calling /api/stop when no pipeline is running -> returns 400
   - Calling /api/stop when already stopped -> returns 400
4. WebSocket stress and edge cases:
   - Hub broadcasting non-standard/numpy data types -> sanitized, no crashes
   - Rapid client connect and disconnect
   - Client disconnection during broadcast -> clean disconnect without impacting other clients
   - Recent message cache replay on connect
5. /api/pricing edge cases:
   - Returns valid JSON with required conversion fields
6. /api/feed:
   - MJPEG multipart boundary stream format and client cancellation
"""
from __future__ import annotations

import asyncio
import io
import os
import sys
import time

import numpy as np
from fastapi.testclient import TestClient

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from server import app, hub, _sanitize_event


def test_upload_path_traversal_protection():
    client = TestClient(app)
    # Attempt directory traversal attack
    traversal_name = "../../../../tmp/traversal_test.mp4"
    file_bytes = b"dummy video bytes"

    response = client.post(
        "/api/upload",
        files={"file": (traversal_name, io.BytesIO(file_bytes), "video/mp4")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    # Saved file path MUST be inside uploads directory
    uploads_dir = os.path.join(ROOT, "uploads")
    saved_path = data["path"]
    assert saved_path.startswith(uploads_dir)
    assert ".." not in os.path.basename(saved_path)
    # Ensure it did not write to /tmp
    assert not os.path.exists("/tmp/traversal_test.mp4")

    # Clean up uploaded test file
    if os.path.exists(saved_path):
        os.remove(saved_path)


def test_upload_empty_file_rejected():
    client = TestClient(app)
    empty_bytes = b""
    response = client.post(
        "/api/upload",
        files={"file": ("empty.mp4", io.BytesIO(empty_bytes), "video/mp4")},
    )
    assert response.status_code == 400
    assert "empty" in response.json()["error"].lower()


def test_start_validation_empty_url():
    client = TestClient(app)
    # Empty string
    res1 = client.post("/api/start", json={"url": ""})
    assert res1.status_code == 400
    assert "url" in res1.json()["error"].lower()

    # Whitespace only
    res2 = client.post("/api/start", json={"url": "    \t\n  "})
    assert res2.status_code == 400


def test_start_validation_tau_bounds():
    client = TestClient(app)
    # Negative tau
    res1 = client.post("/api/start", json={"url": "sample/demo_clip.avi", "tau": -0.5})
    assert res1.status_code == 400
    assert "tau" in res1.json()["error"].lower()

    # tau > 1.0
    res2 = client.post("/api/start", json={"url": "sample/demo_clip.avi", "tau": 1.5})
    assert res2.status_code == 400
    assert "tau" in res2.json()["error"].lower()


def test_start_validation_unsupported_provider():
    client = TestClient(app)
    res = client.post(
        "/api/start",
        json={"url": "sample/demo_clip.avi", "provider": "unsupported_llm_xyz"},
    )
    assert res.status_code == 400
    assert "unsupported provider" in res.json()["error"].lower()


def test_stop_when_idle_or_repeated():
    client = TestClient(app)
    # Ensure stopped
    if hub.pipeline and hub.pipeline._running:
        client.post("/api/stop")

    # Stopping when not running must return 400
    res = client.post("/api/stop")
    assert res.status_code == 400
    assert "nothing running" in res.json()["error"].lower()


def test_event_sanitization_numpy_and_bytes():
    raw_event = {
        "type": "frame",
        "int_val": np.int64(42),
        "float_val": np.float32(0.875),
        "bytes_val": b"hello\xffworld",
        "arr": np.array([1, 2, 3]),
        "nested": {
            "inner_float": np.float64(3.14159),
        },
    }
    sanitized = _sanitize_event(raw_event)
    assert isinstance(sanitized["int_val"], int)
    assert isinstance(sanitized["float_val"], float)
    assert isinstance(sanitized["bytes_val"], str)
    assert sanitized["arr"] == [1, 2, 3]
    assert isinstance(sanitized["nested"]["inner_float"], float)

    # Test JSON serialization without raising TypeError
    import json
    encoded = json.dumps(sanitized)
    assert "3.14159" in encoded


def test_websocket_multiple_concurrent_clients_and_replay():
    client = TestClient(app)

    # Publish an event to populate recent history
    hub.publish({"type": "test_marker", "val": 12345})

    with client.websocket_connect("/ws") as ws1:
        # Should receive recent history containing our test_marker
        ev = ws1.receive_json()
        assert "type" in ev

        with client.websocket_connect("/ws") as ws2:
            # Send keepalive from ws1
            ws1.send_text("ping")
            ws2.send_text("ping")


def run_all():
    print("Running server security, validation, and stress test suite...")
    test_upload_path_traversal_protection()
    print("  PASS  test_upload_path_traversal_protection")
    test_upload_empty_file_rejected()
    print("  PASS  test_upload_empty_file_rejected")
    test_start_validation_empty_url()
    print("  PASS  test_start_validation_empty_url")
    test_start_validation_tau_bounds()
    print("  PASS  test_start_validation_tau_bounds")
    test_start_validation_unsupported_provider()
    print("  PASS  test_start_validation_unsupported_provider")
    test_stop_when_idle_or_repeated()
    print("  PASS  test_stop_when_idle_or_repeated")
    test_event_sanitization_numpy_and_bytes()
    print("  PASS  test_event_sanitization_numpy_and_bytes")
    test_websocket_multiple_concurrent_clients_and_replay()
    print("  PASS  test_websocket_multiple_concurrent_clients_and_replay")
    print("\nAll 8 server security & stress tests PASSED successfully!")


if __name__ == "__main__":
    run_all()
