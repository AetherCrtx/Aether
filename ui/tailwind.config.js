/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
        mono: ['"JetBrainsMono Nerd Font"', '"FiraCode Nerd Font"', 'monospace'],
      }
    },
  },
  plugins: [],
}
