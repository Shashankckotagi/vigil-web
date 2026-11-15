import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EventAuditExplorer } from '../../components/EventAuditExplorer';
import { FormattedEvent } from '../../types';

describe('EventAuditExplorer Component', () => {
  const mockEvents: FormattedEvent[] = [
    {
      id: 'e1',
      rawEvent: { type: 'description', text: 'Vehicle detected at crossing' },
      type: 'description',
      tag: 'LLM',
      category: 'llm',
      timestamp: '00:02',
      rawT: 2.0,
      cost: 'billed',
      title: 'Scene Interpretation',
      body: 'Vehicle detected at crossing',
    },
    {
      id: 'e2',
      rawEvent: { type: 'gate_drop_run', count: 18 },
      type: 'gate_drop_run',
      tag: 'DROPPED',
      category: 'gate',
      timestamp: '00:04',
      rawT: 4.0,
      cost: 'free',
      title: 'Redundant Frames Dropped',
      body: 'SSIM gate dropped 18 redundant frames',
    },
  ];

  it('renders event audit explorer with metrics and table rows', () => {
    render(
      <EventAuditExplorer
        events={mockEvents}
        countFree={1}
        countBilled={1}
        freeRatio="50.0%"
      />
    );

    expect(screen.getByText(/Event Audit/i)).toBeInTheDocument();
    expect(screen.getByText('Vehicle detected at crossing')).toBeInTheDocument();
    expect(screen.getByText('SSIM gate dropped 18 redundant frames')).toBeInTheDocument();
  });

  it('filters events when typing in search input', () => {
    render(
      <EventAuditExplorer
        events={mockEvents}
        countFree={1}
        countBilled={1}
        freeRatio="50.0%"
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search event body/i);
    fireEvent.change(searchInput, { target: { value: 'Vehicle' } });

    expect(screen.getByText('Vehicle detected at crossing')).toBeInTheDocument();
    expect(screen.queryByText('SSIM gate dropped 18 redundant frames')).not.toBeInTheDocument();
  });

  it('opens raw JSON payload modal when clicking View JSON', () => {
    render(
      <EventAuditExplorer
        events={mockEvents}
        countFree={1}
        countBilled={1}
        freeRatio="50.0%"
      />
    );

    const viewJsonBtns = screen.getAllByText('View JSON');
    fireEvent.click(viewJsonBtns[0]);

    expect(screen.getByText(/Raw Event Inspector/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Vehicle detected at crossing/i).length).toBeGreaterThanOrEqual(1);
  });
});
