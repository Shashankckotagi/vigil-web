"""Capture stage.

Reads an unbounded video+audio source and pushes timestamped items into two
thread-safe queues. Video runs in one daemon thread, audio in an ffmpeg
subprocess read by a second thread. Both stamp items from a single
time.monotonic() origin so the chunker can align them.

Supported inputs:
  - YouTube live / VOD URL (resolved through yt-dlp to an HLS manifest)
  - direct RTSP / HTTP / .m3u8 URL
  - local file path (replayed at real-time rate for reproducible runs)
  - integer webcam index as a string, e.g. "0"

Live HLS manifests expire after a few hours. resolve() is therefore called
again whenever reads start failing; this is normal operation, not an error
path, and is the reason an unbounded run survives overnight.
"""
from __future__ import annotations

import base64
import logging
import os
import queue
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

log = logging.getLogger("vigil.source")


@dataclass
class VideoItem:
    t: float            # seconds since run start
    frame: np.ndarray   # BGR uint8


@dataclass
class AudioItem:
    t: float            # seconds since run start
    pcm: bytes          # 16-bit mono little-endian at config.audio_sample_rate


class SourceError(RuntimeError):
    pass


class YouTubeBotDetectionError(SourceError):
    """Raised when YouTube blocks the request due to datacenter IP / bot detection."""

    def __init__(self, url: str, raw_details: str = ""):
        self.url = url
        self.raw_details = raw_details
        msg = (
            f"YouTube bot verification triggered for {url}. "
            "YouTube blocks cloud and datacenter IP addresses (Render, AWS, GCP, etc.) without cookies. "
            "To fix: configure YOUTUBE_COOKIES in Render's Environment Variables, provide cookies via "
            "Advanced Settings, upload cookies.txt, or test using the 'Cloud-Ready HLS' live preset."
        )
        super().__init__(msg)


class _YtDlpCaptureLogger:
    """Captures yt-dlp warnings and errors for actionable diagnostic messages."""

    def __init__(self) -> None:
        self.messages: list[str] = []
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def debug(self, msg: str) -> None:
        pass

    def warning(self, msg: str) -> None:
        s = str(msg)
        self.warnings.append(s)
        self.messages.append(s)

    def error(self, msg: str) -> None:
        s = str(msg)
        self.errors.append(s)
        self.messages.append(s)


def resolve_cookie_file(cookie_input: str | None = None) -> str | None:
    """Find or materialize a valid Netscape cookies file for yt-dlp.

    Checks:
      1. Explicit cookie_input (file path, raw Netscape text, or base64 text)
      2. Environment variables: YOUTUBE_COOKIES, YTDLP_COOKIES, YOUTUBE_COOKIE_FILE, COOKIE_FILE
      3. Standard secret file /etc/secrets/cookies.txt (Render Secret File)
      4. Workspace files: cookies.txt or logs/youtube_cookies.txt
    """
    candidate = (cookie_input or "").strip()
    if not candidate:
        for env_var in ("YOUTUBE_COOKIES", "YTDLP_COOKIES", "YOUTUBE_COOKIE_FILE", "COOKIE_FILE"):
            val = (os.environ.get(env_var) or "").strip()
            if val:
                candidate = val
                break

    if candidate and os.path.isfile(candidate):
        return candidate

    well_known_paths = [
        "/etc/secrets/cookies.txt",            # Render secret file default mount
        "cookies.txt",                        # Workspace root
        os.path.join("logs", "cookies.txt"),
        os.path.join("logs", "youtube_cookies.txt"),
    ]
    if not candidate:
        for path in well_known_paths:
            if os.path.isfile(path):
                return path
        return None

    # candidate contains raw text or base64 string
    content = candidate
    if not ("# Netscape" in content or "\t" in content) and len(content) > 30:
        try:
            decoded = base64.b64decode(content, validate=True).decode("utf-8", errors="ignore")
            if "# Netscape" in decoded or "\t" in decoded:
                content = decoded
        except Exception:
            pass

    try:
        os.makedirs("logs", exist_ok=True)
        target = os.path.abspath(os.path.join("logs", "youtube_cookies.txt"))
        with open(target, "w", encoding="utf-8") as f:
            f.write(content.strip() + "\n")
        return target
    except Exception as e:
        log.warning("failed to write resolved cookies to logs/youtube_cookies.txt: %s", e)
        return None


def resolve_url(
    url: str,
    target_height: int = 480,
    cookie_input: str | None = None,
    player_clients: str | None = None,
) -> str:
    """Turn a page URL into something OpenCV/ffmpeg can open.

    Local paths, webcam indices and direct media URLs pass straight through.
    Anything that looks like a site page goes to yt-dlp.
    """
    if os.path.exists(url) or url.isdigit():
        return url

    low = url.lower()
    base_no_query = low.split("?")[0]
    direct = (".m3u8", ".mp4", ".mkv", ".ts", ".flv", ".webm")
    if low.startswith("rtsp://") or base_no_query.endswith(direct) or ".m3u8" in low:
        return url

    try:
        import yt_dlp
    except ImportError as e:  # pragma: no cover
        raise SourceError("yt-dlp is required to resolve page URLs") from e

    is_youtube = ("youtube.com" in low) or ("youtu.be" in low)
    cookie_file = resolve_cookie_file(cookie_input)

    capture_logger = _YtDlpCaptureLogger()
    base_opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "logger": capture_logger,
    }
    if cookie_file:
        base_opts["cookiefile"] = cookie_file
        log.info("yt-dlp using cookies from %s", cookie_file)

    clients_raw = player_clients or os.environ.get("YOUTUBE_PLAYER_CLIENTS", "android,ios,mweb,web")
    client_list = [c.strip() for c in clients_raw.split(",") if c.strip()]

    strategies = [
        # Strategy 1: Multi-client fallback with target height format
        {"format": f"best[height<={target_height}]/bestvideo[height<={target_height}]+bestaudio/best", "clients": client_list, "process": True},
        # Strategy 2: Without format filter (HLS live streams frequently reject format string)
        {"format": None, "clients": client_list, "process": False},
        # Strategy 3: iOS client fallback (often bypasses bot check for live HLS streams)
        {"format": None, "clients": ["ios"], "process": False},
        # Strategy 4: Android client fallback
        {"format": None, "clients": ["android"], "process": False},
        # Strategy 5: TV embedded client fallback
        {"format": None, "clients": ["tv_embedded"], "process": False},
    ] if is_youtube else [
        {"format": f"best[height<={target_height}]/best", "clients": None, "process": True},
        {"format": None, "clients": None, "process": False},
    ]

    info = None
    for strat in strategies:
        opts = dict(base_opts)
        if strat["format"]:
            opts["format"] = strat["format"]
        if is_youtube and strat["clients"]:
            opts["extractor_args"] = {"youtube": {"player_client": strat["clients"]}}

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False, process=strat["process"])
                if info:
                    break
        except Exception as e:
            capture_logger.error(str(e))

    # Helper function to extract playable url from info dict
    resolved_url = None
    if info:
        if info.get("url"):
            resolved_url = info["url"]
        else:
            best_url = None
            for f in info.get("formats", []):
                furl = f.get("url")
                if not furl:
                    continue
                h = f.get("height") or 0
                if h and h <= target_height:
                    best_url = furl
                elif best_url is None:
                    best_url = furl
            if best_url:
                resolved_url = best_url

    if resolved_url:
        return resolved_url

    # Check for YouTube bot detection in errors
    all_err_text = " ".join(capture_logger.messages).lower()
    if is_youtube and any(
        k in all_err_text
        for k in (
            "sign in to confirm you’re not a bot",
            "confirm you're not a bot",
            "bot",
            "use --cookies",
            "robot",
        )
    ):
        raise YouTubeBotDetectionError(url, raw_details="; ".join(capture_logger.errors))

    err_summary = "; ".join(capture_logger.errors[-2:]) if capture_logger.errors else "no playable stream found"
    raise SourceError(f"yt-dlp could not retrieve stream information for {url}: {err_summary}")


def find_ffmpeg() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


class StreamSource:
    """Threaded capture with automatic re-resolution of expired manifests."""

    def __init__(self, url: str, cfg, with_audio: bool = True):
        self.url = url
        self.cfg = cfg
        self._ffmpeg_bin = find_ffmpeg()
        self.with_audio = with_audio and self._ffmpeg_bin is not None
        if with_audio and not self.with_audio:
            log.warning("ffmpeg not found on PATH; running video-only")

        self.video_q: "queue.Queue[VideoItem]" = queue.Queue(maxsize=120)
        self.audio_q: "queue.Queue[AudioItem]" = queue.Queue(maxsize=400)

        self._stop = threading.Event()
        self._t0: Optional[float] = None
        self._threads: list[threading.Thread] = []
        self._ff: Optional[subprocess.Popen] = None
        self._resolved: Optional[str] = None
        self.is_file = os.path.exists(url)

        self.frames_captured = 0
        self.reconnects = 0
        self._next_stream_sample = 0.0
        self.ended = threading.Event()   # set when a finite file runs out
        self.latest_frame: Optional[np.ndarray] = None

    # -- lifecycle --------------------------------------------------------
    def start(self) -> None:
        self._t0 = time.monotonic()
        cookies = getattr(self.cfg, "youtube_cookies", None)
        clients = getattr(self.cfg, "youtube_player_clients", None)
        self._resolved = resolve_url(
            self.url,
            self.cfg.target_height,
            cookie_input=cookies,
            player_clients=clients,
        )
        log.info("resolved source (%s)", "file" if self.is_file else "stream")

        tv = threading.Thread(target=self._video_loop, name="vigil-video",
                              daemon=True)
        tv.start()
        self._threads.append(tv)

        if self.with_audio:
            ta = threading.Thread(target=self._audio_loop, name="vigil-audio",
                                  daemon=True)
            ta.start()
            self._threads.append(ta)

    def stop(self) -> None:
        self._stop.set()
        if self._ff and self._ff.poll() is None:
            try:
                self._ff.terminate()
                self._ff.wait(timeout=3)
            except Exception:
                try:
                    self._ff.kill()
                except Exception:
                    pass
        for t in self._threads:
            t.join(timeout=3)

    @property
    def elapsed(self) -> float:
        return 0.0 if self._t0 is None else time.monotonic() - self._t0

    # -- video ------------------------------------------------------------
    def _open_capture(self) -> cv2.VideoCapture:
        target = int(self._resolved) if self._resolved.isdigit() else self._resolved
        cap = cv2.VideoCapture(target)
        if not cap.isOpened():
            raise SourceError("OpenCV could not open the resolved source")
        return cap

    def _video_loop(self) -> None:
        interval = 1.0 / max(self.cfg.capture_fps, 0.01)
        attempts = 0
        cap = None
        try:
            cap = self._open_capture()
            next_sample = time.monotonic()
            consecutive_fail = 0

            # For a finite file we pace replay by the file's own frame rate
            # rather than reading as fast as the disk allows. Without this a
            # 6-hour clip finishes in minutes, every run samples a different
            # set of frames, and timings cannot be compared between runs.
            src_fps = 0.0
            frame_idx = 0
            if self.is_file:
                try:
                    src_fps = float(cap.get(cv2.CAP_PROP_FPS)) or 0.0
                except Exception:
                    src_fps = 0.0
                if not (src_fps > 0):
                    src_fps = 25.0
                    log.warning("file reports no FPS; assuming %.1f", src_fps)
                log.info("replaying file at %.2fx (source %.1f fps)",
                         self.cfg.replay_speed, src_fps)

            while not self._stop.is_set():
                ok, frame = cap.read()
                if ok and frame is not None:
                    self.latest_frame = frame

                if not ok:
                    consecutive_fail += 1
                    # A finite file simply ended.
                    if self.is_file:
                        log.info("input file exhausted")
                        self.ended.set()
                        return
                    if consecutive_fail < 3:
                        time.sleep(0.2)
                        continue
                    # Live manifests expire; re-resolve and reopen.
                    attempts += 1
                    if attempts > self.cfg.reconnect_max_attempts:
                        log.error("giving up after %d reconnect attempts",
                                  attempts)
                        self.ended.set()
                        return
                    backoff = self.cfg.reconnect_backoff_s * attempts
                    log.warning("stream read failed; re-resolving in %.1fs "
                                "(attempt %d)", backoff, attempts)
                    time.sleep(backoff)
                    try:
                        cap.release()
                    except Exception:
                        pass
                    try:
                        cookies = getattr(self.cfg, "youtube_cookies", None)
                        clients = getattr(self.cfg, "youtube_player_clients", None)
                        self._resolved = resolve_url(
                            self.url,
                            self.cfg.target_height,
                            cookie_input=cookies,
                            player_clients=clients,
                        )
                        cap = self._open_capture()
                        self.reconnects += 1
                        consecutive_fail = 0
                        log.info("reconnected (total %d)", self.reconnects)
                    except Exception as e:
                        log.warning("reconnect failed: %s", e)
                    continue

                consecutive_fail = 0
                attempts = 0

                if self.is_file:
                    # Stream time comes from the file, not the clock.
                    frame_idx += 1
                    stream_t = frame_idx / src_fps
                    target_wall = (self._t0
                                   + stream_t / max(self.cfg.replay_speed, 0.01))
                    delay = target_wall - time.monotonic()
                    if delay > 0:
                        # Sleep in slices so stop() stays responsive.
                        end = time.monotonic() + delay
                        while not self._stop.is_set():
                            remaining = end - time.monotonic()
                            if remaining <= 0:
                                break
                            time.sleep(min(0.05, remaining))
                    if stream_t < self._next_stream_sample:
                        continue
                    self._next_stream_sample = stream_t + interval
                    t_item = stream_t
                else:
                    now = time.monotonic()
                    if now < next_sample:
                        continue
                    next_sample = now + interval
                    t_item = now - self._t0

                item = VideoItem(t=t_item, frame=frame)
                self.frames_captured += 1
                try:
                    self.video_q.put(item, timeout=1.0)
                except queue.Full:
                    # Consumer is behind. Dropping here is the capture-side
                    # face of backpressure; it is counted, never silent.
                    log.debug("video queue full; frame dropped at capture")
        except Exception:
            log.exception("video loop crashed")
            self.ended.set()
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass

    # -- audio ------------------------------------------------------------
    def _audio_loop(self) -> None:
        sr = self.cfg.audio_sample_rate
        bytes_per_chunk = int(sr * 2 * (self.cfg.vad_frame_ms / 1000.0))
        cmd = [
            self._ffmpeg_bin or "ffmpeg", "-nostdin", "-loglevel", "error",
            "-i", self._resolved,
            "-vn", "-f", "s16le", "-acodec", "pcm_s16le",
            "-ar", str(sr), "-ac", "1", "-",
        ]
        if self.is_file:
            speed = max(self.cfg.replay_speed, 0.01)
            cmd.insert(1, str(speed))
            cmd.insert(1, "-readrate")

        try:
            self._ff = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                bufsize=bytes_per_chunk * 4,
            )
        except FileNotFoundError:
            log.warning("ffmpeg unavailable; no audio")
            return

        audio_frame_idx = 0
        frame_dur_s = self.cfg.vad_frame_ms / 1000.0
        try:
            while not self._stop.is_set():
                # The pipe MUST be drained continuously or ffmpeg blocks.
                buf = self._ff.stdout.read(bytes_per_chunk)
                if not buf:
                    if self.is_file:
                        return
                    time.sleep(0.2)
                    if self._ff.poll() is not None:
                        return
                    continue
                if len(buf) < bytes_per_chunk:
                    buf = buf + b"\x00" * (bytes_per_chunk - len(buf))
                if self.is_file:
                    audio_frame_idx += 1
                    t_item = audio_frame_idx * frame_dur_s
                else:
                    t_item = time.monotonic() - self._t0
                item = AudioItem(t=t_item, pcm=buf)
                try:
                    self.audio_q.put(item, timeout=0.5)
                except queue.Full:
                    pass
        except Exception:
            log.exception("audio loop crashed")
