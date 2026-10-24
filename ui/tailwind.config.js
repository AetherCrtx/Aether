/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cortex: {
          bg: 'var(--cortex-bg)',
          bgAlt: 'var(--cortex-bg-alt)',
          surface1: 'var(--cortex-surface-1)',
          surface2: 'var(--cortex-surface-2)',
          border: 'var(--cortex-border)',
          borderStrong: 'var(--cortex-border-strong)',
          text: 'var(--cortex-text)',
          textMuted: 'var(--cortex-text-muted)',
          accent: 'var(--cortex-accent)',
          accentHover: 'var(--cortex-accent-hover)',
          accentMuted: 'var(--cortex-accent-muted)',
          error: 'var(--cortex-error)',
          success: 'var(--cortex-success)',
          warning: 'var(--cortex-warning)',
        },
        tokyo: {
          bg: '#1a1b26',
          bgDark: '#16161e',
          panel: '#1f2335',
          border: '#292e42',
          fg: '#c0caf5',
          comment: '#565f89',
          blue: '#7aa2f7',
          cyan: '#7dcfff',
          purple: '#bb9af7',
          orange: '#ff9e64',
          yellow: '#e0af68',
          green: '#9ece6a',
          red: '#f7768e',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrainsMono Nerd Font"', '"FiraCode Nerd Font"', 'monospace'],
      }
    },
  },
  plugins: [],
}
