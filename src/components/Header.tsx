import React, { useState, useEffect } from 'react';
import { Eye, Radio, BarChart3, Cpu, FileText } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { PipelineStatus, ActiveTab } from '../types';

interface HeaderProps {
  status: PipelineStatus | null;
  wsConnected: boolean;
  activeTab?: ActiveTab;
  setActiveTab?: (tab: ActiveTab) => void;
  eventCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  wsConnected,
  activeTab = 'monitor',
  setActiveTab = () => {},
  eventCount = 0,
}) => {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setClock(now.toTimeString().split(' ')[0]);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const isRunning = !!status?.running;
  const isEscalated = !!status?.escalated;

  let statusText = 'IDLE';
  let statusTone: 'idle' | 'live' | 'escalated' = 'idle';

  if (!wsConnected) {
    statusText = 'CONNECTING...';
  } else if (isRunning) {
    if (isEscalated) {
      statusText = 'ESCALATED';
      statusTone = 'escalated';
    } else {
      statusText = 'LIVE';
      statusTone = 'live';
    }
  }

  const navItems: Array<{ id: ActiveTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'monitor', label: 'Monitor', icon: Radio },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'system', label: 'System', icon: Cpu },
    { id: 'audit', label: 'Audit', icon: FileText },
  ];

  return (
    <header className="border-b border-border-subtle bg-card/70 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 py-2.5 transition-colors duration-600">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-4 flex-wrap lg:flex-nowrap">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-card-subtle border border-border-subtle text-accent-primary shadow-inner">
            <Eye className="w-5 h-5 stroke-[1.8]" />
            <span className="absolute -inset-0.5 rounded-xl bg-accent-primary/10 blur-sm -z-10" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-wide text-ink-main uppercase font-display">
                Vigil <span className="font-light text-ink-muted">Intelligence</span>
              </h1>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-primary-subtle text-accent-primary font-mono font-medium">
                v0.1.0
              </span>
            </div>
          </div>
        </div>

        {/* Center: Multi-Page Navigation Tabs */}
        <nav className="order-3 lg:order-2 flex items-center gap-1 p-1 rounded-xl bg-card-subtle/80 border border-border-subtle mx-auto lg:mx-0 overflow-x-auto max-w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 font-sans whitespace-nowrap ${
                  active
                    ? 'bg-accent-primary text-canvas font-semibold shadow-sm scale-[1.02]'
                    : 'text-ink-muted hover:text-ink-main hover:bg-card/60'
                }`}
                title={`Switch to ${item.label}`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-canvas' : 'text-accent-primary'}`} />
                <span>{item.label}</span>
                {item.id === 'audit' && eventCount > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      active ? 'bg-canvas/20 text-canvas' : 'bg-card border border-border-subtle text-ink-faint'
                    }`}
                  >
                    {eventCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Controls & Status */}
        <div className="order-2 lg:order-3 flex items-center gap-2 sm:gap-3">
          {/* Status Pill */}
          <div
            id="statusPill"
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs font-mono font-medium transition-all duration-600 ${
              statusTone === 'live'
                ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald'
                : statusTone === 'escalated'
                ? 'bg-accent-warm/15 border-accent-warm/40 text-accent-warm'
                : 'bg-card-subtle border-border-subtle text-ink-muted'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {isRunning && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                    statusTone === 'escalated' ? 'bg-accent-warm' : 'bg-accent-emerald'
                  }`}
                />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  statusTone === 'live'
                    ? 'bg-accent-emerald'
                    : statusTone === 'escalated'
                    ? 'bg-accent-warm'
                    : 'bg-ink-faint'
                }`}
              />
            </span>
            <span id="statusText" className="text-[11px] tracking-wide">
              {statusText}
            </span>
          </div>

          {/* Clock */}
          <div
            id="clock"
            className="hidden xl:flex items-center px-2.5 py-1.5 rounded-lg border border-border-subtle bg-card-subtle text-[11px] font-mono text-ink-faint tracking-wider"
          >
            {clock}
          </div>

          {/* Light / Dark Mode Toggle */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
