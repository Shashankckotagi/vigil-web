/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        card: {
          DEFAULT: 'var(--bg-card)',
          hover: 'var(--bg-card-hover)',
          subtle: 'var(--bg-card-subtle)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          hover: 'var(--border-hover)',
        },
        ink: {
          main: 'var(--text-main)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          'primary-subtle': 'var(--accent-primary-subtle)',
          secondary: 'var(--accent-secondary)',
          warm: 'var(--accent-warm)',
          rose: 'var(--accent-rose)',
          emerald: 'var(--accent-emerald)',
          amethyst: 'var(--accent-amethyst)',
          periwinkle: 'var(--accent-periwinkle)',
        },
      },
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Plus Jakarta Sans"', '"Inter"', 'sans-serif'],
      },
      transitionDuration: {
        '400': '400ms',
        '600': '600ms',
        '800': '800ms',
        '1000': '1000ms',
      },
      animation: {
        'breathe-slow': 'breatheSlow 5s ease-in-out infinite',
        'pulse-subtle': 'pulseSubtle 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.7s ease-out',
        'slide-down': 'slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        breatheSlow: {
          '0%, 100%': { opacity: '0.65', transform: 'scale(0.97)' },
          '50%': { opacity: '1', transform: 'scale(1.03)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.75' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
