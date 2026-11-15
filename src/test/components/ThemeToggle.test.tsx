import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeToggle } from '../../components/ThemeToggle';
import { ThemeProvider } from '../../context/ThemeContext';

describe('ThemeToggle Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  const renderToggle = () =>
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

  it('renders light/dark button with proper initial state in dark mode', () => {
    renderToggle();
    const btn = screen.getByRole('button', { name: /switch to light mode/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('id', 'themeToggleBtn');
    expect(screen.getByText('dark')).toBeInTheDocument();
  });

  it('toggles to light mode on click with updated tooltip and aria-label', () => {
    renderToggle();
    const btn = document.getElementById('themeToggleBtn')!;

    fireEvent.click(btn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(btn).toHaveAttribute('title', 'Switch to Dark Mode');
    expect(screen.getByText('light')).toBeInTheDocument();

    fireEvent.click(btn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(btn).toHaveAttribute('title', 'Switch to Light Mode');
    expect(screen.getByText('dark')).toBeInTheDocument();
  });
});
