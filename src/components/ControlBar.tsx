import React, { useState, useRef } from 'react';
import {
  Play,
  Square,
  Upload,
  Sliders,
  ChevronDown,
  ChevronUp,
  Link2,
  Key,
  Shield,
  Volume2,
  TrendingUp,
  Brain,
  Layers,
  Server,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { verifyApiKey } from '../services/api';
import { StartRequest } from '../types';

interface ControlBarProps {
  url: string;
  setUrl: (url: string) => void;
  tau: number;
  setTau: (tau: number) => void;
  provider: string;
  setProvider: (p: string) => void;
  model?: string;
  setModel?: (m: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  runId: string;
  setRunId: (id: string) => void;
  backendUrl: string;
  setBackendUrl: (url: string) => void;
  audio: boolean;
  setAudio: (val: boolean) => void;
  escalation: boolean;
  setEscalation: (val: boolean) => void;
  gate: boolean;
  setGate: (val: boolean) => void;
  bounded: boolean;
  setBounded: (val: boolean) => void;
  isRunning: boolean;
  isStarting: boolean;
  isUploading: boolean;
  onStart: () => void;
  onStop: () => void;
  onUploadFile: (file: File) => void;
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  url,
  setUrl,
  tau,
  setTau,
  provider,
  setProvider,
  model = 'gemini-2.5-flash',
  setModel = () => {},
  apiKey,
  setApiKey,
  runId,
  setRunId,
  backendUrl,
  setBackendUrl,
  audio,
  setAudio,
  escalation,
  setEscalation,
  gate,
  setGate,
  bounded,
  setBounded,
  isRunning,
  isStarting,
  isUploading,
  onStart,
  onStop,
  onUploadFile,
  errorMessage,
  setErrorMessage,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    valid?: boolean;
    message?: string;
    error?: string;
    latency_ms?: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMissingApiKey = provider === 'gemini' && !apiKey.trim();

  const handleVerifyKey = async () => {
    if (!apiKey.trim()) {
      setVerifyStatus({
        valid: false,
        error: 'Please enter a Gemini API key to test.',
      });
      return;
    }
    setIsVerifying(true);
    setVerifyStatus(null);
    try {
      const res = await verifyApiKey(apiKey.trim(), model, provider);
      setVerifyStatus(res);
    } catch (e: any) {
      setVerifyStatus({
        valid: false,
        error: e.message || 'Verification connection failed',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const presets = [
    {
      label: 'YouTube Live Stream',
      url: 'https://www.youtube.com/live/EO_1LWqsCNE',
      badge: 'Live',
    },
    {
      label: 'Bundled Demo Clip',
      url: 'sample/demo_clip.avi',
      badge: 'AVI',
    },
    {
      label: 'USB Webcam (0)',
      url: '0',
      badge: 'Camera',
    },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
    }
  };

  return (
    <section className="surface-card p-4 sm:p-5 mb-6 space-y-4">
      {/* Primary URL row */}
      <div className="flex flex-col md:flex-row items-stretch gap-2.5">
        <div className="relative flex-1 group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-faint group-focus-within:text-accent-primary transition-colors">
            <Link2 className="w-4 h-4" />
          </div>
          <input
            id="url"
            type="text"
            spellCheck="false"
            placeholder="Enter YouTube live URL, stream, or file path..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isRunning}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border-subtle bg-card-subtle text-xs sm:text-sm text-ink-main placeholder:text-ink-faint focus:outline-none focus:border-border-hover focus:ring-1 focus:ring-accent-primary/30 transition-all font-mono"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            id="btnStart"
            onClick={onStart}
            disabled={isRunning || isStarting || isMissingApiKey}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-primary hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-canvas font-medium text-xs sm:text-sm tracking-wide transition-all duration-400 shadow-sm"
            title={
              isMissingApiKey
                ? 'Gemini API key is required before starting stream inference'
                : 'Start video stream perception'
            }
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isStarting ? 'Starting...' : 'Start Stream'}</span>
          </button>

          <button
            id="btnUpload"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRunning || isUploading}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-border-subtle bg-card-subtle hover:bg-card-hover hover:border-border-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm text-ink-muted hover:text-ink-main transition-all duration-400"
            title="Upload local video file"
          >
            <Upload className="w-3.5 h-3.5 text-accent-secondary" />
            <span className="hidden sm:inline">{isUploading ? 'Uploading...' : 'Upload Video'}</span>
          </button>
          <input
            type="file"
            id="filePicker"
            ref={fileInputRef}
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <button
            id="btnStop"
            onClick={onStop}
            disabled={!isRunning}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent-rose/30 bg-accent-rose/10 hover:bg-accent-rose/20 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm text-accent-rose transition-all duration-400"
            title="Stop running pipeline"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center justify-center p-2.5 rounded-lg border transition-all duration-400 ${
              showAdvanced
                ? 'border-accent-primary text-accent-primary bg-accent-primary-subtle'
                : 'border-border-subtle bg-card-subtle text-ink-muted hover:text-ink-main hover:border-border-hover'
            }`}
            title="Toggle advanced tuning parameters"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Presets Strip */}
      <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
        <span className="text-[11px] font-medium text-ink-faint mr-1">Quick Presets:</span>
        {presets.map((p, idx) => (
          <button
            key={idx}
            className="preset-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border-subtle bg-card-subtle/80 hover:bg-card-hover hover:border-border-hover text-ink-muted hover:text-ink-main transition-all duration-400 text-[11px]"
            data-url={p.url}
            onClick={() => setUrl(p.url)}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent-secondary" />
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {/* Warning banner when Gemini provider is selected without an API key */}
      {isMissingApiKey && (
        <div
          id="apiKeyRequiredBanner"
          className="flex items-center justify-between p-3 rounded-xl bg-accent-rose/10 border border-accent-rose/30 text-accent-rose text-xs animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-accent-rose" />
            <span>
              <strong>Gemini API Key Required:</strong> Add your key to start.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced(true)}
            className="underline font-semibold hover:text-accent-rose/80 whitespace-nowrap ml-2 cursor-pointer"
          >
            Add key →
          </button>
        </div>
      )}

      {/* Advanced Settings Drawer */}
      {showAdvanced && (
        <div className="pt-3 border-t border-border-subtle animate-slide-down space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Gating Threshold Slider */}
            <div className="space-y-1.5 p-3 rounded-lg bg-card-subtle border border-border-subtle">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-muted font-medium flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-accent-primary" />
                  SSIM Gating Threshold (τ)
                </span>
                <span id="tauVal" className="font-mono font-semibold text-accent-primary">
                  {tau.toFixed(2)}
                </span>
              </div>
              <input
                id="tau"
                type="range"
                min="0.70"
                max="0.99"
                step="0.01"
                value={tau}
                onChange={(e) => setTau(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-ink-faint font-mono">
                <span>0.70 (strict)</span>
                <span>0.99 (sensitive)</span>
              </div>
            </div>

            {/* Provider Selection */}
            <div className="space-y-1.5 p-3 rounded-lg bg-card-subtle border border-border-subtle">
              <label className="text-xs text-ink-muted font-medium flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-accent-secondary" />
                Inference Provider
              </label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-border-subtle bg-card text-xs text-ink-main focus:outline-none focus:border-border-hover font-mono"
              >
                <option value="mock">Local (no cost)</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Ollama (local)</option>
              </select>
            </div>

            {/* Gemini Model Variant Selection */}
            {provider === 'gemini' ? (
              <div className="space-y-1.5 p-3 rounded-lg bg-card-subtle border border-border-subtle" id="geminiModelGroup">
                <label className="text-xs text-ink-muted font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent-primary" />
                  Gemini Model
                </label>
                <select
                  id="geminiModelSelect"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-border-subtle bg-card text-xs text-ink-main focus:outline-none focus:border-border-hover font-mono"
                >
                  <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
                  <option value="gemini-4-hydrogen">Gemini 4 Hydrogen</option>
                  <option value="gemini-4-argon">Gemini 4 Argon</option>
                  <option value="gemini-4-carbon">Gemini 4 Carbon</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
              </div>
            ) : (
              /* Run ID Input when Gemini is not selected */
              <div className="space-y-1.5 p-3 rounded-lg bg-card-subtle border border-border-subtle">
                <label className="text-xs text-ink-muted font-medium flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-accent-amethyst" />
                  Run ID
                </label>
                <input
                  type="text"
                  id="runId"
                  placeholder="auto"
                  value={runId}
                  onChange={(e) => setRunId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-border-subtle bg-card text-xs text-ink-main placeholder:text-ink-faint focus:outline-none focus:border-border-hover font-mono"
                />
              </div>
            )}

            {/* Backend URL Override */}
            <div className="space-y-1.5 p-3 rounded-lg bg-card-subtle border border-border-subtle" id="backendGroup">
              <label className="text-xs text-ink-muted font-medium flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-accent-periwinkle" />
                Backend URL
              </label>
              <input
                type="text"
                id="backendUrl"
                placeholder="Current origin"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-border-subtle bg-card text-xs text-ink-main placeholder:text-ink-faint focus:outline-none focus:border-border-hover font-mono"
              />
            </div>
          </div>

          {/* Gemini API Key & Verification row if Gemini is selected */}
          {provider === 'gemini' && (
            <div
              id="geminiKeyGroup"
              className="p-3.5 rounded-xl bg-accent-primary-subtle/50 border border-accent-primary/30 space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                <label className="text-xs text-ink-main font-semibold flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-accent-primary" />
                  Gemini API Key
                </label>
                <span className="text-[10px] text-ink-faint">Saved in browser</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    id="geminiKey"
                    placeholder="Paste Gemini API Key (AIzaSy...)"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setVerifyStatus(null);
                    }}
                    className="w-full px-2.5 py-2 pr-8 rounded-lg border border-border-subtle bg-card text-xs text-ink-main placeholder:text-ink-faint focus:outline-none focus:border-border-hover font-mono shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-main transition-colors"
                  >
                    {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <button
                  type="button"
                  id="btnVerifyKey"
                  onClick={handleVerifyKey}
                  disabled={isVerifying || !apiKey.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-card border border-border-subtle hover:border-border-hover disabled:opacity-40 text-xs font-mono font-medium text-ink-muted hover:text-ink-main transition-all whitespace-nowrap shadow-sm cursor-pointer"
                  title="Test Gemini API key"
                >
                  {isVerifying ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-primary" />
                  ) : (
                    <Shield className="w-3.5 h-3.5 text-accent-primary" />
                  )}
                  <span>{isVerifying ? 'Verifying...' : 'Verify Key'}</span>
                </button>
              </div>

              {/* Verification status feedback */}
              {verifyStatus && (
                <div
                  id="verificationFeedback"
                  className={`p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 animate-fade-in ${
                    verifyStatus.valid
                      ? 'bg-accent-emerald/15 border border-accent-emerald/30 text-accent-emerald'
                      : 'bg-accent-rose/15 border border-accent-rose/30 text-accent-rose'
                  }`}
                >
                  {verifyStatus.valid ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-accent-emerald" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0 text-accent-rose" />
                  )}
                  <span className="text-[11px] leading-tight">
                    {verifyStatus.valid ? verifyStatus.message : verifyStatus.error}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Feature Toggles Strip */}
          <div className="flex items-center gap-4 flex-wrap pt-1 text-xs">
            {/* Audio Toggle */}
            <label
              className="flex items-center gap-2 cursor-pointer select-none text-ink-muted hover:text-ink-main transition-colors"
              title="Enable or disable audio"
            >
              <input
                id="audio"
                type="checkbox"
                checked={audio}
                onChange={(e) => setAudio(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border-subtle accent-accent-primary"
              />
              <span className="flex items-center gap-1">
                <Volume2 className="w-3 h-3 text-accent-secondary" />
                Audio
              </span>
            </label>

            {/* Audio Escalation */}
            <label
              className="flex items-center gap-2 cursor-pointer select-none text-ink-muted hover:text-ink-main transition-colors"
              title="Lower threshold on loud sounds"
            >
              <input
                id="esc"
                type="checkbox"
                checked={escalation}
                onChange={(e) => setEscalation(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border-subtle accent-accent-primary"
              />
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-accent-warm" />
                Audio escalation
              </span>
            </label>

            {/* Vision Gating */}
            <label
              className="flex items-center gap-2 cursor-pointer select-none text-ink-muted hover:text-ink-main transition-colors"
              title="Drop similar video frames"
            >
              <input
                id="gate"
                type="checkbox"
                checked={gate}
                onChange={(e) => setGate(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border-subtle accent-accent-primary"
              />
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-accent-emerald" />
                Vision gating
              </span>
            </label>

            {/* Bounded Memory */}
            <label
              className="flex items-center gap-2 cursor-pointer select-none text-ink-muted hover:text-ink-main transition-colors"
              title="Keep prompt length bounded"
            >
              <input
                id="bounded"
                type="checkbox"
                checked={bounded}
                onChange={(e) => setBounded(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border-subtle accent-accent-primary"
              />
              <span className="flex items-center gap-1">
                <Brain className="w-3 h-3 text-accent-amethyst" />
                Bounded memory
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Error banner */}
      <div
        id="errBanner"
        style={{ display: errorMessage ? 'flex' : 'none' }}
        className="items-center gap-2 p-3 rounded-lg bg-accent-rose/10 border border-accent-rose/30 text-accent-rose text-xs animate-fadeIn"
      >
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span className="flex-1">{errorMessage}</span>
        <button
          onClick={() => setErrorMessage(null)}
          className="text-[11px] underline hover:opacity-80"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
};
