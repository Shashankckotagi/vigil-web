import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemePaletteId, ThemePaletteInfo } from '../types';

export const PALETTES: ThemePaletteInfo[] = [
  {
    id: 'dark',
    name: 'Vibrant Dark',
    tagline: 'Deep velvet night with luminous electric accents',
    previewColors: ['#38bdf8', '#2dd4bf', '#c084fc'],
  },
  {
    id: 'light',
    name: 'Vibrant Light',
    tagline: 'Soft warm cloud with vivid jewel tones',
    previewColors: ['#0284c7', '#0d9488', '#9333ea'],
  },
];

interface ThemeContextType {
  theme: ThemePaletteId;
  setTheme: (theme: ThemePaletteId) => void;
  toggleTheme: () => void;
  isDark: boolean;
  palettes: ThemePaletteInfo[];
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: true,
  palettes: PALETTES,
});

const STORAGE_KEY_THEME = 'vigil_theme_palette';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemePaletteId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_THEME) as ThemePaletteId;
      if (saved && (saved === 'dark' || saved === 'light')) {
        return saved;
      }
    } catch {
      // storage unavailable / blocked
    }
    return 'dark';
  });

  const setTheme = (nextTheme: ThemePaletteId) => {
    const validTheme: ThemePaletteId = nextTheme === 'light' ? 'light' : 'dark';
    setThemeState(validTheme);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, validTheme);
    } catch {
      // storage unavailable
    }
    document.documentElement.setAttribute('data-theme', validTheme);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark, palettes: PALETTES }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
