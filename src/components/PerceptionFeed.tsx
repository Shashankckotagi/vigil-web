import React, { useState, useRef, useEffect } from 'react';
import {
  ListFilter,
  Search,
  ArrowDownCircle,
  Trash2,
  Download,
  FileJson,
  FileSpreadsheet,
  Clock,
  Sparkles,
} from 'lucide-react';
import { FormattedEvent, EventCategory } from '../types';

interface PerceptionFeedProps {
  events: FormattedEvent[];
  countFree?: number;
  countBilled?: number;
  freeRatio?: string;
  onClear?: () => void;
}

export const PerceptionFeed: React.FC<PerceptionFeedProps> = ({
  events = [],
  countFree = 0,
  countBilled = 0,
  freeRatio = '0.0',
  onClear = () => {},
}) => {
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const feedListRef = useRef<HTMLUListElement>(null);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && feedListRef.current) {
      feedListRef.current.scrollTop = feedListRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Handle user manual scroll
  const handleScroll = () => {
    if (!feedListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedListRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 25;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  };

  const filteredEvents = events.filter((ev) => {
    const matchCat = filter === 'all' || ev.category === filter;
    if (!matchCat) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      ev.title.toLowerCase().includes(q) ||
      ev.body.toLowerCase().includes(q) ||
      ev.tag.toLowerCase().includes(q) ||
      ev.timestamp.includes(q)
    );
  });

  const exportJson = () => {
    const data = events.map((e) => e.rawEvent);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vigil-events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const headers = ['timestamp', 'type', 'category', 'cost', 'tag', 'message'];
    const rows = events.map((e) => [
      `"${e.timestamp}"`,
      `"${e.type}"`,
      `"${e.category}"`,
      `"${e.cost}"`,
      `"${e.tag}"`,
      `"${e.body.replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vigil-events-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getTagStyle = (tag: string, cat: EventCategory) => {
    switch (tag) {
      case 'LLM':
        return 'bg-accent-primary-subtle text-accent-primary border-accent-primary/30';
      case 'KEPT':
        return 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30';
      case 'DROPPED':
        return 'bg-accent-rose/15 text-accent-rose border-accent-rose/30';
      case 'HEARD':
        return 'bg-accent-secondary/15 text-accent-secondary border-accent-secondary/30';
      case 'SILENT':
        return 'bg-card-subtle text-ink-faint border-border-subtle';
      case 'ESCALATED':
        return 'bg-accent-warm/15 text-accent-warm border-accent-warm/40';
      case 'QUEUED':
      case 'MEMORY':
        return 'bg-accent-amethyst/15 text-accent-amethyst border-accent-amethyst/30';
      case 'WAITED':
      case 'THROTTLED':
        return 'bg-accent-warm/15 text-accent-warm border-accent-warm/30';
      case 'ERROR':
        return 'bg-accent-rose/20 text-accent-rose border-accent-rose/40 font-semibold';
      default:
        return 'bg-card-subtle text-ink-muted border-border-subtle';
    }
  };

  return (
    <div className="surface-card p-4 flex flex-col h-full min-h-[520px]">
      {/* Header & Controls */}
      <div className="space-y-3 pb-3 border-b border-border-subtle">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 font-medium text-ink-main text-xs">
            <ListFilter className="w-3.5 h-3.5 text-accent-primary" />
            <span className="font-display uppercase text-[11px] tracking-wide">
              Perception Feed
            </span>
            <span className="text-[10px] font-mono text-ink-faint px-1.5 py-0.2 rounded bg-card-subtle border border-border-subtle">
              {filteredEvents.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              id="btnAutoScroll"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-all duration-400 ${
                autoScroll
                  ? 'bg-accent-primary-subtle text-accent-primary border-accent-primary/30'
                  : 'bg-card-subtle text-ink-faint border-border-subtle hover:text-ink-muted'
              }`}
              title="Toggle auto-scroll"
            >
              <ArrowDownCircle className="w-3 h-3" />
              <span>Auto-Scroll</span>
            </button>

            <button
              id="btnClearTimeline"
              onClick={onClear}
              className="p-1 rounded text-ink-faint hover:text-accent-rose hover:bg-card-subtle border border-transparent hover:border-border-subtle transition-all duration-400"
              title="Clear event feed"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              id="btnExportJson"
              onClick={exportJson}
              className="px-2 py-1 rounded text-[10px] font-mono bg-card-subtle hover:bg-card-hover border border-border-subtle text-ink-muted hover:text-ink-main transition-all duration-400"
              title="Export JSON"
            >
              JSON
            </button>

            <button
              id="btnExportCsv"
              onClick={exportCsv}
              className="px-2 py-1 rounded text-[10px] font-mono bg-card-subtle hover:bg-card-hover border border-border-subtle text-ink-muted hover:text-ink-main transition-all duration-400"
              title="Export CSV"
            >
              CSV
            </button>
          </div>
        </div>

        {/* Live Counters Strip */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-card-subtle border border-border-subtle text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-emerald" />
            <span className="text-ink-faint">Free:</span>
            <span id="cntFree" className="text-accent-emerald font-semibold">
              {countFree.toLocaleString()}
            </span>
          </div>

          <div className="text-ink-faint">/</div>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-primary" />
            <span className="text-ink-faint">Billed:</span>
            <span id="cntBilled" className="text-accent-primary font-semibold">
              {countBilled.toLocaleString()}
            </span>
          </div>

          <div className="text-ink-faint">•</div>

          <div className="flex items-center gap-1">
            <span className="text-ink-faint">Free Ratio:</span>
            <span id="cntRatio" className="text-ink-main font-semibold">
              {freeRatio}
            </span>
          </div>
        </div>

        {/* Filter Chips & Search Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              id="filterInput"
              type="text"
              placeholder="Filter events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 rounded-md border border-border-subtle bg-card-subtle text-xs text-ink-main placeholder:text-ink-faint focus:outline-none focus:border-border-hover font-mono"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-0.5" id="filterChips">
            {(['all', 'llm', 'gate', 'audio', 'system'] as const).map((c) => {
              const active = filter === c;
              return (
                <button
                  key={c}
                  data-filter={c}
                  onClick={() => setFilter(c)}
                  className={`chip px-2.5 py-1 rounded text-[11px] font-medium uppercase tracking-wider transition-all duration-400 ${
                    active
                      ? 'active bg-accent-primary-subtle text-accent-primary border border-accent-primary/30'
                      : 'bg-card-subtle text-ink-faint hover:text-ink-muted border border-border-subtle'
                  }`}
                >
                  {c === 'llm' ? 'LLM only' : c}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Feed List */}
      <ul
        id="timelineFeed"
        ref={feedListRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto mt-3 pr-1 space-y-2 select-text font-mono text-xs max-h-[580px]"
      >
        {filteredEvents.length === 0 ? (
          <li
            id="emptyPlaceholder"
            className="timeline-empty flex flex-col items-center justify-center p-8 text-center text-ink-faint gap-2 h-full"
          >
            <Sparkles className="w-6 h-6 stroke-[1.4] text-ink-faint/50" />
            <span className="text-xs">
              {searchQuery || filter !== 'all'
                ? 'No matching events found.'
                : 'Awaiting video stream analysis...'}
            </span>
          </li>
        ) : (
          filteredEvents.map((ev) => (
            <li
              key={ev.id}
              data-category={ev.category}
              data-text={`${ev.timestamp} ${ev.tag} ${ev.body}`.toLowerCase()}
              className={`feed-row p-2.5 rounded-lg border transition-all duration-500 hover:border-border-hover ${
                ev.cost === 'billed'
                  ? 'row-billed bg-card-subtle/70 border-accent-primary/20'
                  : 'row-free bg-card-subtle/30 border-border-subtle/60'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="row-time text-[10px] text-ink-faint pt-0.5 whitespace-nowrap">
                  {ev.timestamp}
                </span>

                <span
                  className={`row-tag px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border whitespace-nowrap ${getTagStyle(
                    ev.tag,
                    ev.category
                  )}`}
                >
                  {ev.tag}
                </span>

                <div className="row-body flex-1 text-ink-muted text-xs leading-relaxed font-sans">
                  <span>{ev.body}</span>

                  {ev.badges && ev.badges.length > 0 && (
                    <div className="inline-flex items-center gap-1.5 ml-2">
                      {ev.badges.map((b, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-card border border-border-subtle text-ink-faint"
                        >
                          {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
};
