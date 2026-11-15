import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { App } from '../App';
import { ThemeProvider } from '../context/ThemeContext';

describe('App Multi-View Navigation', () => {
  const renderApp = () =>
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

  it('defaults to Live Monitor view and shows control bar and stream viewport', () => {
    renderApp();
    expect(screen.getByText('Start Stream')).toBeInTheDocument();
    expect(screen.getByText('Vision Similarity (SSIM) Waveform')).toBeInTheDocument();
    expect(screen.getByText('Perception Feed')).toBeInTheDocument();
  });

  it('switches to Deep Analytics view on tab click', () => {
    renderApp();
    const analyticsTab = document.getElementById('tab-analytics')!;
    expect(analyticsTab).toBeInTheDocument();

    fireEvent.click(analyticsTab);
    expect(screen.getByText(/Cost Savings/i)).toBeInTheDocument();
    expect(screen.getByText(/SSIM Distribution/i)).toBeInTheDocument();
    expect(screen.getByText(/Model Comparison/i)).toBeInTheDocument();
  });

  it('switches to System Inspector view on tab click', () => {
    renderApp();
    const systemTab = document.getElementById('tab-system')!;
    expect(systemTab).toBeInTheDocument();

    fireEvent.click(systemTab);
    expect(screen.getByText(/System Status/i)).toBeInTheDocument();
    expect(screen.getByText(/Memory Compaction/i)).toBeInTheDocument();
    expect(screen.getByText(/SSIM Gating Settings/i)).toBeInTheDocument();
  });

  it('switches to Event Audit view on tab click', () => {
    renderApp();
    const auditTab = document.getElementById('tab-audit')!;
    expect(auditTab).toBeInTheDocument();

    fireEvent.click(auditTab);
    expect(screen.getByText(/Event Audit/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search event body/i)).toBeInTheDocument();
  });

  it('can navigate back to Live Monitor view seamlessly', () => {
    renderApp();
    fireEvent.click(document.getElementById('tab-analytics')!);
    expect(screen.getByText(/Cost Savings/i)).toBeInTheDocument();

    fireEvent.click(document.getElementById('tab-monitor')!);
    expect(screen.getByText('Start Stream')).toBeInTheDocument();
    expect(screen.getByText('Vision Similarity (SSIM) Waveform')).toBeInTheDocument();
  });
});
