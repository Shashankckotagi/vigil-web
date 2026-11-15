import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme, PALETTES } from '../../context/ThemeContext';

const TestComponent = () => {
  const { theme, setTheme, toggleTheme, isDark } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="is-dark">{isDark ? 'yes' : 'no'}</span>
      <button onClick={() => setTheme('light')}>Switch to Light</button>
      <button onClick={() => setTheme('dark')}>Switch to Dark</button>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
};

describe('Theme Robustness & Storage Resiliency', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('gracefully handles localStorage throwing exceptions (e.g. storage disabled)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('falls back to default dark theme when localStorage has unknown theme name', () => {
    localStorage.setItem('vigil_theme_palette', 'non_existent_cyberpunk_theme');

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('is-dark')).toHaveTextContent('yes');
  });

  it('switches between dark and light themes smoothly', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText('Switch to Light'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    expect(screen.getByTestId('is-dark')).toHaveTextContent('no');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    fireEvent.click(screen.getByText('Toggle Theme'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('is-dark')).toHaveTextContent('yes');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('contains exactly 2 vibrant, low-contrast palettes (dark and light)', () => {
    expect(PALETTES.length).toBe(2);
    const ids = PALETTES.map((p) => p.id);
    expect(ids).toEqual(['dark', 'light']);
  });
});
