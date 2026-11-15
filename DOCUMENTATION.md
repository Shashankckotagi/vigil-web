# VIGIL Documentation

VIGIL (Vision Gating with Intermittent Listening) is a streaming perception system designed to run multimodal large language models over continuous video and audio without unbounded cost growth or memory exhaustion.

---

## 1. System Overview

Standard multimodal language model pipelines ingest video by sending fixed-interval frames (for example, one frame per second) into an inference API. On continuous streams such as surveillance cameras, traffic feeds, or robotic monitors, this naive approach produces two operational failures:

1. **Quadratic cost and context explosion ($O(N^2)$):** When conversation history accumulates every frame, prompt token counts climb linearly with time, causing cumulative API billing to grow quadratically.
2. **Computational waste on static scenes:** Real-world surveillance footage is static 70% to 90% of the time. Processing identical frames burns GPU compute and API tokens without adding information.

VIGIL addresses both failures using classical signal processing upstream of the model, combined with an active memory management policy:

- **Deterministic edge gating:** A zero-GPU visual gate (structural similarity index on 128x128 thumbnails) and an acoustic voice activity detector (WebRTC VAD) discard redundant frames and silent audio before any neural network runs.
- **Cross-modal escalation:** When sudden acoustic spikes or speech occur, the audio gate temporarily relaxes the visual threshold ($\tau$), capturing fast visual changes in sync with the sound.
- **Bounded context memory:** Instead of keeping an append-only transcript, VIGIL maintains a fixed prompt anchor, a sliding window of recent observations, and an automated recursive compaction routine that condenses older events into dense summary blocks.
- **Queue backpressure:** An asynchronous queue with a strict capacity ceiling slows video reading when downstream inference workers or network rate limits fall behind.

---

## 2. Core Pipeline Architecture

```
[ Input Stream ] (RTSP / YouTube Live / Webcam / File)
       │
       ▼
[ Capture Stage ] ─── Decoupled OpenCV video & FFmpeg audio threads
       │
       ├───▶ [ Video Gate ] (SSIM comparison, drops static frames)
       │           │
       │           ▼
       │     [ Escalator ] ◀─── [ Audio Gate ] (WebRTC VAD & RMS energy)
       │           │
       ▼           ▼
   [ Chunker ] ─── Bundles up to 3 kept frames + audio clip
       │
       ▼
   [ Bounded Queue ] ─── Async queue (size 10), applies backpressure
       │
       ▼
   [ Worker Pool ] ─── 3 async workers with sliding-window rate limiting
       │
       ▼
   [ Bounded Memory ] ─── Anchor prompt + rolling window + recursive summary
       │
       ▼
   [ Inference Provider ] ─── Black-box interface (Mock, Ollama, Gemini)
       │
       ▼
   [ WebSocket Hub / UI ] ─── Real-time telemetry, waveform, and event stream
```

### 2.1 Source Ingestion (`vigil/source.py`)

The source module ingests media from four distinct targets:
- YouTube Live streams (resolved to direct HLS/DASH manifests via `yt-dlp`).
- Network RTSP/HLS camera streams.
- Local video files (`.mp4`, `.avi`, `.mkv`) with optional playback rate throttling.
- Hardware USB capture devices (device index `0`, `1`, etc.).

Ingestion splits into two dedicated background worker threads:
1. **Video thread:** Reads frames with OpenCV `VideoCapture`, normalizes timestamps against a shared monotonic clock, and generates a scaled 640x360 MJPEG byte stream for the live dashboard viewport.
2. **Audio thread:** Spawns an `ffmpeg` subprocess reading 16 kHz 16-bit mono raw PCM audio via standard output pipe.

If a live YouTube stream manifest expires, the module catches the connection loss, re-queries `yt-dlp` for a fresh signed URL, and resumes capture without restarting the server.

### 2.2 Visual Gating (`vigil/gate.py`)

The visual gate compares each incoming frame against the most recently forwarded reference frame using the Structural Similarity Index Measure (SSIM):

$$\text{SSIM}(x, y) = \frac{(2\mu_x\mu_y + C_1)(2\sigma_{xy} + C_2)}{(\mu_x^2 + \mu_y^2 + C_1)(\sigma_x^2 + \sigma_y^2 + C_2)}$$

To minimize CPU overhead and avoid GPU dependencies:
- Frames are converted to grayscale and downsampled to 64x64 or 128x128 pixels.
- An 11x11 Gaussian window ($\sigma = 1.5$) computes local luminance, contrast, and structure.
- Stability constants $C_1 = 6.5025$ and $C_2 = 58.5225$ protect against division by zero in near-black frames.
- A variance floor ($1\times 10^{-7}$) treats uniform sensor occlusions safely.

If $\text{SSIM}(F_t, F_{\text{last}}) \ge \tau$ (default $\tau = 0.92$), the frame is classified as redundant and dropped. If $\text{SSIM} < \tau$, a significant visual change has occurred; the frame is retained, and $F_{\text{last}}$ updates to $F_t$.

### 2.3 Audio Gating (`vigil/gate.py`)

Audio is sliced into continuous 30 ms windows (480 samples at 16 kHz). Each window passes through two checks:
1. **Root Mean Square (RMS) energy:**
   $$\text{RMS} = \sqrt{\frac{1}{N}\sum_{i=1}^N x_i^2}$$
2. **WebRTC VAD:** A Gaussian mixture model classifier operating at aggressiveness level 2 to differentiate human speech from static environmental hums.

Windows classified as silence are dropped at zero token cost. Windows containing detected speech are retained and queued for bundling.

### 2.4 Cross-Modal Acoustic Escalation (`vigil/chunker.py`)

A common limitation of visual gating is that subtle visual indicators (such as an opening door at the edge of the frame) can yield an SSIM of 0.94, causing the gate to drop the frame even though a critical event started.

VIGIL resolves this by using audio as a visual trigger. When audio RMS energy exceeds a tuned threshold (default 0.08) or speech activity is sustained, the escalator activates:
- The visual gate threshold relaxes from baseline ($\tau = 0.92$) to an escalated sensitivity ($\tau_{\text{esc}} = 0.98$).
- The relaxed threshold persists for 30 seconds.
- Subtle visual changes that would normally be discarded now pass the gate and reach the model.
- Once the timer expires without further acoustic anomalies, the threshold returns to baseline.

### 2.5 Chunking and Dispatch (`vigil/chunker.py`)

Frames and audio slices that survive the gates enter the chunker. The chunker bundles up to 3 visual frames and any contemporaneous speech clips into a structured perception chunk. Chunks are dispatched under two conditions:
- **Capacity trigger:** The chunk collects 3 kept frames.
- **Temporal trigger:** A configurable window (default 2.0 seconds) elapses with at least one kept frame.

### 2.6 Concurrency and Backpressure (`vigil/pipeline.py`)

Chunks enter an `asyncio.Queue` with a fixed maximum size of 10. A pool of 3 asynchronous workers pulls chunks and dispatches them to the configured inference provider.

If external API latencies spike or rate limits slow processing, the queue fills. Once queue depth reaches capacity (10 chunks), the capture thread pauses frame intake until workers clear space. This prevents memory leaks and unconstrained backlog buildup.

### 2.7 Bounded Context Memory (`vigil/memory.py`)

To ensure long-term stream monitoring runs at $O(1)$ cost per hour, memory maintains three distinct prompt tiers:

1. **Immutable anchor prompt:** Core instructions defining agent role, response syntax, and perceptual focus. This section never evicts or compacts.
2. **Sliding observation window:** The 5 to 10 most recent semantic interpretations with microsecond timestamps, providing short-term continuity.
3. **Recursive summary block:** When the observation history exceeds its limit, the oldest events are evicted from the active window and folded into a dense narrative summary paragraph via a background summarization prompt.

This architecture guarantees that the total token count presented to the model per call remains bounded within a narrow range regardless of whether the stream runs for ten minutes or ten days.

### 2.8 Provider Abstraction (`vigil/providers.py`)

All model interaction runs through an abstract `Provider` base class:
- **Mock Provider (`mock`):** Runs completely offline with deterministic heuristics, returning simulated scene descriptions and realistic token counts without network access.
- **Ollama Provider (`ollama`):** Connects to local self-hosted open vision-language models such as `qwen2.5-vl` over localhost HTTP.
- **Google Gemini Provider (`gemini`):** Sends multimodal requests to Gemini models (such as `gemini-4-hydrogen`, `gemini-4-argon`, `gemini-4-carbon`, `gemini-3.8-flash`, and `gemini-3.5-flash-lite`) using base64 JPEG encoded images and structured prompts.

---

## 3. API and Protocol Reference

### 3.1 HTTP Endpoints

| Method | Endpoint | Description | Request Payload / Params | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | Serves dashboard frontend | None | HTML |
| `POST` | `/api/start` | Starts perception stream | `StartRequest` JSON | `{"ok": true, "run_id": "...", "status": {...}}` |
| `POST` | `/api/stop` | Stops active stream | None | `{"ok": true, "run_id": "...", "summary": {...}}` |
| `GET` | `/api/status` | Returns pipeline health | None | Pipeline telemetry JSON |
| `GET` | `/api/pricing` | Model token pricing matrix | None | Token costs in USD and INR |
| `GET` | `/api/models` | List supported models | `?api_key=...` | Model list and live availability |
| `POST` | `/api/verify-key`| Test Gemini API credential | `{"api_key": "...", "model": "..."}` | Validation outcome and roundtrip latency |
| `POST` | `/api/upload` | Upload local video file | `multipart/form-data` | Saved file path for playback |
| `GET` | `/api/feed` | MJPEG live camera stream | `?t=timestamp` | `multipart/x-mixed-replace` image stream |

#### `POST /api/start` Schema

```json
{
  "url": "https://www.youtube.com/live/example",
  "tau": 0.92,
  "escalation": true,
  "provider": "gemini",
  "model": "gemini-4-hydrogen",
  "bounded": true,
  "audio": true,
  "gate": true,
  "run_id": "custom-run-001",
  "api_key": "AIzaSy..."
}
```

### 3.2 WebSocket Protocol (`/ws`)

Clients connect to `ws://<host>:8000/ws`. The hub broadcasts pipeline events as JSON objects in real time.

#### Event Types

- **`description`:** Emitted when the inference provider returns a scene interpretation.
  ```json
  {
    "type": "description",
    "t": 14.25,
    "text": "A blue sedan pulls up to the loading dock.",
    "tokens": 128,
    "latency_s": 0.42
  }
  ```

- **`frame_kept`:** Emitted when a frame passes the visual gate.
  ```json
  {
    "type": "frame_kept",
    "t": 14.0,
    "ssim": 0.84,
    "tau": 0.92
  }
  ```

- **`gate_drop_run`:** Aggregated report of consecutive dropped frames.
  ```json
  {
    "type": "gate_drop_run",
    "t_start": 10.0,
    "t_end": 13.8,
    "count": 38,
    "ssim_min": 0.94,
    "ssim_max": 0.98
  }
  ```

- **`audio_speech`:** Voice activity detected.
  ```json
  {
    "type": "audio_speech",
    "t_start": 8.1,
    "duration_ms": 1400,
    "peak_rms": 0.14
  }
  ```

- **`audio_silence`:** Silent audio window discarded.
  ```json
  {
    "type": "audio_silence",
    "t_start": 4.0,
    "duration_ms": 4100,
    "frames_dropped": 123
  }
  ```

- **`escalation`:** Triggered when acoustic cues relax visual sensitivity.
  ```json
  {
    "type": "escalation",
    "t": 8.2,
    "tau": 0.98,
    "reason": "speech_detected"
  }
  ```

- **`memory_compacted`:** Background prompt compaction event.
  ```json
  {
    "type": "memory_compacted",
    "t": 45.0,
    "compaction_number": 2,
    "events_folded": 10,
    "summary_chars": 210
  }
  ```

---

## 4. Frontend Client Architecture

The frontend is a single-page React 18 application built with TypeScript, Tailwind CSS, and Lucide icons, bundled through Vite.

```
src/
├── main.tsx                  Application entry point
├── App.tsx                   Root state container and WebSocket consumer
├── types.ts                  Pipeline status, event interfaces, and schemas
├── index.css                 Tailwind directives and design tokens
├── context/
│   └── ThemeContext.tsx      Dark/Light theme state and persistence
├── services/
│   ├── api.ts                REST client for server endpoints
│   └── ws.ts                 Reconnecting WebSocket client with ping keepalive
└── components/
    ├── Header.tsx            Status indicators, clock, and primary navigation
    ├── ControlBar.tsx        Stream URL input, presets, model pickers, toggles
    ├── VideoViewport.tsx     Live MJPEG stream player, snapshots, fullscreen
    ├── SceneInterpretation.tsx Current observation banner with latency tags
    ├── SSIMWaveform.tsx      Canvas-rendered structural similarity waveform
    ├── TelemetryMetrics.tsx  Metric cards (kept, dropped, tokens, latency)
    ├── PerceptionFeed.tsx    Filterable real-time event log with exports
    ├── AnalyticsDashboard.tsx Cost savings, SSIM histograms, model comparison
    ├── SystemInspector.tsx   Diagnostics, queue status, memory compaction ledger
    ├── EventAuditExplorer.tsx Detailed table with search and raw JSON inspector
    └── ThemeToggle.tsx       Light and dark mode switcher
```

### 4.1 Primary Navigation Views

1. **Monitor view:** Live video stream, current scene description, real-time SSIM waveform canvas, telemetry counters, and continuous perception event feed.
2. **Analytics view:** Avoided cost calculations, token consumption rates, structural similarity score distribution histograms, acoustic telemetry, and cross-model cost matrices.
3. **System view:** Pipeline concurrency inspections, queue depth tracking, bounded memory architecture diagrams, and the live compaction history table.
4. **Audit view:** Searchable and filterable tabular record of every event emitted during a session, with individual JSON inspectors and CSV/JSON export actions.

### 4.2 Styling and Theming

The application defines a semantic color palette in `tailwind.config.js` and `src/index.css` supporting both dark and light modes:
- Canvas, card, and surface backgrounds bind to CSS variables (`--color-canvas`, `--color-card`).
- Text typography uses clean hierarchy via Inter, JetBrains Mono, and Plus Jakarta Sans.
- Palette selections persist in browser `localStorage`.

---

## 5. Benchmarks and Empirical Evaluation

Empirical evaluations run against a standardized test set (`sample/demo_clip.avi`, 60.0 seconds at 320x240, 10.0 fps) with ground-truth temporal and semantic annotations.

### 5.1 Experimental Conditions

- **Condition A (Ungated Baseline):** Naive pipeline forwarding every frame without video or audio filtering. Memory is append-only.
- **Condition B (Vision Gating Only):** Visual SSIM gate enabled ($\tau = 0.92$), audio disabled, append-only memory.
- **Condition C (VIGIL Complete):** Visual gate ($\tau = 0.92$), audio gate with VAD, cross-modal escalation, and bounded context memory.
- **Condition D (Audio Escalated):** Visual gate under forced escalation mode ($\tau = 0.98$) with bounded memory.

### 5.2 Key Findings

| Condition | Retention Rate | Total Tokens | Cost / Hour (USD) | Temporal Recall | Semantic Recall |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **A (Baseline)** | 100.0% | 50,570 | $0.233 | 100.0% | 100.0% |
| **B (Vision Gate)** | 30.0% | 11,544 | $0.057 | 100.0% | 100.0% |
| **C (VIGIL Full)** | 30.0% | 11,141 | $0.055 | 100.0% | 100.0% |
| **D (Escalated)** | 34.2% | 12,113 | $0.060 | 100.0% | 100.0% |

- **Token reduction:** VIGIL achieves a **4.5x reduction** in token consumption ($50,570 \rightarrow 11,141$ tokens) compared to the un-gated baseline.
- **Recall preservation:** At threshold $\tau = 0.92$, VIGIL maintains **100% temporal recall**, detecting every ground-truth event without loss.
- **Knee of the curve:** A parameter sweep across $\tau \in [0.80, 0.99]$ demonstrates that $\tau = 0.92$ is the optimal operating point: lower values drop critical events, while higher values forward static frames with diminishing accuracy returns.

---

## 6. Installation and Operations

### 6.1 Prerequisites

- Python 3.11 or 3.12
- Node.js 18+ and npm
- `ffmpeg` installed and available on system `PATH` (required for audio extraction)

### 6.2 Setup Instructions

```bash
# Clone repository
git clone https://github.com/Shashankckotagi/vigil-web.git
cd vigil-web

# Create and activate Python virtual environment
python -m venv venv
source venv/bin/activate       # Linux/macOS
# .\venv\Scripts\activate      # Windows

# Install Python requirements
pip install -r requirements.txt

# Install Node dependencies
npm install
```

### 6.3 Running the Application

#### Development Mode (FastAPI + Vite Hot Reload)

Terminal 1 (Backend):
```bash
python -m uvicorn server:app --reload --port 8000
```

Terminal 2 (Frontend):
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. API and WebSocket calls proxy automatically to port 8000.

#### Production Mode (Single Process)

```bash
# Build frontend bundle into dist/
npm run build

# Start FastAPI server
python -m uvicorn server:app --host 0.0.0.0 --port 8000
```
Open [http://localhost:8000](http://localhost:8000). The server delivers compiled assets from `dist/` directly.

### 6.4 Docker Deployment

```bash
# Build container image
docker build -t vigil:latest .

# Run container exposing port 8000
docker run -p 8000:8000 -e GEMINI_API_KEY="your-key" vigil:latest
```

### 6.5 Hosting on Render and Vercel

Host the Python backend on Render and the React SPA on Vercel. This split pairs Render's Docker and WebSocket support with Vercel's fast global CDN.

#### Step 1: Deploy backend on Render

1. Create a new **Web Service** on [Render](https://render.com) and link your GitHub repository.
2. Select **Docker** as the runtime environment. Render automatically detects the root `Dockerfile`.
3. Set the following environment variables in the Render dashboard:
   - `GEMINI_API_KEY`: Your Gemini API key from Google AI Studio.
   - `VIGIL_PROVIDER`: `gemini`
   - `GEMINI_MODEL`: `gemini-4-hydrogen`
   - `VIGIL_LOG_LEVEL`: `INFO`
4. Set the health check path to `/api/status`.
5. Deploy the service and copy the public service URL (for example, `https://vigil-backend.onrender.com`).

You can also use the included `render.yaml` blueprint: go to **New > Blueprint** in Render and select your repository.

#### Step 2: Deploy frontend on Vercel

1. Create a new project on [Vercel](https://vercel.com) and import your GitHub repository.
2. Vercel picks up build settings from `vercel.json`:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
3. Under **Environment Variables**, add:
   - `VITE_BACKEND_URL`: Your Render backend URL (e.g. `https://vigil-backend.onrender.com`).
4. Click **Deploy**.

#### Step 3: API key and connection flow

- When built with `VITE_BACKEND_URL`, the Vercel frontend automatically connects to your Render backend on initial page load without requiring visitors to enter connection URLs.
- WebSocket connections upgrade automatically from `https://` to `wss://`.
- If you configured `GEMINI_API_KEY` on Render, the backend uses it for all perception runs.
- If you prefer client-supplied keys, visitors can enter their Gemini API key directly into the web UI. Keys stay in browser storage and pass in the authorization payload of each run request.
- Visitors can override the backend URL at any time in the control bar to target a local server or alternate host.

---

## 7. Verification and Testing

The repository includes a comprehensive, multi-layer testing harness:

### 7.1 Backend and Concurrency Test Suite

Runs offline with zero external network or API keys:

```bash
# Run core algorithmic and pipeline tests
python tests/test_vigil.py

# Run events and serialization tests
python tests/test_events.py

# Run server API and WebSocket integration tests
python tests/test_server.py

# Run static asset and pricing tests
python tests/test_frontend.py

# Run Vite production asset tests
python tests/test_vite_app.py
```

### 7.2 Frontend Unit and Component Tests

Frontend components are tested using Vitest and Testing Library:

```bash
npm test
```

### 7.3 Complete Automated Suite

Execute the full verification pass via the Makefile:

```bash
make test
```

---

## 8. Known Limitations

1. **Environmental luminance shifts:** Gradual day-to-night transitions or sudden artificial lighting toggles produce low SSIM values, which the visual gate interprets as scene motion.
2. **Camera vibration and autofocus:** Continuous auto-focus hunt causes minor edge jitter that can artificially elevate frame forwarding rates. Using fixed-focus settings resolves this.
3. **Semantic evaluation dependencies:** Automated semantic scoring uses model-based evaluation; benchmark accuracy numbers are relative to foundation model interpretation capability.
