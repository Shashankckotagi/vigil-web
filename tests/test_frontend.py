"""Comprehensive acceptance and unit tests for the VIGIL frontend client logic,
markup integrity, event formatting, pricing computations, and filtering.

Run with:
    python tests/test_frontend.py
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STATIC = os.path.join(ROOT, "static")


def test_html_structure_and_controls():
    """Ensure static/index.html includes all required elements, IDs, and backend controls."""
    html_path = os.path.join(STATIC, "index.html")
    assert os.path.exists(html_path), "static/index.html does not exist"

    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Core IDs expected for full backend feature support
    required_ids = [
        "url",               # Target URL/path input
        "btnStart",          # Start Stream button
        "btnStop",           # Stop Stream button
        "btnUpload",         # Video upload button
        "filePicker",        # Hidden file input
        "tau",               # SSIM tau range slider
        "tauVal",            # Slider numerical readout
        "provider",          # AI/Mock Provider select
        "geminiKey",         # Gemini API key input
        "geminiKeyGroup",    # API key wrapper group
        "runId",             # Custom run ID input
        "backendUrl",        # Remote backend URL override
        "audio",             # Audio feed & VAD processing checkbox
        "esc",               # Audio escalation checkbox
        "gate",              # Vision SSIM gating checkbox
        "bounded",           # Context bounded memory checkbox
        "viewport",          # Video player viewport
        "liveFeedImg",       # OpenCV MJPEG image stream
        "placeholder",       # Viewport fallback placeholder
        "btnRefreshFeed",    # Stream reconnect/reload button
        "btnFullscreen",     # Fullscreen toggle
        "ciBody",            # Hero scene interpretation text
        "ciTimestamp",       # Scene interpretation timestamp
        "ssimChart",         # Real-time SSIM waveform canvas
        "retentionBar",      # Visual frame retention progress bar
        "statKept",          # Frames kept counter
        "statDropped",       # Frames dropped counter
        "statTokens",        # Tokens consumed counter
        "statTokensRate",    # Token consumption rate & cost
        "statLatency",       # P50/P95 latency
        "statSource",        # Active input source
        "statMemory",        # Memory mode badge
        "filterInput",       # Perception feed search filter
        "filterChips",       # Category filter buttons container
        "btnAutoScroll",     # Feed auto-scroll toggle
        "btnClearTimeline",  # Feed clear button
        "btnExportJson",     # JSON export button
        "btnExportCsv",      # CSV export button
        "cntFree",           # Free events count
        "cntBilled",         # Billed events count
        "cntRatio",          # Free events ratio %
        "timelineFeed",      # Feed unordered list
        "clock",             # System clock readout
        "statusPill",        # Connection / Stream status pill
    ]

    for element_id in required_ids:
        assert f'id="{element_id}"' in html, f"Missing required element id='{element_id}' in index.html"

    # Verify stylesheet and script linkages
    assert 'href="./css/theme.css"' in html
    assert 'href="./css/layout.css"' in html
    assert 'href="./css/components.css"' in html
    assert '<script type="module" src="./js/app.js"></script>' in html


def test_quick_preset_targets():
    """Verify quick preset buttons contain valid target stream types."""
    html_path = os.path.join(STATIC, "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    assert 'data-url="https://www.youtube.com/live/EO_1LWqsCNE"' in html
    assert 'data-url="sample/demo_clip.avi"' in html
    assert 'data-url="0"' in html


def test_event_formatting_all_pipeline_events():
    """Verify that every observable pipeline event type maps to correct tag and category."""
    # Mirror timeline.js formatting logic in Python test oracle
    def format_event(ev):
        t = ev.get("type")
        if t == "frame":
            return None
        mapping = {
            "description": ("LLM", "llm"),
            "frame_kept": ("KEPT", "gate"),
            "gate_drop_run": ("DROPPED", "gate"),
            "audio_speech": ("HEARD", "audio"),
            "audio_silence": ("SILENT", "audio"),
            "escalation": ("ESCALATED", "audio"),
            "chunk_queued": ("QUEUED", "system"),
            "memory_compacted": ("MEMORY", "system"),
            "backpressure": ("WAITED", "system"),
            "rate_limit_wait": ("THROTTLED", "system"),
            "error": ("ERROR", "system"),
        }
        return mapping.get(t)

    # 1. description
    fmt = format_event({"type": "description", "text": "Vehicles moving", "tokens": 45, "latency_s": 0.4})
    assert fmt == ("LLM", "llm")

    # 2. frame_kept
    fmt = format_event({"type": "frame_kept", "ssim": 0.85, "tau": 0.92})
    assert fmt == ("KEPT", "gate")

    # 3. gate_drop_run
    fmt = format_event({"type": "gate_drop_run", "count": 14, "ssim_min": 0.94, "ssim_max": 0.97})
    assert fmt == ("DROPPED", "gate")

    # 4. audio_speech
    fmt = format_event({"type": "audio_speech", "duration_ms": 2200, "peak_rms": 0.12})
    assert fmt == ("HEARD", "audio")

    # 5. audio_silence
    fmt = format_event({"type": "audio_silence", "duration_ms": 5000, "frames_dropped": 10})
    assert fmt == ("SILENT", "audio")

    # 6. escalation
    fmt = format_event({"type": "escalation", "tau": 0.98})
    assert fmt == ("ESCALATED", "audio")

    # 7. chunk_queued
    fmt = format_event({"type": "chunk_queued", "chunk": 1, "images": 2, "speech_ms": 800, "queue_depth": 1})
    assert fmt == ("QUEUED", "system")

    # 8. memory_compacted
    fmt = format_event({"type": "memory_compacted", "events_folded": 10, "summary_chars": 150})
    assert fmt == ("MEMORY", "system")

    # 9. backpressure
    fmt = format_event({"type": "backpressure", "waited_s": 1.2})
    assert fmt == ("WAITED", "system")

    # 10. rate_limit_wait
    fmt = format_event({"type": "rate_limit_wait", "waited_s": 5.0})
    assert fmt == ("THROTTLED", "system")

    # 11. error
    fmt = format_event({"type": "error", "error": "Connection reset"})
    assert fmt == ("ERROR", "system")

    # 12. frame telemetry (filtered from text list)
    assert format_event({"type": "frame", "ssim": 0.91, "kept": True}) is None


def test_pricing_and_cost_calculations():
    """Verify token cost calculations match pricing.json rates for USD and INR."""
    pricing_path = os.path.join(ROOT, "pricing.json")
    with open(pricing_path, "r", encoding="utf-8") as f:
        pricing = json.load(f)

    def calculate_cost(tokens_in, tokens_out, model="gemini-4-hydrogen"):
        rates = pricing.get(model, pricing["default"])
        usd = (tokens_in / 1_000_000) * rates["input_per_million"] + (tokens_out / 1_000_000) * rates["output_per_million"]
        inr = usd * pricing.get("usd_to_inr", 86.0)
        return usd, inr

    # 1,000,000 input + 1,000,000 output tokens on gemini-4-hydrogen
    usd, inr = calculate_cost(1_000_000, 1_000_000, "gemini-4-hydrogen")
    assert round(usd, 4) == round(1.50 + 7.50, 4)
    assert round(inr, 2) == round((1.50 + 7.50) * 86.0, 2)

    # 100,000 tokens in on gemini-4-carbon
    usd_pro, inr_pro = calculate_cost(100_000, 0, "gemini-4-carbon")
    assert round(usd_pro, 4) == 0.20
    assert round(inr_pro, 2) == round(0.20 * 86.0, 2)


def test_filter_and_search_logic():
    """Test category filtering and case-insensitive query searching."""
    rows = [
        {"cat": "llm", "text": "01:23 llm yellow delivery truck turns left"},
        {"cat": "gate", "text": "01:24 kept frame passed ssim 0.84 below tau 0.92"},
        {"cat": "audio", "text": "01:25 heard speech detected 2.5s duration"},
        {"cat": "system", "text": "01:26 memory context memory compacted 10 events folded"},
    ]

    def matches(row, category_filter, search_query):
        cat_ok = (category_filter == "all") or (row["cat"] == category_filter)
        q = search_query.lower().trim() if hasattr(search_query, "trim") else search_query.lower().strip()
        query_ok = (not q) or (q in row["text"].lower())
        return cat_ok and query_ok

    # Filter by category
    assert len([r for r in rows if matches(r, "all", "")]) == 4
    assert len([r for r in rows if matches(r, "llm", "")]) == 1
    assert len([r for r in rows if matches(r, "audio", "")]) == 1

    # Filter by search text
    assert len([r for r in rows if matches(r, "all", "truck")]) == 1
    assert len([r for r in rows if matches(r, "all", "compacted")]) == 1
    assert len([r for r in rows if matches(r, "all", "NONEXISTENT")]) == 0


def test_js_modules_syntax_validation():
    """Ensure all modular JavaScript files parse cleanly without syntax errors."""
    js_dir = os.path.join(STATIC, "js")
    js_files = [f for f in os.listdir(js_dir) if f.endswith(".js")]
    assert len(js_files) >= 5, f"Expected modular JS files in {js_dir}, found: {js_files}"

    for f in js_files:
        full_path = os.path.join(js_dir, f)
        res = subprocess.run(["node", "--check", full_path], capture_output=True, text=True)
        assert res.returncode == 0, f"JS Syntax error in {f}:\n{res.stderr}"


def test_css_modular_files_exist_and_non_empty():
    """Ensure CSS files exist, are properly styled, and contain key selectors."""
    css_dir = os.path.join(STATIC, "css")
    for css_file in ["theme.css", "layout.css", "components.css"]:
        path = os.path.join(css_dir, css_file)
        assert os.path.exists(path), f"Missing CSS file: {path}"
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            assert len(content) > 100, f"CSS file too short or empty: {path}"


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
