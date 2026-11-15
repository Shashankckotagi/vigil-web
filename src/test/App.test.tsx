import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { App } from '../App';
import { ThemeProvider } from '../context/ThemeContext';
import * as api from '../services/api';

describe('App Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    vi.spyOn(api, 'fetchPricing').mockResolvedValue({
      'gemini-2.5-flash': { input_per_million: 0.075, output_per_million: 0.3 },
      default: { input_per_million: 0.075, output_per_million: 0.3 },
      usd_to_inr: 86.0,
    });

    vi.spyOn(api, 'fetchStatus').mockResolvedValue({
      running: false,
      gate: { frames_kept: 0, frames_seen: 0, frames_dropped: 0 },
    });
  });

  it('renders all sections and initial elements properly', async () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    expect(screen.getAllByText(/Vigil/i)[0]).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter YouTube live URL/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Stream/i })).toBeInTheDocument();
    expect(document.getElementById('ssimChart')).toBeInTheDocument();
    expect(document.getElementById('timelineFeed')).toBeInTheDocument();
    expect(screen.getByText(/Current Scene Interpretation/i)).toBeInTheDocument();
  });

  it('starts pipeline when Start Stream is clicked with valid URL', async () => {
    const startSpy = vi.spyOn(api, 'startPipeline').mockResolvedValue({
      ok: true,
      run_id: 'ui-test-1',
      status: {
        running: true,
        run_id: 'ui-test-1',
        gate: { frames_kept: 10, frames_seen: 50, frames_dropped: 40 },
      },
    });

    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    const startBtn = screen.getByRole('button', { name: /Start Stream/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(startSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('http'),
          tau: 0.92,
        })
      );
    });
  });

  it('displays error message when start pipeline fails', async () => {
    vi.spyOn(api, 'startPipeline').mockRejectedValue(new Error('Pipeline process crashed'));

    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    const startBtn = screen.getByRole('button', { name: /Start Stream/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText('Pipeline process crashed')).toBeInTheDocument();
    });
  });
});
