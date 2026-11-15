import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Header } from '../../components/Header';
import { ThemeProvider } from '../../context/ThemeContext';

describe('Header Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderHeader = (status: any = null, wsConnected = true) => {
    return render(
      <ThemeProvider>
        <Header status={status} wsConnected={wsConnected} />
      </ThemeProvider>
    );
  };

  it('renders branding and version badge', () => {
    renderHeader();
    expect(screen.getByText(/Vigil/i)).toBeInTheDocument();
    expect(screen.getByText(/Intelligence/i)).toBeInTheDocument();
    expect(screen.getByText(/v0.1.0/i)).toBeInTheDocument();
  });

  it('renders status pill as IDLE when pipeline is not running', () => {
    renderHeader({ running: false }, true);
    const statusText = screen.getByText('IDLE');
    expect(statusText).toBeInTheDocument();
  });

  it('renders status pill as CONNECTING... when WebSocket is disconnected', () => {
    renderHeader({ running: false }, false);
    expect(screen.getByText('CONNECTING...')).toBeInTheDocument();
  });

  it('renders status pill as LIVE when pipeline is running', () => {
    renderHeader({ running: true, escalated: false }, true);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('renders status pill as ESCALATED when audio escalation is active', () => {
    renderHeader({ running: true, escalated: true }, true);
    expect(screen.getByText('ESCALATED')).toBeInTheDocument();
  });

  it('renders digital clock element', () => {
    renderHeader();
    const clockEl = document.getElementById('clock');
    expect(clockEl).toBeInTheDocument();
  });

  it('allows toggling between dark and light themes using the theme toggle button', () => {
    renderHeader();
    const toggleBtn = document.getElementById('themeToggleBtn');
    expect(toggleBtn).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Click to toggle to Light mode
    fireEvent.click(toggleBtn!);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // Click again to toggle back to Dark mode
    fireEvent.click(toggleBtn!);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
