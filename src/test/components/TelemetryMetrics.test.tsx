import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TelemetryMetrics } from '../../components/TelemetryMetrics';

describe('TelemetryMetrics Component', () => {
  const mockPricing = {
    'gemini-2.5-flash': { input_per_million: 0.075, output_per_million: 0.3 },
    usd_to_inr: 86.0,
  };

  it('renders all metric card IDs correctly when idle', () => {
    render(<TelemetryMetrics status={null} pricing={mockPricing} />);

    expect(document.getElementById('statKept')).toHaveTextContent('0');
    expect(document.getElementById('statDropped')).toHaveTextContent('0');
    expect(document.getElementById('statTokens')).toHaveTextContent('0');
    expect(document.getElementById('statLatency')).toHaveTextContent('—');
    expect(document.getElementById('statSource')).toHaveTextContent('IDLE');
    expect(document.getElementById('statMemory')).toHaveTextContent('BOUNDED');
  });

  it('displays accurate frame telemetry and retention percentage', () => {
    const status = {
      gate: {
        frames_kept: 1250,
        frames_seen: 5000,
        frames_dropped: 3750,
        frame_retention: 0.25,
      },
    };

    render(<TelemetryMetrics status={status} pricing={mockPricing} />);

    expect(document.getElementById('statKept')).toHaveTextContent('1,250');
    expect(document.getElementById('statKeptSub')).toHaveTextContent('5,000 seen');
    expect(document.getElementById('statDropped')).toHaveTextContent('3,750');
    expect(document.getElementById('statRetention')).toHaveTextContent('25.0% retention');
  });

  it('calculates token rate, USD cost and INR cost conversion', () => {
    const status = {
      provider: 'gemini-2.5-flash',
      metrics: {
        tokens_total: 1_000_000,
        tokens_in: 850_000,
        tokens_out: 150_000,
        tokens_per_hour: 120_000,
      },
    };

    render(<TelemetryMetrics status={status} pricing={mockPricing} />);

    expect(document.getElementById('statTokens')).toHaveTextContent('1,000,000');
    const rateEl = document.getElementById('statTokensRate');
    expect(rateEl).toHaveTextContent('120,000 tok/hr');
    // 850k * 0.075/1M + 150k * 0.3/1M = 0.06375 + 0.045 = 0.10875 USD (~ ₹9.35)
    expect(rateEl?.textContent).toContain('$');
    expect(rateEl?.textContent).toContain('₹');
  });

  it('displays latency percentiles p50 and p95', () => {
    const status = {
      metrics: {
        p50_latency_s: 0.85,
        p95_latency_s: 1.42,
      },
    };

    render(<TelemetryMetrics status={status} pricing={mockPricing} />);

    expect(document.getElementById('statLatency')).toHaveTextContent('1.42s');
    expect(document.getElementById('statLatencySub')).toHaveTextContent('p50: 0.85s | p95: 1.42s');
  });

  it('truncates long active stream URLs gracefully', () => {
    const longUrl = 'https://stream.provider.com/live/hls/channel-999-secure-feed.m3u8';
    const status = {
      url: longUrl,
      reconnects: 3,
    };

    render(<TelemetryMetrics status={status} pricing={mockPricing} />);

    const sourceEl = document.getElementById('statSource');
    expect(sourceEl?.textContent).toContain('...');
    expect(sourceEl?.title).toBe(longUrl);
    expect(document.getElementById('statReconnects')).toHaveTextContent('3 reconnects');
  });

  it('renders memory compaction mode and queue depth', () => {
    const status = {
      memory: {
        mode: 'bounded',
        compactions: 7,
      },
      queue_depth: 4,
    };

    render(<TelemetryMetrics status={status} pricing={mockPricing} />);

    expect(document.getElementById('statMemory')).toHaveTextContent('BOUNDED');
    expect(document.getElementById('statCompaction')).toHaveTextContent('7 compactions • q: 4');
  });
});
