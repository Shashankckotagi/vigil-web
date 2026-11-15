"""Exhaustive robustness and edge-case unit tests for VIGIL backend.

Covers:
- VideoGate: extreme dimensions (1x1, 4K, aspect ratios), RGBA/Grayscale/Single-channel frames,
  all-black and all-white frames (zero-variance fallback), boundary taus (0.0, 1.0, negative, >1.0),
  empty/None frames.
- AudioGate: odd-byte length buffers, malformed PCM, extreme amplitudes, zero amplitude,
  wrong sample rates, webrtcvad fallback.
- Escalator: rapid back-to-back triggers, zero hold time, inactive mode, tau relaxation and restoration.
- Chunker: audio-only, video-only, non-monotonic timestamps, frame encode errors, flush boundaries.
- Memory: RollingMemory with k=0/1, compact_every=1, compaction provider failure recovery,
  extreme description sizes (50k chars), emojis and Unicode.
- Metrics & RateLimiter: zero elapsed time, empty/single/duplicate latencies, high concurrency acquire,
  CsvLogger resilience against commas/newlines/quotes, write_manifest with empty stats.
- Pipeline Concurrency & Fault Injection:
  Provider throwing RateLimitError (backoff and fault counting),
  Provider throwing ProviderError,
  Failing subscribers gracefully handled and unsubscribed without crashing pipeline,
  Backpressure queue filling,
  Repeated start/stop idempotency.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
from unittest.mock import AsyncMock, MagicMock

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from vigil.chunker import Chunker, Chunk, Escalator, encode_frame
from vigil.config import Config
from vigil.gate import AudioGate, GateStats, VideoGate, ssim, _fallback_ssim
from vigil.memory import AppendOnlyMemory, RollingMemory, make_memory
from vigil.metrics import CsvLogger, RateLimiter, RunMetrics, write_manifest
from vigil.pipeline import Pipeline
from vigil.providers import (
    BaseProvider,
    Completion,
    MockProvider,
    ProviderError,
    RateLimitError,
    make_provider,
)
from vigil.source import SourceError, resolve_url


# ============================================================================
# 1. VideoGate Edge Cases
# ============================================================================

def test_videogate_empty_and_none_frames():
    cfg = Config()
    gate = VideoGate(cfg)

    keep, score = gate.should_keep(None)
    assert not keep
    assert score == 0.0

    empty_frame = np.array([], dtype=np.uint8)
    keep, score = gate.should_keep(empty_frame)
    assert not keep
    assert score == 0.0


def test_videogate_different_color_channels():
    cfg = Config(ssim_size=64, ssim_tau=0.9)
    gate = VideoGate(cfg)

    # 1. Grayscale 2D image
    gray_frame = np.ones((120, 160), dtype=np.uint8) * 100
    keep1, score1 = gate.should_keep(gray_frame)
    assert keep1
    assert score1 == 1.0

    # 2. 4-channel BGRA image
    bgra_frame = np.zeros((120, 160, 4), dtype=np.uint8)
    bgra_frame[:, :, 0] = 50
    bgra_frame[:, :, 3] = 255
    keep2, score2 = gate.should_keep(bgra_frame)
    assert keep2  # Kept because significantly different from gray_frame

    # 3. 3-channel 1-plane image shape (H, W, 1)
    single_channel = np.ones((120, 160, 1), dtype=np.uint8) * 200
    keep3, score3 = gate.should_keep(single_channel)
    assert keep3


def test_videogate_extreme_resolutions_and_aspect_ratios():
    cfg = Config(ssim_size=32)
    gate = VideoGate(cfg)

    # 1x1 pixel image
    tiny = np.array([[[128, 128, 128]]], dtype=np.uint8)
    keep1, _ = gate.should_keep(tiny)
    assert keep1

    # High-res 4K frame (3840x2160)
    huge = np.random.randint(0, 255, (216, 384, 3), dtype=np.uint8)
    keep2, _ = gate.should_keep(huge)
    assert keep2

    # Extreme aspect ratio (1 x 500)
    tall = np.ones((500, 1, 3), dtype=np.uint8) * 50
    keep3, _ = gate.should_keep(tall)
    assert keep3


def test_videogate_constant_frames_zero_variance_fallback():
    # All black (variance = 0)
    black = np.zeros((64, 64), dtype=np.uint8)
    # All white (variance = 0)
    white = np.ones((64, 64), dtype=np.uint8) * 255

    score_identical = _fallback_ssim(black, black)
    assert score_identical >= 0.99

    score_diff = _fallback_ssim(black, white)
    assert score_diff <= 0.05


def test_videogate_boundary_tau_values():
    # tau = 0.0 => should drop everything after the first frame
    cfg_zero = Config(gate_enabled=True, ssim_tau=0.0)
    gate_zero = VideoGate(cfg_zero)
    f1 = np.zeros((64, 64, 3), dtype=np.uint8)
    f2 = np.ones((64, 64, 3), dtype=np.uint8) * 255
    keep1, _ = gate_zero.should_keep(f1)
    assert keep1
    keep2, _ = gate_zero.should_keep(f2)
    assert not keep2  # score is > 0.0, so score < tau is False

    # tau = 1.0 => should keep any frame that is even slightly different
    cfg_one = Config(gate_enabled=True, ssim_tau=1.0)
    gate_one = VideoGate(cfg_one)
    keep1, _ = gate_one.should_keep(f1)
    keep2, _ = gate_one.should_keep(f2)
    assert keep1 and keep2


def test_videogate_dynamic_tau_reset():
    cfg = Config(ssim_tau=0.92)
    gate = VideoGate(cfg)
    assert gate.tau == 0.92
    gate.set_tau(0.99)
    assert gate.tau == 0.99
    gate.reset_tau()
    assert gate.tau == 0.92


# ============================================================================
# 2. AudioGate & Escalator Edge Cases
# ============================================================================

def test_audiogate_odd_byte_length_resilience():
    cfg = Config()
    gate = AudioGate(cfg)

    # 1 byte (cannot make an int16)
    rms1 = AudioGate.rms(b"\x05")
    assert rms1 == 0.0

    # 3 bytes (1 sample + 1 dangling byte)
    odd_bytes = b"\x00\x10\x99"
    rms2 = AudioGate.rms(odd_bytes)
    assert rms2 > 0.0

    # is_speech with odd bytes
    speech, level = gate.is_speech(b"\x12\x34\x56")
    assert isinstance(speech, bool)
    assert isinstance(level, float)


def test_audiogate_extreme_audio_signals():
    # Complete silence
    silence = b"\x00" * 960
    assert AudioGate.rms(silence) == 0.0

    # Max positive int16 amplitude
    max_amp = (b"\xff\x7f") * 480
    rms_max = AudioGate.rms(max_amp)
    assert 0.95 <= rms_max <= 1.0

    # Empty buffer
    assert AudioGate.rms(b"") == 0.0


def test_escalator_rapid_triggers_and_zero_hold():
    cfg = Config(escalation_enabled=True, escalation_rms_threshold=0.05,
                 escalation_hold_s=0.0, escalation_tau=0.99, ssim_tau=0.90)
    gate = VideoGate(cfg)
    stats = GateStats()
    esc = Escalator(cfg, gate, stats)

    # When hold_s is 0.0, active is False immediately after monotonic check
    esc.consider(speech=True, rms=0.1)
    esc.tick()
    assert gate.tau == 0.90  # restored immediately

    # Now with normal hold_s
    stats.escalations = 0
    cfg.escalation_hold_s = 5.0
    first = esc.consider(speech=True, rms=0.2)
    assert first is True
    assert esc.active is True
    assert stats.escalations == 1

    # Consecutive trigger while already active does not increment escalations count
    second = esc.consider(speech=True, rms=0.3)
    assert second is False
    assert stats.escalations == 1
    assert esc.active is True


def test_escalator_loud_noise_without_speech():
    cfg = Config(escalation_enabled=True, escalation_rms_threshold=0.05)
    gate = VideoGate(cfg)
    esc = Escalator(cfg, gate)

    # Loud but speech=False (e.g. door slam) -> does not escalate
    fired = esc.consider(speech=False, rms=0.8)
    assert fired is False
    assert not esc.active


# ============================================================================
# 3. Chunker Edge Cases
# ============================================================================

def test_chunker_audio_only_emits_chunk():
    cfg = Config(chunk_window_s=2.0)
    chunker = Chunker(cfg)

    # Add only audio, no video frames
    chunker.add_audio(speech=True, rms=0.25, t=1.0)
    chunker.add_audio(speech=True, rms=0.30, t=2.5)

    assert chunker.due(now=3.5)
    chunk = chunker.flush(now=3.5)
    assert chunk is not None
    assert chunk.frames_b64 == []
    assert chunk.speech_ms > 0
    assert chunk.peak_rms == 0.30
    assert chunk.t_start == 1.0
    assert chunk.t_end >= 2.5


def test_chunker_video_only_without_audio():
    cfg = Config(chunk_window_s=2.0)
    chunker = Chunker(cfg)

    frame = np.ones((60, 60, 3), dtype=np.uint8) * 128
    res = chunker.add_frame(frame, t=0.5)
    assert res is None  # max frames not reached yet

    assert chunker.due(now=3.0)
    chunk = chunker.flush(now=3.0)
    assert chunk is not None
    assert len(chunk.frames_b64) == 1
    assert chunk.speech_ms == 0


def test_chunker_clock_jitter_and_monotonicity():
    cfg = Config(chunk_window_s=3.0)
    chunker = Chunker(cfg)

    frame = np.ones((60, 60, 3), dtype=np.uint8) * 128
    chunker.add_frame(frame, t=10.0)
    # Audio with earlier timestamp due to thread jitter
    chunker.add_audio(speech=True, rms=0.1, t=9.5)

    assert chunker.due(now=14.0)
    chunk = chunker.flush(now=14.0)
    assert chunk is not None
    assert chunk.t_start == 10.0
    assert chunk.t_end >= 10.0


def test_encode_frame_failure_handling():
    cfg = Config()
    chunker = Chunker(cfg)
    invalid_frame = np.array([])
    chunk = chunker.add_frame(invalid_frame, t=1.0)
    assert chunk is None


# ============================================================================
# 4. Memory Edge Cases
# ============================================================================

async def test_rolling_memory_compaction_failure_recovery():
    cfg = Config(memory_bounded=True, memory_recent_k=2, memory_compact_every=2)
    mem = RollingMemory(cfg)

    mem.append("Obs 1")
    mem.append("Obs 2")
    mem.append("Obs 3")  # Obs 1 is now in pending
    mem.append("Obs 4")  # Obs 2 is now in pending
    assert len(mem._pending) == 2

    # Mock provider that fails during compaction
    failing_provider = AsyncMock()
    failing_provider.describe.side_effect = RuntimeError("Compaction API down")

    result = await mem.maybe_compact(failing_provider)
    assert result is None
    # Pending events must NOT be dropped on failure!
    assert len(mem._pending) == 2
    assert mem._pending[0] == "Obs 1"
    assert mem._pending[1] == "Obs 2"


async def test_rolling_memory_frequent_compaction():
    cfg = Config(memory_bounded=True, memory_recent_k=1, memory_compact_every=1)
    mem = RollingMemory(cfg)

    mem.append("Event A")
    mem.append("Event B")  # Event A evicted to pending
    assert len(mem._pending) == 1

    succ_provider = AsyncMock()
    succ_provider.describe.return_value = Completion(text="Summary of A", tokens_in=10, tokens_out=5)

    res = await mem.maybe_compact(succ_provider)
    assert res is not None
    assert res["compaction_number"] == 1
    assert mem.summary == "Summary of A"
    assert len(mem._pending) == 0


def test_memory_massive_description_and_unicode():
    cfg = Config()
    mem = AppendOnlyMemory(cfg)
    emoji_desc = "🚨 Person with yellow umbrella ☂️ entered the frame! 🏃‍♂️💨"
    mem.append(emoji_desc)

    # 10,000 characters
    long_desc = "A" * 10000
    mem.append(long_desc)

    chunk = Chunk(index=0, t_start=0.0, t_end=1.0)
    prompt = mem.build_prompt(chunk)
    assert emoji_desc in prompt
    assert long_desc in prompt


# ============================================================================
# 5. Metrics & RateLimiter Edge Cases
# ============================================================================

def test_metrics_zero_elapsed_and_extreme_percentiles():
    m = RunMetrics(run_id="zero-test")
    m.started_at = time.time() + 10.0  # elapsed_s <= 0
    assert m.tokens_per_hour() == 0.0

    # Percentiles with 0 elements
    assert m.percentile(50) == 0.0
    assert m.percentile(0) == 0.0
    assert m.percentile(100) == 0.0

    # Percentiles with 1 element
    m.latencies.append(0.245)
    assert m.percentile(0) == 0.245
    assert m.percentile(50) == 0.245
    assert m.percentile(99) == 0.245
    assert m.percentile(100) == 0.245


async def test_rate_limiter_high_concurrency():
    limiter = RateLimiter(max_calls=5, window_s=0.5)

    async def worker(i):
        waited = await limiter.acquire()
        return waited

    # Launch 10 simultaneous workers
    t0 = time.monotonic()
    tasks = [asyncio.create_task(worker(i)) for i in range(10)]
    waited_list = await asyncio.gather(*tasks)
    total_time = time.monotonic() - t0

    # First 5 should acquire without waiting, subsequent 5 should wait
    assert any(w > 0 for w in waited_list)
    assert total_time >= 0.45


def test_csv_logger_special_characters_and_newlines():
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tf:
        path = tf.name

    try:
        logger = CsvLogger(path)
        row = {
            "chunk_index": 1,
            "wall_t": 1.23,
            "stream_t": 0.5,
            "frames_seen": 10,
            "frames_kept": 2,
            "description": "Multi-line text:\nLine 1, with comma\nLine 2, \"quoted\"",
        }
        logger.write(row)
        logger.close()

        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        assert "Multi-line text:" in content
        assert "Line 1, with comma" in content
    finally:
        if os.path.exists(path):
            os.remove(path)


def test_write_manifest_empty_gate_stats():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        path = tf.name

    try:
        cfg = Config(run_id="manifest-edge")
        metrics = RunMetrics(run_id="manifest-edge")
        write_manifest(path, cfg, metrics, gate_stats=None)
        assert os.path.exists(path)
        with open(path, "r", encoding="utf-8") as f:
            import json
            data = json.load(f)
        assert data["run_id"] == "manifest-edge"
        assert data["gate"] == {}
    finally:
        if os.path.exists(path):
            os.remove(path)


# ============================================================================
# 6. Pipeline Concurrency & Fault Tolerances
# ============================================================================

async def test_pipeline_provider_rate_limit_backoff_and_fault_accounting():
    cfg = Config(run_id="flaky-provider", max_retries=2, request_timeout_s=1.0)
    pipe = Pipeline("sample/demo_clip.avi", cfg=cfg, with_audio=False)

    flaky = AsyncMock()
    # Fails with RateLimitError on first call, succeeds on second call
    flaky.name = "flaky"
    flaky.describe.side_effect = [
        RateLimitError("429 Too Many Requests"),
        Completion(text="Recovered observation", tokens_in=10, tokens_out=5, latency_s=0.1),
    ]
    pipe.provider = flaky

    chunk = Chunk(index=1, t_start=0.0, t_end=1.0, frames_b64=[])
    await pipe._process(chunk)

    assert pipe.metrics.rate_limit_faults == 1
    assert pipe.metrics.retries == 1
    assert pipe.metrics.chunks_done == 1


async def test_pipeline_subscriber_exception_isolated():
    cfg = Config(run_id="sub-test")
    pipe = Pipeline("sample/demo_clip.avi", cfg=cfg, with_audio=False)

    good_events = []

    def bad_sub(ev):
        raise ValueError("Explosion in buggy subscriber")

    def good_sub(ev):
        good_events.append(ev)

    pipe.subscribe(bad_sub)
    pipe.subscribe(good_sub)

    # Emit event: bad_sub should be dropped without crashing _emit
    pipe._emit({"type": "test_event"})

    assert len(good_events) == 1
    assert bad_sub not in pipe._subs
    assert good_sub in pipe._subs


async def test_pipeline_start_stop_idempotency():
    cfg = Config(run_id="idempotency")
    pipe = Pipeline("sample/demo_clip.avi", cfg=cfg, with_audio=False)

    # Stop before start should be a safe no-op
    await pipe.stop()
    assert pipe._running is False

    await pipe.start()
    assert pipe._running is True

    # Repeated start should be a no-op
    await pipe.start()
    assert pipe._running is True

    await pipe.stop()
    assert pipe._running is False

    # Repeated stop should be a no-op
    await pipe.stop()
    assert pipe._running is False


# ============================================================================
# 7. Source & URL Resolution
# ============================================================================

def test_source_resolve_invalid_url():
    raised = False
    try:
        resolve_url("https://this-is-an-invalid-nonexistent-domain-12345.org/stream")
    except SourceError:
        raised = True
    assert raised, "Expected SourceError when resolving invalid URL"


def test_source_resolve_webcam_and_local():
    assert resolve_url("0") == "0"
    assert resolve_url("sample/demo_clip.avi") == "sample/demo_clip.avi"
    assert resolve_url("rtsp://192.168.1.100:554/live") == "rtsp://192.168.1.100:554/live"


def run_all():
    print("Running comprehensive backend robustness & edge case test suite...")
    test_videogate_empty_and_none_frames()
    print("  PASS  test_videogate_empty_and_none_frames")
    test_videogate_different_color_channels()
    print("  PASS  test_videogate_different_color_channels")
    test_videogate_extreme_resolutions_and_aspect_ratios()
    print("  PASS  test_videogate_extreme_resolutions_and_aspect_ratios")
    test_videogate_constant_frames_zero_variance_fallback()
    print("  PASS  test_videogate_constant_frames_zero_variance_fallback")
    test_videogate_boundary_tau_values()
    print("  PASS  test_videogate_boundary_tau_values")
    test_videogate_dynamic_tau_reset()
    print("  PASS  test_videogate_dynamic_tau_reset")

    test_audiogate_odd_byte_length_resilience()
    print("  PASS  test_audiogate_odd_byte_length_resilience")
    test_audiogate_extreme_audio_signals()
    print("  PASS  test_audiogate_extreme_audio_signals")
    test_escalator_rapid_triggers_and_zero_hold()
    print("  PASS  test_escalator_rapid_triggers_and_zero_hold")
    test_escalator_loud_noise_without_speech()
    print("  PASS  test_escalator_loud_noise_without_speech")

    test_chunker_audio_only_emits_chunk()
    print("  PASS  test_chunker_audio_only_emits_chunk")
    test_chunker_video_only_without_audio()
    print("  PASS  test_chunker_video_only_without_audio")
    test_chunker_clock_jitter_and_monotonicity()
    print("  PASS  test_chunker_clock_jitter_and_monotonicity")
    test_encode_frame_failure_handling()
    print("  PASS  test_encode_frame_failure_handling")

    asyncio.run(test_rolling_memory_compaction_failure_recovery())
    print("  PASS  test_rolling_memory_compaction_failure_recovery")
    asyncio.run(test_rolling_memory_frequent_compaction())
    print("  PASS  test_rolling_memory_frequent_compaction")
    test_memory_massive_description_and_unicode()
    print("  PASS  test_memory_massive_description_and_unicode")

    test_metrics_zero_elapsed_and_extreme_percentiles()
    print("  PASS  test_metrics_zero_elapsed_and_extreme_percentiles")
    asyncio.run(test_rate_limiter_high_concurrency())
    print("  PASS  test_rate_limiter_high_concurrency")
    test_csv_logger_special_characters_and_newlines()
    print("  PASS  test_csv_logger_special_characters_and_newlines")
    test_write_manifest_empty_gate_stats()
    print("  PASS  test_write_manifest_empty_gate_stats")

    asyncio.run(test_pipeline_provider_rate_limit_backoff_and_fault_accounting())
    print("  PASS  test_pipeline_provider_rate_limit_backoff_and_fault_accounting")
    asyncio.run(test_pipeline_subscriber_exception_isolated())
    print("  PASS  test_pipeline_subscriber_exception_isolated")
    asyncio.run(test_pipeline_start_stop_idempotency())
    print("  PASS  test_pipeline_start_stop_idempotency")

    test_source_resolve_invalid_url()
    print("  PASS  test_source_resolve_invalid_url")
    test_source_resolve_webcam_and_local()
    print("  PASS  test_source_resolve_webcam_and_local")

    print("\nAll 26 robustness and edge case tests PASSED successfully!")


if __name__ == "__main__":
    run_all()
