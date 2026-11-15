"""Unit tests for YouTube stream resolution robustness, cookie management, and bot error detection."""
import os
import sys
import tempfile
import base64

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

from vigil.config import Config
from vigil.source import (
    SourceError,
    YouTubeBotDetectionError,
    resolve_cookie_file,
    resolve_url,
    _YtDlpCaptureLogger,
)
from server import app, hub


def test_resolve_cookie_file_direct_path():
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tf:
        tf.write(b"# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSID\t123\n")
        path = tf.name

    try:
        resolved = resolve_cookie_file(path)
        assert resolved == path
    finally:
        if os.path.exists(path):
            os.remove(path)


def test_resolve_cookie_file_raw_text():
    raw_cookies = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tHSID\tABCDEF\n"
    resolved = resolve_cookie_file(raw_cookies)
    assert resolved is not None
    assert os.path.exists(resolved)
    with open(resolved, "r", encoding="utf-8") as f:
        content = f.read()
    assert "HSID" in content
    assert ".youtube.com" in content


def test_resolve_cookie_file_base64():
    raw_cookies = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSSID\tXYZ999\n"
    b64_cookies = base64.b64encode(raw_cookies.encode("utf-8")).decode("utf-8")
    resolved = resolve_cookie_file(b64_cookies)
    assert resolved is not None
    assert os.path.exists(resolved)
    with open(resolved, "r", encoding="utf-8") as f:
        content = f.read()
    assert "SSID" in content


def test_resolve_cookie_file_from_env(monkeypatch):
    monkeypatch.setenv("YOUTUBE_COOKIES", "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tTEST\tENVVAR\n")
    resolved = resolve_cookie_file()
    assert resolved is not None
    with open(resolved, "r", encoding="utf-8") as f:
        content = f.read()
    assert "ENVVAR" in content


def test_direct_hls_with_query_params_bypasses_ytdlp():
    url_with_query = "https://cdn.example.com/live/stream.m3u8?token=abcdef123456&expires=9999"
    # Should return directly without trying to call yt-dlp
    resolved = resolve_url(url_with_query)
    assert resolved == url_with_query


def test_capture_logger_records_errors():
    logger = _YtDlpCaptureLogger()
    logger.debug("debug message")
    logger.warning("warning message")
    logger.error("error message")
    assert len(logger.messages) == 2
    assert "warning message" in logger.warnings
    assert "error message" in logger.errors


def test_youtube_bot_detection_error_instantiation():
    err = YouTubeBotDetectionError("https://www.youtube.com/live/test", raw_details="Sign in to confirm you’re not a bot")
    assert "YouTube bot verification triggered" in str(err)
    assert "YOUTUBE_COOKIES" in str(err)
    assert "Cloud-Ready HLS" in str(err)
    assert err.url == "https://www.youtube.com/live/test"


def test_resolve_url_bot_check_raises_bot_error():
    fake_url = "https://www.youtube.com/watch?v=botcheck123"

    class FakeYDL:
        def __init__(self, opts):
            self.opts = opts
            self.logger = opts.get("logger")

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            return False

        def extract_info(self, url, download=False, process=True):
            if self.logger:
                self.logger.error("ERROR: [youtube] botcheck123: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.")
            raise RuntimeError("Sign in to confirm you’re not a bot")

    with patch("yt_dlp.YoutubeDL", FakeYDL):
        raised = False
        try:
            resolve_url(fake_url)
        except YouTubeBotDetectionError as e:
            raised = True
            assert "YouTube bot verification triggered" in str(e)
        assert raised, "Expected YouTubeBotDetectionError was not raised"


def test_server_start_youtube_bot_returns_400_and_cleans_up():
    client = TestClient(app)
    hub.pipeline = None

    with patch("vigil.source.resolve_url", side_effect=YouTubeBotDetectionError("https://www.youtube.com/live/EO_1LWqsCNE")):
        resp = client.post("/api/start", json={
            "url": "https://www.youtube.com/live/EO_1LWqsCNE",
            "provider": "mock"
        })
        assert resp.status_code == 400
        data = resp.json()
        assert data.get("code") == "YOUTUBE_BOT_DETECTED"
        assert "YouTube bot verification triggered" in data.get("error", "")
        assert "help" in data
        # Ensure hub.pipeline was properly cleaned up and reset
        assert hub.pipeline is None


def test_server_start_accepts_cookies():
    client = TestClient(app)
    hub.pipeline = None

    with patch("vigil.source.resolve_url", return_value="sample/demo_clip.avi"):
        resp = client.post("/api/start", json={
            "url": "sample/demo_clip.avi",
            "provider": "mock",
            "cookies": "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tFOO\tBAR\n"
        })
        assert resp.status_code == 200
        assert hub.pipeline is not None
        assert hub.pipeline.cfg.youtube_cookies != ""
        # Stop pipeline
        client.post("/api/stop")


def test_cookies_endpoint():
    client = TestClient(app)
    resp = client.get("/api/cookies")
    assert resp.status_code == 200
    assert "has_youtube_cookies" in resp.json()


if __name__ == "__main__":
    tests = [
        test_resolve_cookie_file_direct_path,
        test_resolve_cookie_file_raw_text,
        test_resolve_cookie_file_base64,
        test_direct_hls_with_query_params_bypasses_ytdlp,
        test_capture_logger_records_errors,
        test_youtube_bot_detection_error_instantiation,
        test_resolve_url_bot_check_raises_bot_error,
        test_server_start_youtube_bot_returns_400_and_cleans_up,
        test_server_start_accepts_cookies,
        test_cookies_endpoint,
    ]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} passed, 0 failed")
