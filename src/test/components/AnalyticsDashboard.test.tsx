import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AnalyticsDashboard } from '../../components/AnalyticsDashboard';
import { PipelineStatus, FormattedEvent } from '../../types';

describe('AnalyticsDashboard Component', () => {
  const mockStatus: PipelineStatus = {
    running: true,
    provider: 'gemini-4-hydrogen',
    tau: 0.92,
    gate: {
      frames_seen: 1000,
      frames_kept: 50,
      frames_dropped: 950,
      frame_retention: 0.05,
    },
    metrics: {
      tokens_in: 8500,
      tokens_out: 1500,
      tokens_total: 10000,
      tokens_per_hour: 36000,
      p50_latency_s: 0.45,
      p95_latency_s: 1.25,
      max_queue_depth: 3,
    },
    memory: {
      bounded: true,
      mode: 'bounded',
      compactions: 2,
    },
  };

  const mockEvents: FormattedEvent[] = [
    {
      id: '1',
      rawEvent: { type: 'audio_speech', duration_ms: 2400 },
      type: 'audio_speech',
      tag: 'HEARD',
      category: 'audio',
      timestamp: '00:05',
      rawT: 5.0,
      cost: 'free',
      title: 'Speech Detected',
      body: 'Speech segment detected (2400ms)',
    },
    {
      id: '2',
      rawEvent: { type: 'audio_escalated' },
      type: 'audio_escalated',
      tag: 'ESCALATED',
      category: 'audio',
      timestamp: '00:08',
      rawT: 8.0,
      cost: 'free',
      title: 'Audio Escalation',
      body: 'SSIM threshold relaxed',
    },
  ];

  const mockSsimHistory = [
    { ssim: 0.95, kept: false },
    { ssim: 0.93, kept: false },
    { ssim: 0.85, kept: true },
    { ssim: 0.72, kept: true },
    { ssim: 0.98, kept: false },
  ];

  it('renders cost savings with avoided cost calculation', () => {
    render(
      <AnalyticsDashboard
        status={mockStatus}
        events={mockEvents}
        ssimHistory={mockSsimHistory}
        tau={0.92}
      />
    );

    expect(screen.getByText(/Cost Savings/i)).toBeInTheDocument();
    expect(screen.getByText('95.0% dropped')).toBeInTheDocument();
    expect(screen.getByText('950')).toBeInTheDocument(); // redundant frames dropped
  });

  it('renders SSIM distribution histogram and metric statistics', () => {
    render(
      <AnalyticsDashboard
        status={mockStatus}
        events={mockEvents}
        ssimHistory={mockSsimHistory}
        tau={0.92}
      />
    );

    expect(screen.getByText(/SSIM Distribution/i)).toBeInTheDocument();
    expect(screen.getByText('5 samples')).toBeInTheDocument();
    expect(screen.getByText('0.720')).toBeInTheDocument(); // min SSIM
    expect(screen.getByText('0.980')).toBeInTheDocument(); // max SSIM
  });

  it('renders audio and speech duration stats', () => {
    render(
      <AnalyticsDashboard
        status={mockStatus}
        events={mockEvents}
        ssimHistory={mockSsimHistory}
        tau={0.92}
      />
    );

    expect(screen.getByText(/Audio & Speech/i)).toBeInTheDocument();
    expect(screen.getByText('1 events')).toBeInTheDocument(); // 1 speech event
    expect(screen.getByText('2.4s voice')).toBeInTheDocument();
  });

  it('renders cross-model financial comparison matrix', () => {
    render(
      <AnalyticsDashboard
        status={mockStatus}
        events={mockEvents}
        ssimHistory={mockSsimHistory}
        tau={0.92}
      />
    );

    expect(screen.getByText(/Model Comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/Claude 3.5 Sonnet/i)).toBeInTheDocument();
    expect(screen.getByText(/GPT-4o \(Vision\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Ollama qwen2.5vl \(Local\)/i)).toBeInTheDocument();
  });
});
