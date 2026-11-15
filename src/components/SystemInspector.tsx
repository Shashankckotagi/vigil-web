import React from 'react';
import {
  Cpu,
  HardDrive,
  Radio,
  Server,
  Layers,
  Clock,
  CheckCircle,
  AlertCircle,
  FileCode,
  Shield,
  Activity,
  Zap,
} from 'lucide-react';
import { PipelineStatus, FormattedEvent } from '../types';

interface SystemInspectorProps {
  status: PipelineStatus | null;
  events: FormattedEvent[];
}

export const SystemInspector: React.FC<SystemInspectorProps> = ({ status, events }) => {
  const mem = status?.memory || {};
  const gate = status?.gate || {};
  const metrics = status?.metrics || {};

  const isRunning = !!status?.running;
  const memMode = mem.mode ? mem.mode.toUpperCase() : mem.bounded === false ? 'APPEND-ONLY' : 'BOUNDED SUMMARY';
  const compactionsCount = mem.compactions || 0;
  const framesCaptured = status?.frames_captured || gate.frames_seen || 0;
  const reconnects = status?.reconnects || 0;
  const queueDepth = status?.queue_depth ?? 0;
  const maxQueueDepth = metrics.max_queue_depth ?? 0;

  // Filter compaction events for the ledger
  const compactionEvents = events.filter((e) => e.type === 'memory_compacted' || e.tag === 'MEMORY');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header Overview */}
      <div className="surface-card p-5 bg-gradient-to-br from-card via-card to-card-subtle">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent-periwinkle/15 text-accent-periwinkle">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide uppercase font-display text-ink-main">
                System Status
              </h2>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono border font-medium ${
              isRunning
                ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                : 'bg-card-subtle text-ink-muted border-border-subtle'
            }`}
          >
            {isRunning ? 'ACTIVE' : 'STANDBY'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs">
              <span>Model</span>
              <Server className="w-4 h-4 text-accent-primary" />
            </div>
            <div className="text-lg font-mono font-semibold text-ink-main uppercase">
              {status?.provider || 'gemini-2.5-flash'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs">
              <span>Memory Strategy</span>
              <HardDrive className="w-4 h-4 text-accent-amethyst" />
            </div>
            <div className="text-lg font-mono font-semibold text-accent-amethyst">
              {memMode}
            </div>
            <div className="text-[10px] text-ink-faint font-mono">
              {compactionsCount} compactions
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs">
              <span>Queue Depth</span>
              <Layers className="w-4 h-4 text-accent-warm" />
            </div>
            <div className="text-lg font-mono font-semibold text-ink-main">
              {queueDepth} <span className="text-xs text-ink-faint font-normal">/ {maxQueueDepth} peak</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs">
              <span>Reconnects</span>
              <Radio className="w-4 h-4 text-accent-secondary" />
            </div>
            <div className="text-lg font-mono font-semibold text-accent-secondary">
              {reconnects}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Bounded Memory Architecture & Compaction Ledger */}
      <div className="surface-card p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle text-xs">
          <div className="flex items-center gap-1.5 font-medium text-ink-main">
            <HardDrive className="w-4 h-4 text-accent-amethyst" />
            <span className="font-display uppercase text-[11px] tracking-wide">
              Memory Compaction
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <span className="text-[10px] text-ink-faint uppercase font-mono">Anchor prompt</span>
            <p className="text-xs text-ink-muted leading-relaxed">
              Base instructions kept in every prompt.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <span className="text-[10px] text-ink-faint uppercase font-mono">Recent events</span>
            <p className="text-xs text-ink-muted leading-relaxed">
              Keeps the last 10 events for recent context.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <span className="text-[10px] text-ink-faint uppercase font-mono">Compaction</span>
            <p className="text-xs text-ink-muted leading-relaxed">
              Summarizes older events when the window fills.
            </p>
          </div>
        </div>

        {/* Compaction History Table */}
        <div className="space-y-2 pt-2">
          <span className="text-xs font-semibold text-ink-main flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-accent-primary" />
            Compaction Log ({compactionEvents.length})
          </span>

          {compactionEvents.length === 0 ? (
            <div className="p-4 rounded-xl bg-card-subtle/50 border border-border-subtle text-center text-xs text-ink-faint">
              No compactions yet.
            </div>
          ) : (
            <div className="overflow-x-auto border border-border-subtle rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-card-subtle text-ink-faint text-[10px] uppercase border-b border-border-subtle">
                  <tr>
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Time</th>
                    <th className="py-2 px-3">Folded</th>
                    <th className="py-2 px-3">Summary Size</th>
                    <th className="py-2 px-3">Tokens Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50 text-ink-muted">
                  {compactionEvents.map((ce, i) => (
                    <tr key={i} className="hover:bg-card-hover transition-colors">
                      <td className="py-2 px-3 text-accent-amethyst font-semibold">
                        #{ce.rawEvent?.compaction_number ?? i + 1}
                      </td>
                      <td className="py-2 px-3">{ce.timestamp}</td>
                      <td className="py-2 px-3 text-accent-primary">
                        {ce.rawEvent?.events_folded ?? 10} events
                      </td>
                      <td className="py-2 px-3">
                        {ce.rawEvent?.summary_chars ?? 240} chars
                      </td>
                      <td className="py-2 px-3 text-accent-emerald">
                        ~{((ce.rawEvent?.events_folded ?? 10) * 85).toLocaleString()} tokens
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 3. Computer Vision Gating Specifications */}
      <div className="surface-card p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle text-xs">
          <div className="flex items-center gap-1.5 font-medium text-ink-main">
            <Shield className="w-4 h-4 text-accent-primary" />
            <span className="font-display uppercase text-[11px] tracking-wide">
              SSIM Gating Settings
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <span className="text-[10px] text-ink-faint">Resolution</span>
            <div className="font-semibold text-accent-primary">64 × 64 grayscale</div>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <span className="text-[10px] text-ink-faint">Filter window</span>
            <div className="font-semibold text-accent-secondary">11 × 11 patch (σ=1.5)</div>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <span className="text-[10px] text-ink-faint">Constants</span>
            <div className="font-semibold text-accent-warm">C1=6.5, C2=58.5</div>
          </div>

          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-1">
            <span className="text-[10px] text-ink-faint">Variance floor</span>
            <div className="font-semibold text-accent-emerald">1e-7</div>
          </div>
        </div>
      </div>
    </div>
  );
};
