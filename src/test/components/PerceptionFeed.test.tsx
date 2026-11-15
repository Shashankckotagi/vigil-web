import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PerceptionFeed } from '../../components/PerceptionFeed';
import { FormattedEvent } from '../../types';

describe('PerceptionFeed Component', () => {
  const sampleEvents: FormattedEvent[] = [
    {
      id: '1',
      rawEvent: { type: 'description', text: 'Silver car makes a left turn', cost: 'billed' },
      type: 'description',
      tag: 'LLM',
      category: 'llm',
      timestamp: '00:15',
      rawT: 15,
      cost: 'billed',
      title: 'LLM Scene Description',
      body: 'Silver car makes a left turn',
      badges: [{ label: '142 tok' }, { label: '0.85s' }],
    },
    {
      id: '2',
      rawEvent: { type: 'frame_kept', ssim: 0.88, tau: 0.92, cost: 'free' },
      type: 'frame_kept',
      tag: 'KEPT',
      category: 'gate',
      timestamp: '00:16',
      rawT: 16,
      cost: 'free',
      title: 'Frame Passed Gating',
      body: 'frame passed — SSIM 0.88 below τ 0.92',
    },
    {
      id: '3',
      rawEvent: { type: 'audio_speech', duration_ms: 1800, peak_rms: 0.12, cost: 'free' },
      type: 'audio_speech',
      tag: 'HEARD',
      category: 'audio',
      timestamp: '00:18',
      rawT: 18,
      cost: 'free',
      title: 'Speech Detected',
      body: 'speech detected, 1.8s duration, peak 0.12 RMS',
    },
    {
      id: '4',
      rawEvent: { type: 'memory_compacted', events_folded: 8, cost: 'free' },
      type: 'memory_compacted',
      tag: 'MEMORY',
      category: 'system',
      timestamp: '00:22',
      rawT: 22,
      cost: 'free',
      title: 'Memory Compacted',
      body: 'context memory compacted — 8 events folded',
    },
  ];

  it('renders placeholder when feed is empty', () => {
    render(
      <PerceptionFeed
        events={[]}
        countFree={0}
        countBilled={0}
        freeRatio="100%"
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText(/Awaiting video stream analysis/i)).toBeInTheDocument();
  });

  it('renders events with correct tags, badges, and timestamps', () => {
    render(
      <PerceptionFeed
        events={sampleEvents}
        countFree={3}
        countBilled={1}
        freeRatio="75.0%"
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText('Silver car makes a left turn')).toBeInTheDocument();
    expect(screen.getByText('LLM')).toBeInTheDocument();
    expect(screen.getByText('142 tok')).toBeInTheDocument();
    expect(screen.getByText('0.85s')).toBeInTheDocument();

    expect(screen.getByText(/frame passed — SSIM 0.88/i)).toBeInTheDocument();
    expect(screen.getByText('KEPT')).toBeInTheDocument();

    expect(screen.getByText(/speech detected, 1.8s duration/i)).toBeInTheDocument();
    expect(screen.getByText('HEARD')).toBeInTheDocument();

    expect(screen.getByText(/8 events folded/i)).toBeInTheDocument();
    expect(screen.getByText('MEMORY')).toBeInTheDocument();
  });

  it('renders counters strip with free, billed, and free ratio readouts', () => {
    render(
      <PerceptionFeed
        events={sampleEvents}
        countFree={42}
        countBilled={8}
        freeRatio="84.0%"
        onClear={vi.fn()}
      />
    );

    expect(document.getElementById('cntFree')).toHaveTextContent('42');
    expect(document.getElementById('cntBilled')).toHaveTextContent('8');
    expect(document.getElementById('cntRatio')).toHaveTextContent('84.0%');
  });

  it('filters events by category chips', () => {
    render(
      <PerceptionFeed
        events={sampleEvents}
        countFree={3}
        countBilled={1}
        freeRatio="75.0%"
        onClear={vi.fn()}
      />
    );

    // Initial: all 4 visible
    expect(screen.getByText('Silver car makes a left turn')).toBeInTheDocument();
    expect(screen.getByText(/speech detected/i)).toBeInTheDocument();

    // Filter by LLM only
    const llmChip = screen.getByRole('button', { name: /LLM only/i });
    fireEvent.click(llmChip);

    expect(screen.getByText('Silver car makes a left turn')).toBeInTheDocument();
    expect(screen.queryByText(/speech detected/i)).not.toBeInTheDocument();

    // Filter by Audio
    const audioChip = screen.getByRole('button', { name: /^audio$/i });
    fireEvent.click(audioChip);

    expect(screen.queryByText('Silver car makes a left turn')).not.toBeInTheDocument();
    expect(screen.getByText(/speech detected/i)).toBeInTheDocument();
  });

  it('filters events using real-time search query', () => {
    render(
      <PerceptionFeed
        events={sampleEvents}
        countFree={3}
        countBilled={1}
        freeRatio="75.0%"
        onClear={vi.fn()}
      />
    );

    const searchInput = document.getElementById('filterInput') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'Silver' } });

    expect(screen.getByText('Silver car makes a left turn')).toBeInTheDocument();
    expect(screen.queryByText(/speech detected/i)).not.toBeInTheDocument();

    // Search nonexistent string
    fireEvent.change(searchInput, { target: { value: 'NonexistentEventQuery' } });
    expect(screen.getByText(/No matching events found/i)).toBeInTheDocument();
  });

  it('calls onClear when clear button is clicked', () => {
    const onClearMock = vi.fn();
    render(
      <PerceptionFeed
        events={sampleEvents}
        countFree={3}
        countBilled={1}
        freeRatio="75.0%"
        onClear={onClearMock}
      />
    );

    const clearBtn = screen.getByTitle('Clear event feed');
    fireEvent.click(clearBtn);
    expect(onClearMock).toHaveBeenCalled();
  });

  it('triggers JSON and CSV exports', () => {
    render(
      <PerceptionFeed
        events={sampleEvents}
        countFree={3}
        countBilled={1}
        freeRatio="75.0%"
        onClear={vi.fn()}
      />
    );

    const exportJsonBtn = screen.getByText('JSON');
    const exportCsvBtn = screen.getByText('CSV');

    fireEvent.click(exportJsonBtn);
    expect(URL.createObjectURL).toHaveBeenCalled();

    fireEvent.click(exportCsvBtn);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });
});
