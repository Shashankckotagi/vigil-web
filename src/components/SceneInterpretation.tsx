import React from 'react';
import { Sparkles, Clock, Cpu } from 'lucide-react';

interface SceneInterpretationProps {
  description: string;
  timestamp: string;
  tokens?: number;
  latency_s?: number;
}

export const SceneInterpretation: React.FC<SceneInterpretationProps> = ({
  description,
  timestamp,
  tokens,
  latency_s,
}) => {
  return (
    <div className="surface-card p-4 relative overflow-hidden bg-gradient-to-br from-card to-card-subtle">
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border-subtle text-xs">
        <div className="flex items-center gap-1.5 text-accent-primary font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="font-display tracking-wide uppercase text-[11px]">
            Current Scene Interpretation
          </span>
        </div>

        <div className="flex items-center gap-2">
          {tokens !== undefined && tokens > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent-amethyst/15 text-accent-amethyst border border-accent-amethyst/30">
              {tokens} tok
            </span>
          )}
          {latency_s !== undefined && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent-primary-subtle text-accent-primary border border-accent-primary/30">
              {latency_s.toFixed(2)}s
            </span>
          )}
          <div className="flex items-center gap-1 text-ink-faint font-mono text-[11px]">
            <Clock className="w-3 h-3" />
            <span id="ciTimestamp">{timestamp || '00:00'}</span>
          </div>
        </div>
      </div>

      <div
        id="ciBody"
        className="text-xs sm:text-sm text-ink-main leading-relaxed min-h-[2.5rem] font-sans transition-all duration-600"
      >
        {description || (
          <span className="text-ink-faint italic">
            Monitoring video stream...
          </span>
        )}
      </div>
    </div>
  );
};
