import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { VideoViewport } from '../../components/VideoViewport';

describe('VideoViewport Component', () => {
  it('renders viewport container with ID viewport', () => {
    render(<VideoViewport status={null} isRunning={false} />);
    expect(document.getElementById('viewport')).toBeInTheDocument();
  });

  it('shows STANDBY tag and placeholder when stream is idle', () => {
    render(<VideoViewport status={{ running: false }} isRunning={false} />);
    expect(screen.getByText('STANDBY')).toBeInTheDocument();
    expect(screen.getByText(/Awaiting video stream or file replay/i)).toBeInTheDocument();
  });

  it('shows LIVE tag when running', () => {
    render(<VideoViewport status={{ running: true, escalated: false }} isRunning={true} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('shows ESCALATED tag when pipeline is escalated', () => {
    render(<VideoViewport status={{ running: true, escalated: true }} isRunning={true} />);
    expect(screen.getByText('ESCALATED')).toBeInTheDocument();
  });

  it('contains image element with ID liveFeedImg and proper API path', () => {
    render(<VideoViewport status={{ running: true }} isRunning={true} />);
    const img = document.getElementById('liveFeedImg') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('/api/feed');
  });

  it('allows clicking reload video feed button to refresh stream', () => {
    render(<VideoViewport status={{ running: true }} isRunning={true} />);
    const reloadBtn = screen.getByTitle('Reload Video Stream');
    const img = document.getElementById('liveFeedImg') as HTMLImageElement;
    const initialSrc = img.src;

    fireEvent.click(reloadBtn);
    expect(img.src).not.toBe(initialSrc);
  });

  it('toggles fullscreen on viewport element', () => {
    render(<VideoViewport status={{ running: true }} isRunning={true} />);
    const fsBtn = screen.getByTitle('Toggle Fullscreen');
    const viewport = document.getElementById('viewport');
    viewport!.requestFullscreen = vi.fn().mockResolvedValue(undefined);

    fireEvent.click(fsBtn);
    expect(viewport!.requestFullscreen).toHaveBeenCalled();
  });
});
