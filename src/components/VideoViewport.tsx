import React, { useRef, useState } from 'react';
import { Maximize2, Minimize2, RotateCw, Camera, Video, AlertTriangle } from 'lucide-react';
import { apiUrl } from '../services/api';
import { PipelineStatus } from '../types';

interface VideoViewportProps {
  status: PipelineStatus | null;
  isRunning: boolean;
}

export const VideoViewport: React.FC<VideoViewportProps> = ({ status, isRunning }) => {
  const [feedKey, setFeedKey] = useState(Date.now());
  const [feedError, setFeedError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const isEscalated = !!status?.escalated;

  const refreshFeed = () => {
    setFeedError(false);
    setFeedKey(Date.now());
  };

  const toggleFullscreen = () => {
    if (!viewportRef.current) return;
    if (!document.fullscreenElement) {
      viewportRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const takeSnapshot = () => {
    if (!imgRef.current) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imgRef.current.naturalWidth || 640;
      canvas.height = imgRef.current.naturalHeight || 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imgRef.current, 0, 0);
        const link = document.createElement('a');
        link.download = `vigil-snapshot-${Date.now()}.jpg`;
        link.href = canvas.toDataURL('image/jpeg');
        link.click();
      }
    } catch (e) {
      console.warn('Snapshot capture failed', e);
    }
  };

  const streamBadgeText = isRunning
    ? isEscalated
      ? 'ESCALATED'
      : 'LIVE'
    : 'STANDBY';

  return (
    <div className="surface-card p-2 sm:p-3 relative overflow-hidden group">
      <div
        id="viewport"
        ref={viewportRef}
        className="relative w-full aspect-video rounded-lg overflow-hidden bg-black/90 flex items-center justify-center border border-border-subtle"
      >
        {/* Stream Status Overlay Badge */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono tracking-wider">
          <span
            className={`w-2 h-2 rounded-full ${
              isRunning
                ? isEscalated
                  ? 'bg-accent-warm animate-breathe-slow'
                  : 'bg-accent-emerald animate-breathe-slow'
                : 'bg-ink-faint'
            }`}
          />
          <span id="streamTypeTag" className="text-white/90 font-medium">
            {streamBadgeText}
          </span>
        </div>

        {/* Live Feed Image */}
        <img
          id="liveFeedImg"
          ref={imgRef}
          src={apiUrl(`/api/feed?t=${feedKey}`)}
          alt="Live stream"
          crossOrigin="anonymous"
          style={{ display: isRunning && !feedError ? 'block' : 'none' }}
          className="w-full h-full object-contain"
          onLoad={() => setFeedError(false)}
          onError={() => setFeedError(true)}
        />

        {/* Fallback Placeholder */}
        <div
          id="placeholder"
          style={{ display: !isRunning || feedError ? 'flex' : 'none' }}
          className="flex flex-col items-center justify-center gap-3 p-6 text-center text-ink-faint select-none"
        >
          <div className="w-12 h-12 rounded-xl bg-card-subtle flex items-center justify-center border border-border-subtle text-ink-faint">
            <Video className="w-6 h-6 stroke-[1.4]" />
          </div>
          <div className="space-y-1">
            <p id="placeholderText" className="text-xs font-medium text-ink-muted">
              {isRunning
                ? 'Connecting to stream...'
                : 'Awaiting video stream or file replay...'}
            </p>
          </div>
        </div>

        {/* Viewport Action Controls Overlay */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-400">
          <button
            id="btnRefreshFeed"
            onClick={refreshFeed}
            className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 text-white/80 hover:text-white transition-all text-xs"
            title="Reload Video Stream"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={takeSnapshot}
            disabled={!isRunning || feedError}
            className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 text-white/80 hover:text-white disabled:opacity-40 transition-all text-xs"
            title="Capture Snapshot Image"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          <button
            id="btnFullscreen"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 text-white/80 hover:text-white transition-all text-xs"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
