import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <button
      id="themeToggleBtn"
      onClick={toggleTheme}
      type="button"
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-subtle bg-card hover:border-border-hover hover:bg-card-hover transition-all duration-400 text-xs font-medium text-ink-muted hover:text-ink-main group shadow-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      <div className="relative flex items-center justify-center w-5 h-5 rounded-md bg-card-subtle border border-border-subtle group-hover:scale-105 transition-transform duration-300">
        {isDark ? (
          <Sun className="w-3.5 h-3.5 text-accent-warm transition-transform duration-500 rotate-0 group-hover:rotate-45" />
        ) : (
          <Moon className="w-3.5 h-3.5 text-accent-periwinkle transition-transform duration-500 rotate-0 group-hover:-rotate-12" />
        )}
      </div>
      <span className="font-mono text-[11px] tracking-wide capitalize select-none">
        {theme}
      </span>
      <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
    </button>
  );
};
