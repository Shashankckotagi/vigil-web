"""FastAPI server. Paste a URL, watch the timeline fill.

POST /api/start   {url, tau?, escalation?, provider?, bounded?, audio?}
POST /api/stop
GET  /api/status
WS   /ws          pushes every pipeline event to the browser

Run:  uvicorn server:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from vigil.config import Config
from vigil.pipeline import Pipeline

logging.basicConfig(
    level=os.environ.get("VIGIL_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)
log = logging.getLogger("vigil.server")

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")
DIST = os.path.join(HERE, "dist")

app = FastAPI(title="VIGIL", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartRequest(BaseModel):
    url: str
    tau: float | None = None
    escalation: bool | None = None
    provider: str | None = None
    model: str | None = None
    gemini_model: str | None = None
    bounded: bool | None = None
    audio: bool = True
    gate: bool | None = None
    run_id: str | None = None
    api_key: str | None = None


class VerifyKeyRequest(BaseModel):
    api_key: str
    model: str | None = "gemini-4-hydrogen"
    provider: str | None = "gemini"


def _sanitize_event(obj: Any) -> Any:
    """Ensure all event payloads are JSON-serializable (converts numpy types)."""
    if isinstance(obj, dict):
        return {k: _sanitize_event(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_event(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return [_sanitize_event(v) for v in obj.tolist()]
    if isinstance(obj, (np.floating, float)):
        return float(obj)
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if hasattr(obj, "item") and callable(getattr(obj, "item")):
        try:
            return obj.item()
        except Exception:
            pass
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    return obj


class Hub:
    """Fans pipeline events out to every connected browser.

    Pipeline subscribers are plain callables invoked from the event loop, so
    they must not block. Each event is handed to asyncio and sent later.
    """

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.pipeline: Pipeline | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._recent: list[dict] = []

    def attach_loop(self) -> None:
        self._loop = asyncio.get_running_loop()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)
        for ev in self._recent[-40:]:
            try:
                await ws.send_json(ev)
            except Exception:
                break

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    def publish(self, event: dict) -> None:
        # Frame events are high-rate; keep other observable action events in recent history
        safe_ev = _sanitize_event(event)
        if safe_ev.get("type") != "frame":
            self._recent.append(safe_ev)
            self._recent = self._recent[-200:]
        if self._loop and not self._loop.is_closed():
            asyncio.run_coroutine_threadsafe(self._send(safe_ev), self._loop)

    async def _send(self, event: dict) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


hub = Hub()


@app.on_event("startup")
async def _startup() -> None:
    hub.attach_loop()
    os.makedirs("logs", exist_ok=True)


@app.get("/")
async def index() -> Any:
    dist_index = os.path.join(DIST, "index.html")
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    path = os.path.join(STATIC, "index.html")
    if not os.path.exists(path):
        return JSONResponse({"error": "frontend index.html missing"}, 500)
    return FileResponse(path)


@app.post("/api/start")
async def start(req: StartRequest) -> Any:
    if not req.url or not req.url.strip():
        return JSONResponse({"error": "url is required and cannot be empty"}, 400)

    if req.tau is not None and not (0.0 <= float(req.tau) <= 1.0):
        return JSONResponse({"error": "tau must be between 0.0 and 1.0"}, 400)

    p_lower = (req.provider or "").lower()
    if p_lower and p_lower not in ("mock", "gemini", "ollama") and not p_lower.startswith("gemini-"):
        return JSONResponse({"error": f"unsupported provider: {req.provider}"}, 400)

    # Enforce API key requirement for Gemini before inferences can begin
    if p_lower == "gemini" or p_lower.startswith("gemini-"):
        key = (req.api_key or "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            return JSONResponse({
                "error": "Gemini API key is required before starting inferences. Please configure and verify your Gemini API key."
            }, 400)

    if hub.pipeline and hub.pipeline._running:
        log.info("stopping previous pipeline before starting new one")
        await hub.pipeline.stop()
        await asyncio.sleep(0.3)

    cfg = Config.from_env()
    if req.tau is not None:
        cfg.ssim_tau = float(req.tau)
    if req.escalation is not None:
        cfg.escalation_enabled = bool(req.escalation)
    if req.provider:
        cfg.provider = req.provider.lower()
    if req.model:
        cfg.gemini_model = req.model.strip()
    elif req.gemini_model:
        cfg.gemini_model = req.gemini_model.strip()
    elif p_lower.startswith("gemini-"):
        cfg.gemini_model = p_lower
    if req.bounded is not None:
        cfg.memory_bounded = bool(req.bounded)
    if req.gate is not None:
        cfg.gate_enabled = bool(req.gate)
    if req.api_key:
        cfg.gemini_api_key = req.api_key.strip()
    cfg.run_id = req.run_id or f"ui-{int(time.time())}"

    try:
        pipeline = Pipeline(req.url.strip(), cfg, with_audio=req.audio)
    except Exception as e:
        log.exception("failed to construct pipeline")
        return JSONResponse({"error": str(e)}, 400)

    pipeline.subscribe(hub.publish)
    hub.pipeline = pipeline
    try:
        await pipeline.start()
    except Exception as e:
        log.exception("failed to start")
        return JSONResponse({"error": str(e)}, 500)
    return {"ok": True, "run_id": cfg.run_id, "status": pipeline.status()}


@app.get("/api/feed")
async def video_feed() -> Any:
    """Stream live captured video frames as MJPEG directly to the browser."""
    import cv2

    async def frame_generator():
        while True:
            frame = None
            if hub.pipeline and hub.pipeline.source:
                frame = getattr(hub.pipeline.source, "latest_frame", None)
            if frame is not None:
                ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                if ret:
                    yield (b"--frame\r\n"
                           b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
            await asyncio.sleep(0.06)

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)) -> Any:
    """Accept video file upload and return its local server path."""
    upload_dir = os.path.join(HERE, "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    raw_name = file.filename or "upload.mp4"
    safe_name = os.path.basename(raw_name).strip() or "upload.mp4"
    clean_filename = f"{int(time.time())}_{safe_name}"
    dest_path = os.path.join(upload_dir, clean_filename)
    content = await file.read()
    if not content:
        return JSONResponse({"error": "uploaded file is empty"}, 400)
    with open(dest_path, "wb") as f:
        f.write(content)
    return {"ok": True, "path": dest_path, "filename": safe_name}


@app.post("/api/stop")
async def stop() -> Any:
    if not hub.pipeline or not hub.pipeline._running:
        return JSONResponse({"error": "nothing running"}, 400)
    await hub.pipeline.stop()
    return {"ok": True, "status": hub.pipeline.status()}


@app.post("/api/verify-key")
async def verify_key(req: VerifyKeyRequest) -> Any:
    """Verify that an API key works by sending a minimal ping request to the model gateway."""
    key = (req.api_key or "").strip()
    provider = (req.provider or "gemini").lower()
    model = (req.model or "gemini-4-hydrogen").strip()

    if provider == "mock":
        return {
            "valid": True,
            "provider": "mock",
            "model": "mock",
            "message": "Local Computer Vision runs locally and requires no API key."
        }

    if not key:
        return JSONResponse({
            "valid": False,
            "error": "API key cannot be empty. Please enter a valid Gemini API key."
        }, 400)

    import httpx
    t0 = time.monotonic()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": "ping"}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 2}
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"x-goog-api-key": key, "Content-Type": "application/json"}
            )
            latency_ms = (time.monotonic() - t0) * 1000.0

            if resp.status_code == 200:
                available_models = []
                try:
                    m_resp = await client.get(
                        "https://generativelanguage.googleapis.com/v1beta/models",
                        headers={"x-goog-api-key": key}
                    )
                    if m_resp.status_code == 200:
                        m_data = m_resp.json()
                        for m in m_data.get("models", []):
                            m_id = m.get("name", "").replace("models/", "")
                            methods = m.get("supportedGenerationMethods", [])
                            if "generateContent" in methods and m_id:
                                available_models.append(m_id)
                except Exception:
                    pass

                return {
                    "valid": True,
                    "provider": "gemini",
                    "model": model,
                    "latency_ms": round(latency_ms, 1),
                    "available_models": available_models if available_models else None,
                    "message": f"Gemini API key verified successfully on {model} ({round(latency_ms, 1)}ms latency)!"
                }
            elif resp.status_code in (400, 401, 403):
                err_msg = "Invalid API key or unauthorized."
                try:
                    err_json = resp.json()
                    err_msg = err_json.get("error", {}).get("message", err_msg)
                except Exception:
                    pass
                return JSONResponse({
                    "valid": False,
                    "status_code": resp.status_code,
                    "error": f"Gemini API verification failed ({resp.status_code}): {err_msg}"
                }, 400)
            elif resp.status_code == 429:
                return JSONResponse({
                    "valid": False,
                    "status_code": 429,
                    "error": "Gemini API key rate limit or quota exceeded (HTTP 429)."
                }, 429)
            else:
                return JSONResponse({
                    "valid": False,
                    "status_code": resp.status_code,
                    "error": f"Gemini API returned HTTP {resp.status_code}: {resp.text[:200]}"
                }, 400)
    except httpx.TimeoutException:
        return JSONResponse({
            "valid": False,
            "error": "Connection timed out while contacting Gemini API gateway."
        }, 504)
    except Exception as e:
        return JSONResponse({
            "valid": False,
            "error": f"Failed to connect to Gemini API gateway: {str(e)}"
        }, 500)


@app.get("/api/models")
async def get_models(api_key: str | None = None) -> Any:
    """Return supported Gemini models with real-time discovery if API key is provided."""
    curated = [
        {"id": "gemini-4-hydrogen", "name": "Gemini 4 Hydrogen", "category": "Fast multimodal agent"},
        {"id": "gemini-4-argon", "name": "Gemini 4 Argon", "category": "Balanced reasoning"},
        {"id": "gemini-4-carbon", "name": "Gemini 4 Carbon", "category": "Deep reasoning"},
        {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash", "category": "High throughput multimodal"},
        {"id": "gemini-3.5-flash-lite", "name": "Gemini 3.5 Flash-Lite", "category": "Lightweight high speed"},
    ]

    key = (api_key or "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return {"models": curated, "live": False}

    import httpx
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                headers={"x-goog-api-key": key}
            )
            if resp.status_code == 200:
                raw_models = resp.json().get("models", [])
                live_ids = []
                for m in raw_models:
                    m_id = m.get("name", "").replace("models/", "")
                    if "generateContent" in m.get("supportedGenerationMethods", []):
                        live_ids.append(m_id)
                if live_ids:
                    return {"models": curated, "live_models": live_ids, "live": True}
    except Exception:
        pass

    return {"models": curated, "live": False}


@app.get("/api/pricing")
async def pricing() -> Any:
    path = os.path.join(HERE, "pricing.json")
    if os.path.exists(path):
        import json
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "gemini-4-carbon": {"input_per_million": 2.00, "output_per_million": 10.00},
        "gemini-4-argon": {"input_per_million": 2.00, "output_per_million": 10.00},
        "gemini-4-hydrogen": {"input_per_million": 1.50, "output_per_million": 7.50},
        "gemini-3.8-flash": {"input_per_million": 0.10, "output_per_million": 0.40},
        "gemini-3.5-flash-lite": {"input_per_million": 0.30, "output_per_million": 2.50},
        "default": {"input_per_million": 1.50, "output_per_million": 7.50},
        "usd_to_inr": 86.0
    }


@app.get("/api/status")
async def status() -> Any:
    if not hub.pipeline:
        return {"running": False}
    return hub.pipeline.status()


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await hub.connect(ws)
    try:
        while True:
            await ws.receive_text()   # keepalive; client sends pings
    except WebSocketDisconnect:
        hub.disconnect(ws)
    except Exception:
        hub.disconnect(ws)


if os.path.isdir(DIST):
    assets_dir = os.path.join(DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

if os.path.isdir(STATIC):
    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    css_dir = os.path.join(STATIC, "css")
    js_dir = os.path.join(STATIC, "js")
    if os.path.isdir(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    if os.path.isdir(js_dir):
        app.mount("/js", StaticFiles(directory=js_dir), name="js")
