import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, useTheme, PALETTES } from '../context/ThemeContext';

describe('ThemeContext & Palettes', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>{children}</ThemeProvider>
  );

  it('provides exactly 2 vibrant, low-contrast themes (dark and light) with 3 preview colors', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.palettes).toHaveLength(2);

    const ids = result.current.palettes.map((p) => p.id);
    expect(ids).toEqual(['dark', 'light']);

    result.current.palettes.forEach((p) => {
      expect(p.previewColors).toHaveLength(3);
      expect(p.name).toBeTruthy();
      expect(p.tagline).toBeTruthy();
    });
  });

  it('defaults to dark theme and applies data-theme="dark" on html element', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('switches theme and updates state, localStorage, and document attribute', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('vigil_theme_palette')).toBe('light');

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggles theme between dark and light via toggleTheme()', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('restores saved palette from localStorage on mount', () => {
    localStorage.setItem('vigil_theme_palette', 'light');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('falls back to dark if localStorage has an invalid palette id or legacy theme', () => {
    localStorage.setItem('vigil_theme_palette', 'nordic');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
