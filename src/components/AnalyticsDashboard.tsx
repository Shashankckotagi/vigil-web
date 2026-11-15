import React, { useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShieldCheck,
  Zap,
  Activity,
  Gauge,
  Volume2,
  Clock,
  Sparkles,
  PieChart,
  BarChart2,
  Layers,
  ArrowDownRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { PipelineStatus, PricingConfig, FormattedEvent } from '../types';

interface AnalyticsDashboardProps {
  status: PipelineStatus | null;
  pricing?: PricingConfig;
  events: FormattedEvent[];
  ssimHistory: Array<{ ssim: number; kept: boolean }>;
  tau: number;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  status,
  pricing,
  events,
  ssimHistory,
  tau,
}) => {
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

  const framesSeen = gate.frames_seen || 0;
  const framesKept = gate.frames_kept || 0;
  const framesDropped = gate.frames_dropped || 0;
  const retentionPercent = framesSeen > 0 ? (framesKept / framesSeen) * 100 : 0;
  const dropPercent = 100 - retentionPercent;

  // Tokenomics & Costs
  const tokensTotal = metrics.tokens_total || 0;
  const tokensIn = metrics.tokens_in || Math.round(tokensTotal * 0.85);
  const tokensOut = metrics.tokens_out || Math.round(tokensTotal * 0.15);
  const tokensPerHour = Math.round(metrics.tokens_per_hour || 0);

  const model = status?.provider || 'gemini-2.5-flash';
  const rateConfig = (safePricing[model] || safePricing['default']) as
    | { input_per_million: number; output_per_million: number }
    | undefined;
  const inRate = rateConfig?.input_per_million ?? 0.075;
  const outRate = rateConfig?.output_per_million ?? 0.3;

  const actualUsd = (tokensIn / 1_000_000) * inRate + (tokensOut / 1_000_000) * outRate;
  const usdToInr = safePricing.usd_to_inr || 86.0;
  const actualInr = actualUsd * usdToInr;

  // Estimated ungated brute-force cost (if every frame was sent without SSIM gate)
  const ungatedMultiplier = framesKept > 0 ? framesSeen / framesKept : framesSeen > 0 ? 10 : 1;
  const ungatedTokens = Math.round(tokensTotal * Math.max(ungatedMultiplier, 1));
  const ungatedUsd = (ungatedTokens / 1_000_000) * ((inRate + outRate) / 2);
  const savedUsd = Math.max(ungatedUsd - actualUsd, 0);
  const savedInr = savedUsd * usdToInr;

  // SSIM Distribution Stats
  const ssimStats = useMemo(() => {
    if (ssimHistory.length === 0) {
      return { min: 0, max: 0, mean: 0, stdDev: 0, buckets: [0, 0, 0, 0, 0, 0] };
    }
    const scores = ssimHistory.map((s) => s.ssim);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const sum = scores.reduce((a, b) => a + b, 0);
    const mean = sum / scores.length;
    const variance = scores.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Buckets: <0.70, 0.70-0.80, 0.80-0.88, 0.88-0.92, 0.92-0.96, 0.96-1.0
    const buckets = [0, 0, 0, 0, 0, 0];
    scores.forEach((s) => {
      if (s < 0.7) buckets[0]++;
      else if (s < 0.8) buckets[1]++;
      else if (s < 0.88) buckets[2]++;
      else if (s < 0.92) buckets[3]++;
      else if (s < 0.96) buckets[4]++;
      else buckets[5]++;
    });

    return { min, max, mean, stdDev, buckets };
  }, [ssimHistory]);

  // Audio & Escalation Stats
  const audioStats = useMemo(() => {
    const audioEvents = events.filter((e) => e.category === 'audio');
    const speechEvents = audioEvents.filter((e) => e.tag === 'HEARD');
    const silentEvents = audioEvents.filter((e) => e.tag === 'SILENT');
    const escalationEvents = events.filter((e) => e.tag === 'ESCALATED');

    let totalSpeechMs = 0;
    speechEvents.forEach((e) => {
      if (e.rawEvent && typeof e.rawEvent.duration_ms === 'number') {
        totalSpeechMs += e.rawEvent.duration_ms;
      }
    });

    return {
      speechCount: speechEvents.length,
      silentCount: silentEvents.length,
      speechSeconds: (totalSpeechMs / 1000).toFixed(1),
      escalationCount: escalationEvents.length,
    };
  }, [events]);

  // Latency & Pipeline Performance
  const p50 = metrics.p50_latency_s ? `${metrics.p50_latency_s.toFixed(2)}s` : '0.00s';
  const p95 = metrics.p95_latency_s ? `${metrics.p95_latency_s.toFixed(2)}s` : '0.00s';
  const queueDepth = status?.queue_depth ?? 0;
  const maxQueueDepth = metrics.max_queue_depth ?? 0;
  const reconnects = status?.reconnects ?? 0;

  // Comparison matrix data
  const comparisonModels = [
    { name: 'Gemini 2.5 Flash (Active)', inM: '$0.075', outM: '$0.30', isCurrent: model.includes('gemini') },
    { name: 'Claude 3.5 Sonnet', inM: '$3.00', outM: '$15.00', isCurrent: false },
    { name: 'GPT-4o (Vision)', inM: '$2.50', outM: '$10.00', isCurrent: false },
    { name: 'Gemini 1.5 Pro', inM: '$1.25', outM: '$5.00', isCurrent: false },
    { name: 'Ollama qwen2.5vl (Local)', inM: '$0.00 (Self-hosted)', outM: '$0.00', isCurrent: model.includes('ollama') },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Cost Savings Banner */}
      <div className="surface-card p-5 bg-gradient-to-br from-card via-card to-card-subtle relative overflow-hidden">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent-emerald/15 text-accent-emerald">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide uppercase font-display text-ink-main">
                Cost Savings
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/30 font-medium">
              {dropPercent.toFixed(1)}% dropped
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Net Dollar Savings */}
          <div className="p-3.5 rounded-xl bg-card-subtle/90 border border-border-subtle space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs">
              <span>Saved</span>
              <DollarSign className="w-4 h-4 text-accent-emerald" />
            </div>
            <div className="text-2xl font-mono font-bold text-accent-emerald">
              ${savedUsd.toFixed(4)}
            </div>
            <div className="text-[11px] text-ink-faint font-mono">
              ~₹{savedInr.toFixed(2)} INR saved
            </div>
          </div>

          {/* Actual Incurred Cost */}
          <div className="p-3.5 rounded-xl bg-card-subtle/90 border border-border-subtle space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs">
              <span>Billed Cost</span>
              <Zap className="w-4 h-4 text-accent-primary" />
            </div>
            <div className="text-2xl font-mono font-bold text-ink-main">
              ${actualUsd.toFixed(4)}
            </div>
            <div className="text-[11px] text-ink-faint font-mono">
              ~₹{actualInr.toFixed(2)} INR ({tokensTotal.toLocaleString()} tokens)
            </div>
          </div>

          {/* Un-gated Hypothetical Cost */}
          <div className="p-3.5 rounded-xl bg-card-subtle/90 border border-border-subtle space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs">
              <span>Cost without Gating</span>
              <ArrowDownRight className="w-4 h-4 text-accent-rose" />
            </div>
            <div className="text-2xl font-mono font-bold text-accent-rose">
              ${ungatedUsd.toFixed(4)}
            </div>
            <div className="text-[11px] text-ink-faint font-mono">
              ~{ungatedTokens.toLocaleString()} tokens
            </div>
          </div>

          {/* Gate Filter Efficiency */}
          <div className="p-3.5 rounded-xl bg-card-subtle/90 border border-border-subtle space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs">
              <span>Frames Dropped</span>
              <ShieldCheck className="w-4 h-4 text-accent-secondary" />
            </div>
            <div className="text-2xl font-mono font-bold text-accent-secondary">
              {framesDropped.toLocaleString()}
            </div>
            <div className="text-[11px] text-ink-faint font-mono">
              {framesDropped.toLocaleString()} of {framesSeen.toLocaleString()} dropped
            </div>
          </div>
        </div>
      </div>

      {/* 2. Dual Column: SSIM Histogram & Audio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: SSIM Distribution Histogram */}
        <div className="surface-card p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle text-xs">
            <div className="flex items-center gap-1.5 font-medium text-ink-main">
              <BarChart2 className="w-4 h-4 text-accent-primary" />
              <span className="font-display uppercase text-[11px] tracking-wide">
                SSIM Distribution
              </span>
            </div>
            <span className="text-[10px] font-mono text-ink-faint">
              {ssimHistory.length} samples
            </span>
          </div>

          {/* Metric Pills */}
          <div className="grid grid-cols-4 gap-2 text-center font-mono">
            <div className="p-2 rounded-lg bg-card-subtle border border-border-subtle">
              <div className="text-[10px] text-ink-faint">Mean</div>
              <div className="text-xs font-semibold text-accent-primary">
                {ssimStats.mean > 0 ? ssimStats.mean.toFixed(3) : '—'}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-card-subtle border border-border-subtle">
              <div className="text-[10px] text-ink-faint">Min</div>
              <div className="text-xs font-semibold text-accent-rose">
                {ssimStats.min > 0 ? ssimStats.min.toFixed(3) : '—'}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-card-subtle border border-border-subtle">
              <div className="text-[10px] text-ink-faint">Max</div>
              <div className="text-xs font-semibold text-accent-emerald">
                {ssimStats.max > 0 ? ssimStats.max.toFixed(3) : '—'}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-card-subtle border border-border-subtle">
              <div className="text-[10px] text-ink-faint">Std dev</div>
              <div className="text-xs font-semibold text-ink-main">
                {ssimStats.stdDev.toFixed(3)}
              </div>
            </div>
          </div>

          {/* SVG Histogram */}
          <div className="space-y-2 pt-1">
            <div className="text-[11px] text-ink-faint flex items-center justify-between">
              <span>Similarity scores</span>
              <span className="font-mono text-accent-primary">Threshold τ = {tau.toFixed(2)}</span>
            </div>

            <div className="space-y-1.5 font-mono text-xs">
              {[
                { label: '< 0.70', count: ssimStats.buckets[0], color: 'bg-accent-rose' },
                { label: '0.70 - 0.80', count: ssimStats.buckets[1], color: 'bg-accent-warm' },
                { label: '0.80 - 0.88', count: ssimStats.buckets[2], color: 'bg-accent-secondary' },
                { label: '0.88 - 0.92', count: ssimStats.buckets[3], color: 'bg-accent-primary' },
                { label: '0.92 - 0.96', count: ssimStats.buckets[4], color: 'bg-accent-periwinkle' },
                { label: '0.96 - 1.00', count: ssimStats.buckets[5], color: 'bg-accent-emerald' },
              ].map((b, idx) => {
                const total = ssimHistory.length || 1;
                const pct = ((b.count / total) * 100).toFixed(1);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-20 text-[10px] text-ink-faint text-right">{b.label}</span>
                    <div className="flex-1 h-3 rounded-full bg-card-subtle overflow-hidden border border-border-subtle/50">
                      <div
                        className={`h-full rounded-full ${b.color} transition-all duration-600`}
                        style={{ width: `${Math.max(parseFloat(pct), b.count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className="w-16 text-[10px] text-ink-muted text-right">
                      {b.count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Audio & Speech */}
        <div className="surface-card p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle text-xs">
            <div className="flex items-center gap-1.5 font-medium text-ink-main">
              <Volume2 className="w-4 h-4 text-accent-secondary" />
              <span className="font-display uppercase text-[11px] tracking-wide">
                Audio & Speech
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                status?.escalated
                  ? 'bg-accent-warm/15 text-accent-warm border-accent-warm/30'
                  : 'bg-card-subtle text-ink-faint border-border-subtle'
              }`}
            >
              {status?.escalated ? 'Audio escalated' : 'Normal audio'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
              <div className="text-[11px] text-ink-faint">Speech detected</div>
              <div className="text-xl font-mono font-semibold text-accent-secondary">
                {audioStats.speechCount} events
              </div>
              <div className="text-[10px] text-ink-faint font-mono">
                {audioStats.speechSeconds}s voice
              </div>
            </div>

            <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
              <div className="text-[11px] text-ink-faint">Quiet segments</div>
              <div className="text-xl font-mono font-semibold text-ink-main">
                {audioStats.silentCount} runs
              </div>
              <div className="text-[10px] text-ink-faint font-mono">
                Zero tokens
              </div>
            </div>

            <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
              <div className="text-[11px] text-ink-faint">Escalations</div>
              <div className="text-xl font-mono font-semibold text-accent-warm">
                {audioStats.escalationCount}
              </div>
              <div className="text-[10px] text-ink-faint font-mono">
                Lowered threshold
              </div>
            </div>

            <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
              <div className="text-[11px] text-ink-faint">Audio frame</div>
              <div className="text-xl font-mono font-semibold text-accent-primary">
                30 ms
              </div>
              <div className="text-[10px] text-ink-faint font-mono">
                16 kHz mono
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle/60 border border-border-subtle text-xs text-ink-muted">
            Loud audio lowers the gate threshold to catch quick scene changes.
          </div>
        </div>
      </div>

      {/* 3. Latency & Token Usage */}
      <div className="surface-card p-4 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle text-xs">
          <div className="flex items-center gap-1.5 font-medium text-ink-main">
            <Gauge className="w-4 h-4 text-accent-amethyst" />
            <span className="font-display uppercase text-[11px] tracking-wide">
              Latency & Token Usage
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <span className="text-[10px] text-ink-faint">Median (p50)</span>
            <div className="text-lg font-mono font-semibold text-accent-primary">{p50}</div>
            <span className="text-[10px] text-ink-faint font-mono">50th percentile</span>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <span className="text-[10px] text-ink-faint">Tail (p95)</span>
            <div className="text-lg font-mono font-semibold text-accent-amethyst">{p95}</div>
            <span className="text-[10px] text-ink-faint font-mono">95th percentile</span>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <span className="text-[10px] text-ink-faint">Tokens / hour</span>
            <div className="text-lg font-mono font-semibold text-accent-warm">
              {tokensPerHour.toLocaleString()}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <span className="text-[10px] text-ink-faint">Prompt tokens</span>
            <div className="text-lg font-mono font-semibold text-ink-main">
              {tokensIn.toLocaleString()}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <span className="text-[10px] text-ink-faint">Output tokens</span>
            <div className="text-lg font-mono font-semibold text-accent-emerald">
              {tokensOut.toLocaleString()}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <span className="text-[10px] text-ink-faint">Queue backlog</span>
            <div className="text-lg font-mono font-semibold text-ink-main">
              {queueDepth} / {maxQueueDepth}
            </div>
            <span className="text-[10px] text-ink-faint font-mono">Current / peak</span>
          </div>
        </div>
      </div>

      {/* 4. Model Comparison */}
      <div className="surface-card p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle text-xs">
          <div className="flex items-center gap-1.5 font-medium text-ink-main">
            <Layers className="w-4 h-4 text-accent-periwinkle" />
            <span className="font-display uppercase text-[11px] tracking-wide">
              Model Comparison
            </span>
          </div>
          <span className="text-[10px] text-ink-faint">Per 1M tokens</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-border-subtle text-ink-faint text-[10px] uppercase">
                <th className="py-2 px-3">Model</th>
                <th className="py-2 px-3">Input / 1M</th>
                <th className="py-2 px-3">Output / 1M</th>
                <th className="py-2 px-3">Ungated / hr</th>
                <th className="py-2 px-3">Vigil / hr</th>
                <th className="py-2 px-3 text-right">Estimated 30-Day Savings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50 text-ink-muted">
              {comparisonModels.map((m, i) => (
                <tr
                  key={i}
                  className={`hover:bg-card-hover transition-colors ${
                    m.isCurrent ? 'bg-accent-primary-subtle/50 font-semibold text-ink-main' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 flex items-center gap-2">
                    {m.isCurrent && <span className="w-2 h-2 rounded-full bg-accent-primary" />}
                    <span>{m.name}</span>
                  </td>
                  <td className="py-2.5 px-3">{m.inM}</td>
                  <td className="py-2.5 px-3">{m.outM}</td>
                  <td className="py-2.5 px-3 text-accent-rose">
                    {m.name.includes('Local') ? '$0.00' : '$1.80 - $4.50'}
                  </td>
                  <td className="py-2.5 px-3 text-accent-emerald">
                    {m.name.includes('Local') ? '$0.00' : '$0.12 - $0.35'}
                  </td>
                  <td className="py-2.5 px-3 text-right text-accent-emerald font-semibold">
                    {m.name.includes('Local') ? 'Self-hosted' : '~$850.00 / mo (~₹73,000)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
