import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Zap,
  Gauge,
  Radio,
  HardDrive,
} from 'lucide-react';
import { PipelineStatus, PricingConfig } from '../types';

interface TelemetryMetricsProps {
  status: PipelineStatus | null;
  pricing?: PricingConfig;
}

export const TelemetryMetrics: React.FC<TelemetryMetricsProps> = ({ status, pricing }) => {
  const safePricing: any = pricing || {
    'gemini-3.5-flash-lite': { input_per_million: 0.30, output_per_million: 2.50 },
    'gemini-4-hydrogen': { input_per_million: 1.50, output_per_million: 7.50 },
    'gemini-4-argon': { input_per_million: 2.00, output_per_million: 10.00 },
    'gemini-4-carbon': { input_per_million: 2.00, output_per_million: 10.00 },
    'gemini-2.5-flash': { input_per_million: 0.075, output_per_million: 0.3 },
    default: { input_per_million: 0.075, output_per_million: 0.3 },
    usd_to_inr: 86.0,
  };
  const gate = status?.gate || {};
  const metrics = status?.metrics || {};
  const mem = status?.memory || {};

  const framesKept = gate.frames_kept || 0;
  const framesSeen = gate.frames_seen || 0;
  const framesDropped = gate.frames_dropped || 0;
  const frameRetention = gate.frame_retention != null ? (gate.frame_retention * 100).toFixed(1) : '0.0';

  const tokensTotal = metrics.tokens_total || 0;
  const tokensIn = metrics.tokens_in || Math.round(tokensTotal * 0.85);
  const tokensOut = metrics.tokens_out || Math.round(tokensTotal * 0.15);
  const tokensRate = Math.round(metrics.tokens_per_hour || 0);

  // Pricing calculations
  const model = status?.provider || 'gemini-2.5-flash';
  const rateConfig = (safePricing[model] || safePricing['default']) as { input_per_million: number; output_per_million: number } | undefined;
  const inputRate = rateConfig?.input_per_million ?? 0.075;
  const outputRate = rateConfig?.output_per_million ?? 0.3;
  const usdIn = (tokensIn / 1_000_000) * inputRate;
  const usdOut = (tokensOut / 1_000_000) * outputRate;
  const totalUsd = usdIn + usdOut;
  const usdToInr = safePricing.usd_to_inr || 86.0;
  const totalInr = totalUsd * usdToInr;

  // Latency
  const p50 = metrics.p50_latency_s ? `${metrics.p50_latency_s.toFixed(2)}s` : '—';
  const p95 = metrics.p95_latency_s ? `${metrics.p95_latency_s.toFixed(2)}s` : '—';
  const primaryLatency = p95 !== '—' ? p95 : p50;

  // Active Source
  const rawUrl = status?.url || 'IDLE';
  const sourceDisplay = rawUrl.length > 20 ? `${rawUrl.slice(0, 18)}...` : rawUrl;
  const reconnects = status?.reconnects || 0;

  // Memory
  const memMode = mem.mode ? mem.mode.toUpperCase() : mem.bounded === false ? 'APPEND-ONLY' : 'BOUNDED';
  const compactions = mem.compactions || 0;
  const queueDepth = status?.queue_depth ?? metrics.max_queue_depth ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. Frames Kept */}
      <div className="surface-card p-3 space-y-1">
        <div className="flex items-center justify-between text-ink-faint text-[11px]">
          <span>Frames Kept</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-accent-emerald" />
        </div>
        <div id="statKept" className="text-lg font-mono font-semibold text-accent-emerald">
          {framesKept.toLocaleString()}
        </div>
        <div id="statKeptSub" className="text-[10px] text-ink-faint font-mono">
          {framesSeen.toLocaleString()} seen
        </div>
      </div>

      {/* 2. Frames Dropped */}
      <div className="surface-card p-3 space-y-1">
        <div className="flex items-center justify-between text-ink-faint text-[11px]">
          <span>Frames Dropped</span>
          <XCircle className="w-3.5 h-3.5 text-accent-rose" />
        </div>
        <div id="statDropped" className="text-lg font-mono font-semibold text-accent-rose">
          {framesDropped.toLocaleString()}
        </div>
        <div id="statRetention" className="text-[10px] text-ink-faint font-mono">
          {frameRetention}% retention
        </div>
      </div>

      {/* 3. Token Consumption */}
      <div className="surface-card p-3 space-y-1">
        <div className="flex items-center justify-between text-ink-faint text-[11px]">
          <span>Tokens Used</span>
          <Zap className="w-3.5 h-3.5 text-accent-warm" />
        </div>
        <div id="statTokens" className="text-lg font-mono font-semibold text-ink-main">
          {tokensTotal.toLocaleString()}
        </div>
        <div id="statTokensRate" className="text-[10px] text-ink-faint font-mono truncate" title={`${tokensRate} tok/hr`}>
          {tokensRate.toLocaleString()} tok/hr
          {totalUsd > 0 && ` • $${totalUsd.toFixed(4)} (~₹${totalInr.toFixed(2)})`}
        </div>
      </div>

      {/* 4. Inference Latency */}
      <div className="surface-card p-3 space-y-1">
        <div className="flex items-center justify-between text-ink-faint text-[11px]">
          <span>Inference Latency</span>
          <Gauge className="w-3.5 h-3.5 text-accent-primary" />
        </div>
        <div id="statLatency" className="text-lg font-mono font-semibold text-ink-main">
          {primaryLatency}
        </div>
        <div id="statLatencySub" className="text-[10px] text-ink-faint font-mono">
          p50: {p50} | p95: {p95}
        </div>
      </div>

      {/* 5. Active Source */}
      <div className="surface-card p-3 space-y-1">
        <div className="flex items-center justify-between text-ink-faint text-[11px]">
          <span>Active Source</span>
          <Radio className="w-3.5 h-3.5 text-accent-secondary" />
        </div>
        <div id="statSource" className="text-xs font-mono font-medium text-ink-main truncate mt-1" title={rawUrl}>
          {sourceDisplay}
        </div>
        <div id="statReconnects" className="text-[10px] text-ink-faint font-mono">
          {reconnects} reconnects
        </div>
      </div>

      {/* 6. Context Memory */}
      <div className="surface-card p-3 space-y-1">
        <div className="flex items-center justify-between text-ink-faint text-[11px]">
          <span>Context Memory</span>
          <HardDrive className="w-3.5 h-3.5 text-accent-amethyst" />
        </div>
        <div id="statMemory" className="text-xs font-mono font-medium text-ink-main truncate mt-1">
          {memMode}
        </div>
        <div id="statCompaction" className="text-[10px] text-ink-faint font-mono truncate">
          {compactions} compactions • q: {queueDepth}
        </div>
      </div>
    </div>
  );
};
