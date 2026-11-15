"""Super extensive unit tests for VIGIL core pipeline modules:
- vigil.config.Config (_env parsing, from_env, overrides, serialization)
- vigil.memory.RollingMemory and AppendOnlyMemory (anchor preservation, rolling bounds, compaction)
- vigil.metrics.MetricsTracker (token rates, p50/p95 latency, sliding hour bins, queue tracking)
- vigil.gate.VideoGate, AudioGate, GateStats (SSIM thresholding, drop-runs, VAD, RMS)
- vigil.chunker.Chunk, Chunker, Escalator (frame accumulation, time window flush, speech ms, base64 jpeg encoding)
"""
from __future__ import annotations

import os
import sys
import time
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vigil.config import Config, _env
from vigil.memory import RollingMemory, AppendOnlyMemory
from vigil.metrics import RunMetrics, RateLimiter, CsvLogger
from vigil.gate import VideoGate, AudioGate, GateStats, ssim
from vigil.chunker import Chunk, Chunker, Escalator


# ============================================================================
# 1. Config Tests
# ============================================================================
def test_config_env_helper_casting():
    """Test _env helper function with boolean, float, int and fallback behavior."""
    os.environ["TEST_BOOL_TRUE_1"] = "1"
    os.environ["TEST_BOOL_TRUE_YES"] = "yes"
    os.environ["TEST_BOOL_TRUE_ON"] = "on"
    os.environ["TEST_BOOL_FALSE_0"] = "0"
    os.environ["TEST_BOOL_FALSE_NO"] = "no"
    os.environ["TEST_FLOAT"] = "0.875"
    os.environ["TEST_INT"] = "42"
    os.environ["TEST_INVALID_NUM"] = "not_a_number"

    assert _env("TEST_BOOL_TRUE_1", False, bool) is True
    assert _env("TEST_BOOL_TRUE_YES", False, bool) is True
    assert _env("TEST_BOOL_TRUE_ON", False, bool) is True
    assert _env("TEST_BOOL_FALSE_0", True, bool) is False
    assert _env("TEST_BOOL_FALSE_NO", True, bool) is False
    assert _env("NONEXISTENT_KEY", True, bool) is True

    assert _env("TEST_FLOAT", 0.5, float) == 0.875
    assert _env("TEST_INT", 10, int) == 42
    assert _env("TEST_INVALID_NUM", 99, int) == 99  # Fallback to default


def test_config_from_env_and_defaults():
    """Verify Config.from_env() respects overrides and to_dict() captures all tunables."""
    os.environ["VIGIL_PROVIDER"] = "gemini"
    os.environ["GEMINI_API_KEY"] = "AIzaFakeKey123"
    os.environ["VIGIL_TAU"] = "0.78"
    os.environ["VIGIL_FPS"] = "5.0"
    os.environ["VIGIL_REPLAY_SPEED"] = "2.5"

    cfg = Config.from_env()
    assert cfg.provider == "gemini"
    assert cfg.gemini_api_key == "AIzaFakeKey123"
    assert cfg.ssim_tau == 0.78
    assert cfg.capture_fps == 5.0
    assert cfg.replay_speed == 2.5

    d = cfg.to_dict()
    assert isinstance(d, dict)
    assert d["provider"] == "gemini"
    assert d["ssim_tau"] == 0.78
    assert "anchor_text" in d
    assert "gemini_model" in d


# ============================================================================
# 2. Memory Module Tests (RollingMemory vs AppendOnlyMemory)
# ============================================================================
def test_rolling_memory_preserves_anchor_and_recent():
    """Test that RollingMemory retains anchor, bounds recent items, and tracks evictions."""
    cfg = Config(
        anchor_text="Fixed camera view. Describe changes.",
        memory_recent_k=3,
        memory_compact_every=5,
    )
    mem = RollingMemory(cfg)
    dummy_chunk = Chunk(index=0, t_start=1.0, t_end=2.0)

    # Initially empty prompt has anchor
    p0 = mem.build_prompt(chunk=dummy_chunk)
    assert cfg.anchor_text in p0

    # Add 10 observations
    for i in range(10):
        mem.append(f"Observation {i}")

    prompt = mem.build_prompt(chunk=dummy_chunk)
    assert cfg.anchor_text in prompt
    # Only the last 3 (memory_recent_k=3) are kept verbatim
    assert "- Observation 9" in prompt
    assert "- Observation 8" in prompt
    assert "- Observation 7" in prompt
    assert "- Observation 0" not in prompt

    # Snapshot inspection
    snap = mem.snapshot()
    assert snap["mode"] == "bounded"
    assert snap["recent"] == 3
    assert snap["pending"] > 0


def test_append_only_memory_unbounded():
    """Test that AppendOnlyMemory retains all observations without eviction."""
    cfg = Config(anchor_text="Anchor text.")
    mem = AppendOnlyMemory(cfg)
    dummy_chunk = Chunk(index=0, t_start=1.0, t_end=2.0)

    for i in range(12):
        mem.append(f"Observation {i}")

    prompt = mem.build_prompt(chunk=dummy_chunk)
    assert "Observation 0" in prompt
    assert "Observation 11" in prompt
    assert mem.snapshot()["mode"] == "append_only"
    assert mem.snapshot()["history_len"] == 12


# ============================================================================
# 3. Metrics Tracker Tests
# ============================================================================
def test_metrics_tracker_calculations():
    """Test token accumulation, latency percentiles, and queue tracking."""
    metrics = RunMetrics(run_id="unit-test-run")

    assert metrics.percentile(50) == 0.0
    assert metrics.percentile(95) == 0.0

    # Record chunks
    metrics.record(tokens_in=1000, tokens_out=200, latency=0.5, queue_depth=3, stream_t=10.0)
    metrics.record(tokens_in=2000, tokens_out=300, latency=1.2, queue_depth=8, stream_t=20.0)
    metrics.record(tokens_in=3000, tokens_out=500, latency=2.0, queue_depth=2, stream_t=30.0)

    snap = metrics.snapshot()
    assert snap["tokens_in"] == 6000
    assert snap["tokens_out"] == 1000
    assert snap["tokens_total"] == 7000
    assert snap["chunks_done"] == 3
    assert snap["max_queue_depth"] == 8

    assert metrics.percentile(50) > 0
    assert metrics.percentile(95) >= metrics.percentile(50)

    # Faults and errors
    metrics.errors += 1
    metrics.rate_limit_faults += 1
    metrics.retries += 1
    snap2 = metrics.snapshot()
    assert snap2["errors"] == 1
    assert snap2["rate_limit_faults"] == 1
    assert snap2["retries"] == 1


# ============================================================================
# 4. Gate & SSIM Tests
# ============================================================================
def test_video_gate_ssim_evaluation():
    """Verify VideoGate structural similarity for identical and changed frames."""
    cfg = Config(ssim_tau=0.90, gate_enabled=True, ssim_size=64)
    stats = GateStats()
    gate = VideoGate(cfg, stats=stats)

    frame1 = np.full((128, 128, 3), 100, dtype=np.uint8)
    frame_identical = np.full((128, 128, 3), 100, dtype=np.uint8)
    frame_different = frame1.copy()
    frame_different[:64, :64] = 0  # Invert quadrant

    # First frame always kept (score 1.0)
    keep1, s1 = gate.should_keep(frame1)
    assert keep1 is True
    assert s1 == 1.0
    assert stats.frames_kept == 1

    # Identical frame has SSIM >= tau, so dropped
    keep2, s2 = gate.should_keep(frame_identical)
    assert keep2 is False
    assert s2 >= 0.99
    assert stats.snapshot()["frames_dropped"] == 1

    # Modified frame drops below tau and is kept
    keep3, s3 = gate.should_keep(frame_different)
    assert keep3 is True
    assert s3 < 0.90
    assert stats.frames_kept == 2

    # Gate disabled keeps all
    cfg_disabled = Config(gate_enabled=False)
    gate_disabled = VideoGate(cfg_disabled)
    assert gate_disabled.should_keep(frame_identical)[0] is True


def test_audio_gate_rms_and_pcm():
    """Test AudioGate RMS energy calculation for silence and voiced speech."""
    cfg = Config(vad_enabled=True, vad_aggressiveness=2, vad_frame_ms=30)
    gate = AudioGate(cfg)

    # 480 samples of silence = 0 RMS
    silence = np.zeros(480, dtype=np.int16).tobytes()
    assert gate.rms(silence) == 0.0

    # Loud sine wave
    t_arr = np.linspace(0, 0.03, 480, endpoint=False)
    loud_sine = (np.sin(2 * np.pi * 440 * t_arr) * 30000).astype(np.int16).tobytes()
    rms_val = gate.rms(loud_sine)
    assert rms_val > 0.4


# ============================================================================
# 5. Chunker & Escalator Tests
# ============================================================================
def test_escalator_hold_and_restore():
    """Verify Escalator relaxes tau upon loud voice and restores it after hold_s."""
    cfg = Config(
        escalation_enabled=True,
        escalation_rms_threshold=0.08,
        escalation_tau=0.98,
        escalation_hold_s=0.2,
        ssim_tau=0.92,
    )
    video_gate = VideoGate(cfg)
    escalator = Escalator(cfg, video_gate)

    assert video_gate.tau == 0.92
    assert escalator.active is False

    # Low RMS does not escalate
    escalator.consider(speech=True, rms=0.03)
    assert escalator.active is False
    assert video_gate.tau == 0.92

    # Loud voiced speech triggers escalation
    triggered = escalator.consider(speech=True, rms=0.15)
    assert triggered is True
    assert escalator.active is True
    assert video_gate.tau == 0.98

    # Still active during hold period
    assert escalator.active is True
    assert video_gate.tau == 0.98

    # Sleep past hold period (0.2s)
    time.sleep(0.25)
    escalator.tick()
    assert escalator.active is False
    assert video_gate.tau == 0.92


def test_chunker_flush_rules():
    """Verify Chunker accumulates frames and flushes on max frames or window timeout."""
    cfg = Config(chunk_window_s=3.0, chunk_max_frames=3, jpeg_quality=70)
    chunker = Chunker(cfg)

    frame = np.full((80, 80, 3), 40, dtype=np.uint8)

    # First frame
    assert chunker.add_frame(frame, t=0.0) is None
    assert len(chunker._frames) == 1

    # Second frame
    assert chunker.add_frame(frame, t=0.5) is None
    assert len(chunker._frames) == 2

    # Third frame hits max_frames -> flushes Chunk
    chunk = chunker.add_frame(frame, t=1.0)
    assert chunk is not None
    assert isinstance(chunk, Chunk)
    assert len(chunk.frames_b64) == 3
    assert chunk.index == 0
    assert len(chunker._frames) == 0

    # Window timeout flush
    chunker.add_frame(frame, t=2.0)
    chunker.add_audio(speech=True, rms=0.05, t=2.5)
    assert chunker.due(now=2.5) is False
    assert chunker.due(now=5.5) is True  # elapsed = 3.5 > 3.0

    chunk_timeout = chunker.flush(now=5.5)
    assert chunk_timeout is not None
    assert chunk_timeout.speech_ms == cfg.vad_frame_ms
    assert len(chunk_timeout.frames_b64) == 1


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
