import React, { useState } from 'react';
import {
  FileText,
  Search,
  Download,
  Filter,
  Check,
  Copy,
  X,
  Code2,
  DollarSign,
  Sparkles,
  Layers,
} from 'lucide-react';
import { FormattedEvent, EventCategory } from '../types';

interface EventAuditExplorerProps {
  events: FormattedEvent[];
  countFree: number;
  countBilled: number;
  freeRatio: string;
}

export const EventAuditExplorer: React.FC<EventAuditExplorerProps> = ({
  events,
  countFree,
  countBilled,
  freeRatio,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [costFilter, setCostFilter] = useState<'all' | 'free' | 'billed'>('all');
  const [selectedEvent, setSelectedEvent] = useState<FormattedEvent | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = events.filter((e) => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (costFilter !== 'all' && e.cost !== costFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.body.toLowerCase().includes(q) ||
      e.tag.toLowerCase().includes(q) ||
      e.timestamp.includes(q) ||
      JSON.stringify(e.rawEvent).toLowerCase().includes(q)
    );
  });

  const exportJson = () => {
    const data = filtered.map((e) => e.rawEvent);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vigil-event-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const headers = ['id', 'timestamp', 'type', 'category', 'cost', 'tag', 'body'];
    const rows = filtered.map((e) => [
      `"${e.id}"`,
      `"${e.timestamp}"`,
      `"${e.type}"`,
      `"${e.category}"`,
      `"${e.cost}"`,
      `"${e.tag}"`,
      `"${e.body.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vigil-event-audit-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyRawJson = () => {
    if (!selectedEvent) return;
    navigator.clipboard.writeText(JSON.stringify(selectedEvent.rawEvent, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header & Controls */}
      <div className="surface-card p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent-primary-subtle text-accent-primary">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide uppercase font-display text-ink-main">
                Event Audit
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={exportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-card-subtle hover:bg-card-hover text-xs font-mono text-ink-muted hover:text-ink-main transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON ({filtered.length})</span>
            </button>

            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-card-subtle hover:bg-card-hover text-xs font-mono text-ink-muted hover:text-ink-main transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Counter Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <div className="text-[10px] text-ink-faint">Total Events</div>
            <div className="text-lg font-mono font-semibold text-ink-main">
              {events.length.toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <div className="text-[10px] text-ink-faint">Free Events</div>
            <div className="text-lg font-mono font-semibold text-accent-emerald">
              {countFree.toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <div className="text-[10px] text-ink-faint">Billed Events</div>
            <div className="text-lg font-mono font-semibold text-accent-primary">
              {countBilled.toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-card-subtle border border-border-subtle space-y-0.5">
            <div className="text-[10px] text-ink-faint">Free Ratio</div>
            <div className="text-lg font-mono font-semibold text-accent-secondary">
              {freeRatio}
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              placeholder="Search event body, tag, or type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-subtle bg-card-subtle text-xs text-ink-main placeholder:text-ink-faint focus:outline-none focus:border-border-hover font-mono"
            />
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(['all', 'llm', 'gate', 'audio', 'system'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider transition-all duration-300 font-mono ${
                  categoryFilter === cat
                    ? 'bg-accent-primary text-canvas font-semibold shadow-sm'
                    : 'bg-card-subtle text-ink-faint hover:text-ink-muted border border-border-subtle'
                }`}
              >
                {cat}
              </button>
            ))}

            {/* Cost Filter */}
            <select
              value={costFilter}
              onChange={(e) => setCostFilter(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-card-subtle text-xs text-ink-main font-mono focus:outline-none"
            >
              <option value="all">Cost: All</option>
              <option value="free">Cost: Free Only</option>
              <option value="billed">Cost: Billed Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Audit Table */}
      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-card-subtle/80 text-ink-faint text-[10px] uppercase border-b border-border-subtle">
              <tr>
                <th className="py-2.5 px-4">Time</th>
                <th className="py-2.5 px-3">Cost</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Tag</th>
                <th className="py-2.5 px-4">Message</th>
                <th className="py-2.5 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50 text-ink-muted">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-faint">
                    No matching events found.
                  </td>
                </tr>
              ) : (
                filtered.map((ev) => (
                  <tr
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="hover:bg-card-hover transition-colors cursor-pointer group"
                  >
                    <td className="py-2.5 px-4 text-ink-faint whitespace-nowrap">
                      {ev.timestamp}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                          ev.cost === 'billed'
                            ? 'bg-accent-primary-subtle text-accent-primary border-accent-primary/30'
                            : 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                        }`}
                      >
                        {ev.cost}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 uppercase text-ink-faint whitespace-nowrap">
                      {ev.category}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-ink-main whitespace-nowrap">
                      {ev.tag}
                    </td>
                    <td className="py-2.5 px-4 font-sans text-xs text-ink-muted leading-relaxed max-w-md truncate">
                      {ev.body}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(ev);
                        }}
                        className="px-2 py-1 rounded text-[10px] font-mono bg-card-subtle group-hover:bg-accent-primary group-hover:text-canvas border border-border-subtle transition-all"
                      >
                        View JSON
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Raw Event JSON Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl surface-card p-5 space-y-4 shadow-2xl border-border-hover max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-accent-primary" />
                <span className="font-display font-semibold text-sm text-ink-main">
                  Raw Event Inspector: {selectedEvent.tag} ({selectedEvent.timestamp})
                </span>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 rounded-lg text-ink-faint hover:text-ink-main hover:bg-card-subtle transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-ink-faint">
              <span>Event ID: {selectedEvent.id}</span>
              <button
                onClick={copyRawJson}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-card-subtle hover:bg-card-hover border border-border-subtle text-ink-muted hover:text-ink-main transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-accent-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Payload'}</span>
              </button>
            </div>

            <pre className="flex-1 overflow-y-auto p-4 rounded-xl bg-card-subtle/80 border border-border-subtle text-xs font-mono text-ink-main select-all leading-relaxed whitespace-pre-wrap">
              {JSON.stringify(selectedEvent.rawEvent, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
