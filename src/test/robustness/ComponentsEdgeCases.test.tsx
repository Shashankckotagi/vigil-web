import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SSIMWaveform } from '../../components/SSIMWaveform';
import { PerceptionFeed } from '../../components/PerceptionFeed';
import { TelemetryMetrics } from '../../components/TelemetryMetrics';
import { SceneInterpretation } from '../../components/SceneInterpretation';
import { ControlBar } from '../../components/ControlBar';
import { FormattedEvent } from '../../types';

describe('UI Components Edge Cases & Stress Resilience', () => {
  describe('SSIMWaveform Edge Cases', () => {
    it('renders safely with 0 points without crashing', () => {
      const { container } = render(
        <SSIMWaveform history={[]} tau={0.92} retentionPercent={0} />
      );
      expect(container.querySelector('canvas')).toBeInTheDocument();
      expect(screen.getByText('Vision Similarity (SSIM) Waveform')).toBeInTheDocument();
    });

    it('renders safely with 1 point and extreme values (0.0, 1.0, NaN)', () => {
      const edgePoints = [
        { ssim: 1.0, kept: true },
        { ssim: 0.0, kept: false },
        { ssim: NaN, kept: false },
        { ssim: -0.5, kept: false },
      ];
      const { container } = render(
        <SSIMWaveform history={edgePoints} tau={0.85} retentionPercent={25} />
      );
      expect(container.querySelector('canvas')).toBeInTheDocument();
      expect(screen.getByText(/0.85/)).toBeInTheDocument();
      expect(screen.getByText('25.0% Forwarded')).toBeInTheDocument();
    });

    it('handles high volume (1,000+ points) smoothly', () => {
      const manyPoints = Array.from({ length: 1200 }, (_, i) => ({
        ssim: 0.8 + 0.15 * Math.sin(i / 10),
        kept: i % 5 === 0,
      }));
      const { container } = render(
        <SSIMWaveform history={manyPoints} tau={0.92} retentionPercent={20} />
      );
      expect(container.querySelector('canvas')).toBeInTheDocument();
    });
  });

  describe('PerceptionFeed Filtering & Search Edge Cases', () => {
    const sampleEvents: FormattedEvent[] = [
      {
        id: '1',
        rawEvent: { type: 'description', cost: 'billed' },
        type: 'description',
        tag: 'LLM',
        category: 'llm',
        timestamp: '00:15',
        rawT: 15,
        cost: 'billed',
        title: 'LLM Scene Description',
        body: 'A person wearing a dark coat walks into view.',
        badges: [{ label: '142 tok' }],
      },
      {
        id: '2',
        rawEvent: { type: 'frame_kept', cost: 'free' },
        type: 'frame_kept',
        tag: 'KEPT',
        category: 'gate',
        timestamp: '00:16',
        rawT: 16,
        cost: 'free',
        title: 'Frame Passed Gating',
        body: 'frame passed — SSIM 0.88 below tau',
      },
      {
        id: '3',
        rawEvent: { type: 'audio_speech', cost: 'free' },
        type: 'audio_speech',
        tag: 'HEARD',
        category: 'audio',
        timestamp: '00:18',
        rawT: 18,
        cost: 'free',
        title: 'Speech Detected',
        body: 'speech detected, 1.8s duration',
      },
      {
        id: '4',
        rawEvent: { type: 'error', cost: 'free' },
        type: 'error',
        tag: 'ERROR',
        category: 'system',
        timestamp: '00:20',
        rawT: 20,
        cost: 'free',
        title: 'System Fault',
        body: 'Rate limit quota exceeded on Gemini endpoint',
      },
    ];

    it('filters across each category tab accurately', () => {
      render(
        <PerceptionFeed
          events={sampleEvents}
          countFree={3}
          countBilled={1}
          freeRatio="75.0"
        />
      );

      expect(screen.getByText(/A person wearing a dark coat/)).toBeInTheDocument();

      // Click "system" chip
      const systemChip = screen.getByRole('button', { name: /^system$/i });
      act(() => {
        fireEvent.click(systemChip);
      });
      expect(screen.getByText(/Rate limit quota exceeded/)).toBeInTheDocument();
      expect(screen.queryByText(/A person wearing a dark coat/)).not.toBeInTheDocument();

      // Click "audio" chip
      const audioChip = screen.getByRole('button', { name: /^audio$/i });
      act(() => {
        fireEvent.click(audioChip);
      });
      expect(screen.getByText(/Speech Detected/i)).toBeInTheDocument();
      expect(screen.queryByText(/Rate limit quota exceeded/)).not.toBeInTheDocument();
    });

    it('shows "No matching events found." when search returns 0 results', () => {
      render(
        <PerceptionFeed
          events={sampleEvents}
          countFree={3}
          countBilled={1}
          freeRatio="75.0"
        />
      );

      const searchInput = screen.getByPlaceholderText(/Filter events/i);
      act(() => {
        fireEvent.change(searchInput, { target: { value: 'nonexistent_query_xyz' } });
      });

      expect(screen.getByText(/No matching events found/i)).toBeInTheDocument();
    });

    it('handles empty events feed state gracefully', () => {
      render(<PerceptionFeed events={[]} countFree={0} countBilled={0} freeRatio="0.0" />);
      expect(screen.getByText(/Awaiting video stream analysis/i)).toBeInTheDocument();
    });

    it('safely handles potential XSS scripts in event descriptions without executing', () => {
      const xssEvent: FormattedEvent = {
        id: 'xss-1',
        rawEvent: { type: 'description', cost: 'billed' },
        type: 'description',
        tag: 'LLM',
        category: 'llm',
        timestamp: '00:25',
        rawT: 25,
        cost: 'billed',
        title: 'XSS Title',
        body: '<script>alert("xss")</script><img src="x" onerror="alert(1)"/> Safe text description',
      };
      render(
        <PerceptionFeed
          events={[xssEvent]}
          countFree={0}
          countBilled={1}
          freeRatio="0.0"
        />
      );
      expect(screen.getByText(/<script>alert/)).toBeInTheDocument();
    });
  });

  describe('TelemetryMetrics Edge Cases', () => {
    it('handles millions of tokens formatted properly with currency calculations', () => {
      const status: any = {
        running: true,
        provider: 'gemini-4-hydrogen',
        metrics: {
          run_id: 'prod-run',
          chunks_done: 450,
          tokens_in: 2500000,
          tokens_out: 150000,
          tokens_total: 2650000,
          tokens_per_hour: 120000,
          p50_latency_s: 0.32,
          p95_latency_s: 0.78,
          max_queue_depth: 3,
        },
        gate: {
          frames_kept: 1200,
          frames_seen: 10000,
          frames_dropped: 8800,
          frame_retention: 0.12,
        },
      };
      const pricing: any = {
        'gemini-4-hydrogen': { input_per_million: 1.50, output_per_million: 7.50 },
        default: { input_per_million: 0.075, output_per_million: 0.3 },
        usd_to_inr: 86.0,
      };

      render(
        <TelemetryMetrics
          status={status}
          pricing={pricing}
        />
      );

      expect(screen.getByText('2,650,000')).toBeInTheDocument();
      expect(screen.getByText(/p50: 0.32s \| p95: 0.78s/)).toBeInTheDocument();
      expect(screen.getByText('1,200')).toBeInTheDocument();
      expect(screen.getByText('12.0% retention')).toBeInTheDocument();
    });

    it('handles undefined metrics gracefully with default zeros', () => {
      render(<TelemetryMetrics status={null} />);
      expect(document.getElementById('statTokens')).toHaveTextContent('0');
      expect(document.getElementById('statKept')).toHaveTextContent('0');
      expect(document.getElementById('statDropped')).toHaveTextContent('0');
      expect(screen.getByText('0.0% retention')).toBeInTheDocument();
      expect(document.getElementById('statLatency')).toHaveTextContent('—');
    });
  });

  describe('SceneInterpretation Edge Cases', () => {
    it('renders initial waiting message when description is empty string', () => {
      render(<SceneInterpretation description="" timestamp="" />);
      expect(screen.getByText(/Monitoring video stream/i)).toBeInTheDocument();
      expect(screen.getByText('00:00')).toBeInTheDocument();
    });

    it('renders tokens and latency stats when present', () => {
      render(
        <SceneInterpretation
          description="A courier dropped a heavy parcel at the entrance."
          timestamp="00:15"
          tokens={420}
          latency_s={0.45}
        />
      );
      expect(screen.getByText('A courier dropped a heavy parcel at the entrance.')).toBeInTheDocument();
      expect(screen.getByText('420 tok')).toBeInTheDocument();
      expect(screen.getByText('0.45s')).toBeInTheDocument();
    });
  });

  describe('ControlBar Parameter Controls', () => {
    const defaultProps = {
      url: 'sample/demo_clip.avi',
      setUrl: vi.fn(),
      tau: 0.92,
      setTau: vi.fn(),
      provider: 'mock',
      setProvider: vi.fn(),
      apiKey: '',
      setApiKey: vi.fn(),
      runId: 'dev',
      setRunId: vi.fn(),
      backendUrl: '',
      setBackendUrl: vi.fn(),
      audio: true,
      setAudio: vi.fn(),
      escalation: false,
      setEscalation: vi.fn(),
      gate: true,
      setGate: vi.fn(),
      bounded: true,
      setBounded: vi.fn(),
      isRunning: false,
      isStarting: false,
      isUploading: false,
      onStart: vi.fn(),
      onStop: vi.fn(),
      onUploadFile: vi.fn(),
      errorMessage: null,
      setErrorMessage: vi.fn(),
    };

    it('disables controls when pipeline is running', () => {
      render(
        <ControlBar
          {...defaultProps}
          isRunning={true}
        />
      );

      const startButton = screen.getByRole('button', { name: /Start Stream/i });
      expect(startButton).toBeDisabled();

      const stopButton = screen.getByRole('button', { name: /Stop/i });
      expect(stopButton).toBeInTheDocument();
      expect(stopButton).not.toBeDisabled();
    });

    it('allows changing stream URL and toggling quick presets', () => {
      const setUrl = vi.fn();
      render(
        <ControlBar
          {...defaultProps}
          setUrl={setUrl}
        />
      );

      const urlInput = screen.getByPlaceholderText(/Enter YouTube live URL/i);
      fireEvent.change(urlInput, { target: { value: 'https://youtube.com/live/xyz' } });
      expect(setUrl).toHaveBeenCalledWith('https://youtube.com/live/xyz');

      // Click preset
      const presetBtn = screen.getByText(/Bundled Demo Clip/i);
      fireEvent.click(presetBtn);
      expect(setUrl).toHaveBeenCalledWith('sample/demo_clip.avi');
    });
  });
});
