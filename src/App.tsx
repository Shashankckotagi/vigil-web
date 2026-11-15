import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ControlBar } from './components/ControlBar';
import { VideoViewport } from './components/VideoViewport';
import { SceneInterpretation } from './components/SceneInterpretation';
import { SSIMWaveform } from './components/SSIMWaveform';
import { TelemetryMetrics } from './components/TelemetryMetrics';
import { PerceptionFeed } from './components/PerceptionFeed';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { SystemInspector } from './components/SystemInspector';
import { EventAuditExplorer } from './components/EventAuditExplorer';
import {
  fetchStatus,
  fetchPricing,
  startPipeline,
  stopPipeline,
  uploadVideoFile,
  getBackendUrl,
  setBackendUrl as saveBackendUrl,
} from './services/api';
import { PipelineSocket, SocketStatus } from './services/ws';
import {
  PipelineStatus,
  PricingConfig,
  FormattedEvent,
  EventCategory,
  PipelineEventBase,
  ActiveTab,
} from './types';

const STORAGE_KEY_GEMINI_KEY = 'vigil_gemini_api_key';
const STORAGE_KEY_YOUTUBE_COOKIES = 'vigil_youtube_cookies';

export const App: React.FC = () => {
  // Settings & Form State
  const [url, setUrl] = useState('https://www.youtube.com/live/EO_1LWqsCNE');
  const [tau, setTau] = useState(0.92);
  const [provider, setProvider] = useState('mock');
  const [model, setModel] = useState('gemini-4-hydrogen');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY_GEMINI_KEY) || '');
  const [cookies, setCookies] = useState(() => localStorage.getItem(STORAGE_KEY_YOUTUBE_COOKIES) || '');
  const [runId, setRunId] = useState('');
  const [backendUrl, setBackendUrlState] = useState(() => getBackendUrl());
  const [audio, setAudio] = useState(true);
  const [escalation, setEscalation] = useState(true);
  const [gate, setGate] = useState(true);
  const [bounded, setBounded] = useState(true);

  // View Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitor');

  // Status & Telemetry State
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [pricing, setPricing] = useState<PricingConfig>({
    'gemini-4-carbon': { input_per_million: 2.00, output_per_million: 10.00 },
    'gemini-4-argon': { input_per_million: 2.00, output_per_million: 10.00 },
    'gemini-4-hydrogen': { input_per_million: 1.50, output_per_million: 7.50 },
    'gemini-3.8-flash': { input_per_million: 0.10, output_per_million: 0.40 },
    'gemini-3.5-flash-lite': { input_per_million: 0.30, output_per_million: 2.50 },
    default: { input_per_million: 1.50, output_per_million: 7.50 },
    usd_to_inr: 86.0,
  });
  const [wsStatus, setWsStatus] = useState<SocketStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Streaming Data
  const [ssimHistory, setSsimHistory] = useState<Array<{ ssim: number; kept: boolean }>>([]);
  const [events, setEvents] = useState<FormattedEvent[]>([]);
  const [countFree, setCountFree] = useState(0);
  const [countBilled, setCountBilled] = useState(0);
  const [sceneInterpretation, setSceneInterpretation] = useState<{
    description: string;
    timestamp: string;
    tokens?: number;
    latency_s?: number;
  }>({
    description: 'Monitoring stream...',
    timestamp: '00:00',
  });

  const socketRef = useRef<PipelineSocket | null>(null);

  // Persist API Key
  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY_GEMINI_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_GEMINI_KEY);
    }
  };

  // Persist YouTube Cookies
  const handleCookiesChange = (val: string) => {
    setCookies(val);
    if (val.trim()) {
      localStorage.setItem(STORAGE_KEY_YOUTUBE_COOKIES, val.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_YOUTUBE_COOKIES);
    }
  };

  // Persist Backend URL
  const handleBackendUrlChange = (newUrl: string) => {
    setBackendUrlState(newUrl);
    saveBackendUrl(newUrl);
    socketRef.current?.reconnect();
    fetchStatus().then((s) => setStatus(s)).catch(() => {});
  };

  // Format incoming pipeline event
  const formatEvent = (ev: PipelineEventBase): FormattedEvent | null => {
    const type = ev.type;
    if (type === 'frame') return null;

    let tag = '';
    let category: EventCategory = 'system';
    let title = '';
    let body = '';
    let rawT = ev.t ?? 0;
    const badges: Array<{ label: string }> = [];

    switch (type) {
      case 'description':
        tag = 'LLM';
        category = 'llm';
        title = 'LLM Scene Description';
        body = ev.text || '';
        if (ev.tokens) badges.push({ label: `${ev.tokens} tok` });
        if (ev.latency_s != null) badges.push({ label: `${ev.latency_s}s` });
        break;

      case 'frame_kept':
        tag = 'KEPT';
        category = 'gate';
        title = 'Frame Passed Gating';
        body = `frame passed — SSIM ${(ev.ssim ?? 0).toFixed(2)} below τ ${(ev.tau ?? 0.92).toFixed(2)}`;
        break;

      case 'gate_drop_run':
        tag = 'DROPPED';
        category = 'gate';
        rawT = ev.t_start ?? ev.t_end ?? 0;
        title = 'Frames Dropped';
        body = `${ev.count} frames dropped, no change (SSIM ${(ev.ssim_min ?? 0).toFixed(2)}–${(ev.ssim_max ?? 0).toFixed(2)})`;
        break;

      case 'audio_speech':
        tag = 'HEARD';
        category = 'audio';
        rawT = ev.t_start ?? 0;
        title = 'Speech Detected';
        body = `speech detected, ${((ev.duration_ms ?? 0) / 1000).toFixed(1)}s duration, peak ${(ev.peak_rms ?? 0).toFixed(2)} RMS`;
        break;

      case 'audio_silence':
        tag = 'SILENT';
        category = 'audio';
        rawT = ev.t_start ?? 0;
        title = 'Silence Window';
        body = `${((ev.duration_ms ?? 0) / 1000).toFixed(1)}s silence window, ${ev.frames_dropped ?? 0} frames dropped`;
        break;

      case 'escalation':
        tag = 'ESCALATED';
        category = 'audio';
        title = 'Acoustic Escalation';
        body = `loud acoustic event — τ relaxed to ${(ev.tau ?? 0.98).toFixed(2)} for 30s`;
        break;

      case 'chunk_queued':
        tag = 'QUEUED';
        category = 'system';
        title = 'Chunk Queued';
        body = `chunk ${ev.chunk} — ${ev.images} frames, ${ev.speech_ms ?? 0}ms speech, queue depth ${ev.queue_depth}/10`;
        break;

      case 'memory_compacted':
        tag = 'MEMORY';
        category = 'system';
        title = 'Memory Compacted';
        body = `context memory compacted — ${ev.events_folded ?? 0} events folded, summary length ${ev.summary_chars ?? 0} chars`;
        break;

      case 'backpressure':
        tag = 'WAITED';
        category = 'system';
        title = 'Backpressure Wait';
        body = `producer throttled ${(ev.waited_s ?? 0).toFixed(1)}s, queue saturated`;
        break;

      case 'rate_limit_wait':
        tag = 'THROTTLED';
        category = 'system';
        title = 'Rate Limit Throttling';
        body = `rate limiter holding for ${(ev.waited_s ?? 0).toFixed(1)}s`;
        break;

      case 'error':
        tag = 'ERROR';
        category = 'system';
        title = 'Pipeline Error';
        body = ev.error || 'pipeline error occurred';
        break;

      default:
        return null;
    }

    const secs = Math.floor(rawT || 0);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    const timestamp = `${mm}:${ss}`;

    return {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      rawEvent: ev,
      type,
      tag,
      category,
      timestamp,
      rawT,
      cost: ev.cost === 'billed' ? 'billed' : 'free',
      title,
      body,
      badges,
    };
  };

  // Initialize data and WebSocket
  useEffect(() => {
    fetchPricing().then((p) => setPricing(p)).catch(() => {});
    fetchStatus().then((s) => setStatus(s)).catch(() => {});

    const socket = new PipelineSocket({
      onStatusChange: (s) => setWsStatus(s),
      onEvent: (ev) => {
        if (ev.type === 'frame') {
          setSsimHistory((prev) => {
            const next = [...prev, { ssim: ev.ssim, kept: !!ev.kept }];
            return next.length > 60 ? next.slice(-60) : next;
          });
          if (ev.gate) {
            setStatus((prev) => ({
              ...(prev || {}),
              running: true,
              gate: ev.gate,
            }));
          }
        } else if (ev.type === 'started' || ev.type === 'stopped') {
          if (ev.status) setStatus(ev.status);
        } else {
          const formatted = formatEvent(ev);
          if (formatted) {
            setEvents((prev) => {
              const next = [...prev, formatted];
              return next.length > 500 ? next.slice(-500) : next;
            });

            if (formatted.cost === 'billed') {
              setCountBilled((c) => c + 1);
            } else {
              setCountFree((c) => c + 1);
            }

            if (ev.type === 'description' && ev.text) {
              setSceneInterpretation({
                description: ev.text,
                timestamp: formatted.timestamp,
                tokens: ev.tokens,
                latency_s: ev.latency_s,
              });
            }
          }

          if (ev.status) {
            setStatus(ev.status);
          }
          if (ev.error) {
            setErrorMessage(ev.error);
          }
        }
      },
      onError: (err) => {
        console.warn('Pipeline WebSocket alert:', err);
      },
    });

    socket.connect();
    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  // Actions
  const handleStart = async () => {
    if (!url.trim()) {
      setErrorMessage('Please enter a valid video stream URL or file path.');
      return;
    }
    if (provider === 'gemini' && !apiKey.trim()) {
      setErrorMessage('Gemini API key is required before starting inferences. Please configure and verify your Gemini key in settings.');
      return;
    }
    setIsStarting(true);
    setErrorMessage(null);
    try {
      const res = await startPipeline({
        url: url.trim(),
        tau,
        escalation,
        gate,
        bounded,
        audio,
        provider,
        model,
        api_key: apiKey.trim() || undefined,
        run_id: runId.trim() || undefined,
        cookies: cookies.trim() || undefined,
      });
      if (res.status) setStatus(res.status);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start video perception pipeline');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      const res = await stopPipeline();
      if (res.status) setStatus(res.status);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to stop pipeline');
    }
  };

  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const res = await uploadVideoFile(file);
      if (res.path) {
        setUrl(res.path);
        // Automatically start the uploaded clip
        const startRes = await startPipeline({
          url: res.path,
          tau,
          escalation,
          gate,
          bounded,
          audio,
          provider,
          api_key: apiKey.trim() || undefined,
          run_id: runId.trim() || undefined,
        });
        if (startRes.status) setStatus(startRes.status);
      }
    } catch (err: any) {
      setErrorMessage(`Upload failed: ${err.message || err}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearFeed = () => {
    setEvents([]);
    setCountFree(0);
    setCountBilled(0);
    setSsimHistory([]);
  };

  // Retention calculation
  const totalEvents = countFree + countBilled;
  const freeRatio = totalEvents > 0 ? `${((countFree / totalEvents) * 100).toFixed(1)}%` : '100%';
  const retentionPercent =
    status?.gate?.frame_retention != null
      ? status.gate.frame_retention * 100
      : 0;

  return (
    <div className="min-h-screen bg-canvas text-ink-main flex flex-col font-sans transition-colors duration-700">
      <Header
        status={status}
        wsConnected={wsStatus === 'connected'}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        eventCount={events.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* View 1: Live Perception & Operational Command Monitor */}
        {activeTab === 'monitor' && (
          <div className="space-y-6 animate-fade-in">
            {/* Top Control Bar */}
            <ControlBar
              url={url}
              setUrl={setUrl}
              tau={tau}
              setTau={setTau}
              provider={provider}
              setProvider={setProvider}
              model={model}
              setModel={setModel}
              apiKey={apiKey}
              setApiKey={handleApiKeyChange}
              runId={runId}
              setRunId={setRunId}
              backendUrl={backendUrl}
              setBackendUrl={handleBackendUrlChange}
              audio={audio}
              setAudio={setAudio}
              escalation={escalation}
              setEscalation={setEscalation}
              gate={gate}
              setGate={setGate}
              bounded={bounded}
              setBounded={setBounded}
              cookies={cookies}
              setCookies={handleCookiesChange}
              hasServerCookies={!!status?.has_youtube_cookies}
              isRunning={!!status?.running}
              isStarting={isStarting}
              isUploading={isUploading}
              onStart={handleStart}
              onStop={handleStop}
              onUploadFile={handleUploadFile}
              errorMessage={errorMessage}
              setErrorMessage={setErrorMessage}
            />

            {/* Dual Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Viewport & Telemetry (7 cols) */}
              <div className="lg:col-span-7 space-y-5">
                {/* Live OpenCV Stream Viewport */}
                <VideoViewport status={status} isRunning={!!status?.running} />

                {/* Current Real-time Scene Interpretation */}
                <SceneInterpretation
                  description={sceneInterpretation.description}
                  timestamp={sceneInterpretation.timestamp}
                  tokens={sceneInterpretation.tokens}
                  latency_s={sceneInterpretation.latency_s}
                />

                {/* Real-time SSIM Waveform Canvas */}
                <SSIMWaveform
                  history={ssimHistory}
                  tau={tau}
                  retentionPercent={retentionPercent}
                />

                {/* Telemetry Metric Cards */}
                <TelemetryMetrics status={status} pricing={pricing} />
              </div>

              {/* Right Column: Real-time Perception Feed (5 cols) */}
              <div className="lg:col-span-5">
                <PerceptionFeed
                  events={events}
                  countFree={countFree}
                  countBilled={countBilled}
                  freeRatio={freeRatio}
                  onClear={handleClearFeed}
                />
              </div>
            </div>
          </div>
        )}

        {/* View 2: Deep Analytics & ROI Dashboard */}
        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            status={status}
            pricing={pricing}
            events={events}
            ssimHistory={ssimHistory}
            tau={tau}
          />
        )}

        {/* View 3: System & Memory Inspector */}
        {activeTab === 'system' && (
          <SystemInspector
            status={status}
            events={events}
          />
        )}

        {/* View 4: Event Auditing & Raw Payload Explorer */}
        {activeTab === 'audit' && (
          <EventAuditExplorer
            events={events}
            countFree={countFree}
            countBilled={countBilled}
            freeRatio={freeRatio}
          />
        )}
      </main>

      <footer className="border-t border-border-subtle py-4 px-6 text-center text-xs text-ink-faint">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <span>VIGIL Intelligence • Vision-Language Stream Telemetry Hub</span>
          <span className="font-mono text-[11px]">Continuous Visual & Acoustic Perception</span>
        </div>
      </footer>
    </div>
  );
};
