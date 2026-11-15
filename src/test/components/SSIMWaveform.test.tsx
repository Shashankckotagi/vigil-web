import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SSIMWaveform } from '../../components/SSIMWaveform';

describe('SSIMWaveform Component', () => {
  it('renders canvas with ID ssimChart', () => {
    render(<SSIMWaveform history={[]} tau={0.92} retentionPercent={75.5} />);
    const canvas = document.getElementById('ssimChart');
    expect(canvas).toBeInTheDocument();
  });

  it('renders retention bar with ID retentionBar and proper width style', () => {
    render(<SSIMWaveform history={[]} tau={0.92} retentionPercent={42.8} />);
    const bar = document.getElementById('retentionBar');
    expect(bar).toBeInTheDocument();
    expect(bar?.style.width).toBe('42.8%');
    expect(screen.getByText('42.8% Forwarded')).toBeInTheDocument();
  });

  it('clamps retention bar width between 0% and 100%', () => {
    const { rerender } = render(<SSIMWaveform history={[]} tau={0.92} retentionPercent={-10} />);
    let bar = document.getElementById('retentionBar');
    expect(bar?.style.width).toBe('0%');

    rerender(<SSIMWaveform history={[]} tau={0.92} retentionPercent={150} />);
    bar = document.getElementById('retentionBar');
    expect(bar?.style.width).toBe('100%');
  });

  it('displays legend elements for Kept, Dropped, and Tau Threshold', () => {
    render(<SSIMWaveform history={[]} tau={0.95} retentionPercent={80} />);
    expect(screen.getByText('Kept')).toBeInTheDocument();
    expect(screen.getByText('Dropped')).toBeInTheDocument();
    expect(screen.getByText('τ (0.95)')).toBeInTheDocument();
  });
});
