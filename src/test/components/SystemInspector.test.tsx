import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SystemInspector } from '../../components/SystemInspector';
import { PipelineStatus, FormattedEvent } from '../../types';

describe('SystemInspector Component', () => {
  const mockStatus: PipelineStatus = {
    running: true,
    provider: 'gemini-2.5-flash',
    frames_captured: 1200,
    reconnects: 1,
    queue_depth: 2,
    gate: {
      frames_seen: 1200,
      frames_kept: 60,
      frames_dropped: 1140,
      frame_retention: 0.05,
    },
    metrics: {
      max_queue_depth: 5,
    },
    memory: {
      bounded: true,
      mode: 'bounded',
      compactions: 3,
    },
  };

  const mockEvents: FormattedEvent[] = [
    {
      id: 'c1',
      rawEvent: {
        type: 'memory_compacted',
        compaction_number: 1,
        events_folded: 10,
        summary_chars: 280,
      },
      type: 'memory_compacted',
      tag: 'MEMORY',
      category: 'system',
      timestamp: '00:15',
      rawT: 15.0,
      cost: 'billed',
      title: 'Memory Compacted',
      body: '10 events folded into summary',
    },
  ];

  it('renders pipeline diagnostic overview and active provider', () => {
    render(<SystemInspector status={mockStatus} events={mockEvents} />);

    expect(screen.getByText(/System Status/i)).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText(/gemini-2.5-flash/i)).toBeInTheDocument();
  });

  it('renders bounded memory architecture details and compaction ledger', () => {
    render(<SystemInspector status={mockStatus} events={mockEvents} />);

    expect(screen.getByText(/Memory Compaction/i)).toBeInTheDocument();
    expect(screen.getByText('Anchor prompt')).toBeInTheDocument();
    expect(screen.getByText('Recent events')).toBeInTheDocument();
    expect(screen.getByText('Compaction')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('10 events')).toBeInTheDocument();
  });

  it('renders computer vision gating specs (64x64, Gaussian kernel)', () => {
    render(<SystemInspector status={mockStatus} events={mockEvents} />);

    expect(screen.getByText(/SSIM Gating Settings/i)).toBeInTheDocument();
    expect(screen.getByText('64 × 64 grayscale')).toBeInTheDocument();
    expect(screen.getByText('11 × 11 patch (σ=1.5)')).toBeInTheDocument();
    expect(screen.getByText('1e-7')).toBeInTheDocument();
  });
});
