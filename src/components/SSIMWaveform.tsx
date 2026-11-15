import React, { useRef, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface SSIMWaveformProps {
  history?: Array<{ ssim: number; kept: boolean }>;
  tau?: number;
  retentionPercent?: number;
}

export const SSIMWaveform: React.FC<SSIMWaveformProps> = ({
  history = [],
  tau = 0.92,
  retentionPercent = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const width = parent ? parent.clientWidth - 32 : 600;
    const height = 90;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Subtle horizontal grid lines adapted for theme
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let y = 0.2; y <= 1.0; y += 0.2) {
      const gy = height - y * height;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    // Dynamic Threshold line
    const tauY = height - Math.min(Math.max(tau, 0), 1) * height;
    ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.8)' : 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, tauY);
    ctx.lineTo(width, tauY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (history.length < 2) {
      // Empty waveform placeholder
      ctx.fillStyle = isLight ? 'rgba(30, 41, 59, 0.4)' : 'rgba(226, 232, 240, 0.3)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for frames...', width / 2, height / 2 + 3);
      return;
    }

    const maxPoints = 60;
    const step = width / (maxPoints - 1);
    const startOffset = maxPoints - history.length;

    // Gradient fill under the curve
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (isLight) {
      gradient.addColorStop(0, 'rgba(2, 132, 199, 0.20)');
      gradient.addColorStop(1, 'rgba(2, 132, 199, 0.0)');
    } else {
      gradient.addColorStop(0, 'rgba(56, 189, 248, 0.20)');
      gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    }

    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = (startOffset + idx) * step;
      const y = height - Math.min(Math.max(pt.ssim, 0), 1) * height;
      if (idx === 0) {
        ctx.moveTo(x, height);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo((startOffset + history.length - 1) * step, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Connecting waveform stroke
    ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.55)' : 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = (startOffset + idx) * step;
      const y = height - Math.min(Math.max(pt.ssim, 0), 1) * height;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Data points (emerald if kept, rose if dropped)
    const keptColor = isLight ? '#059669' : '#10b981';
    const droppedColor = isLight ? '#e11d48' : '#f43f5e';
    history.forEach((pt, idx) => {
      const x = (startOffset + idx) * step;
      const y = height - Math.min(Math.max(pt.ssim, 0), 1) * height;

      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = pt.kept ? keptColor : droppedColor;
      ctx.fill();
    });
  }, [history, tau, isLight]);

  return (
    <div className="surface-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-ink-muted">
          <Activity className="w-3.5 h-3.5 text-accent-primary" />
          <span className="font-display uppercase text-[11px] tracking-wide">
            Vision Similarity (SSIM) Waveform
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-ink-faint">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-emerald" />
            <span>Kept</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-rose" />
            <span>Dropped</span>
          </div>
          <div className="flex items-center gap-1 font-mono">
            <span className="w-2.5 h-0.5 bg-accent-primary border-t border-dashed" />
            <span>τ ({tau.toFixed(2)})</span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full rounded-md bg-card-subtle/50 p-2 overflow-hidden border border-border-subtle/50">
        <canvas id="ssimChart" ref={canvasRef} className="w-full block" />
      </div>

      {/* Frame Retention Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-ink-faint font-mono">
          <span>Frame retention</span>
          <span>{(retentionPercent ?? 0).toFixed(1)}% Forwarded</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-card-subtle overflow-hidden border border-border-subtle/40">
          <div
            id="retentionBar"
            className="h-full rounded-full bg-gradient-to-r from-accent-primary to-accent-emerald transition-all duration-800"
            style={{ width: `${Math.min(Math.max(retentionPercent, 0), 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
