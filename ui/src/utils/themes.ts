export interface AetherTheme {
  id: string;
  name: string;
  description: string;
  accent: string;
  bg: string;
  bgDark: string;
  panel: string;
  border: string;
  fg: string;
  cursor: string;
  selection: string;
  xterm: {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const AETHER_THEMES: AetherTheme[] = [
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    description: 'Clean dark theme celebrating the lights of downtown Tokyo',
    accent: '#7aa2f7',
    bg: '#1a1b26',
    bgDark: '#16161e',
    panel: '#1f2335',
    border: '#292e42',
    fg: '#c0caf5',
    cursor: '#c0caf5',
    selection: '#283457',
    xterm: {
      background: '#16161e00',
      foreground: '#c0caf5',
      cursor: '#c0caf5',
      selectionBackground: '#283457',
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    description: 'Soothing pastel dark theme with warm contrast',
    accent: '#89b4fa',
    bg: '#1e1e2e',
    bgDark: '#181825',
    panel: '#313244',
    border: '#45475a',
    fg: '#cdd6f4',
    cursor: '#f5e0dc',
    selection: '#585b70',
    xterm: {
      background: '#18182500',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: '#585b70',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Famous gothic high-contrast dark theme',
    accent: '#bd93f9',
    bg: '#282a36',
    bgDark: '#21222c',
    panel: '#343746',
    border: '#44475a',
    fg: '#f8f8f2',
    cursor: '#f8f8f2',
    selection: '#44475a',
    xterm: {
      background: '#21222c00',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Arctic, north-bluish clean and elegant color palette',
    accent: '#88c0d0',
    bg: '#2e3440',
    bgDark: '#242933',
    panel: '#3b4252',
    border: '#434c5e',
    fg: '#eceff4',
    cursor: '#d8dee9',
    selection: '#4c566a',
    xterm: {
      background: '#24293300',
      foreground: '#d8dee9',
      cursor: '#d8dee9',
      selectionBackground: '#434c5e',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4',
    },
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    description: 'Ultra-vibrant high-energy neon matrix aesthetics',
    accent: '#00ffcc',
    bg: '#0d0f18',
    bgDark: '#08090f',
    panel: '#151824',
    border: '#2a2f45',
    fg: '#00ffcc',
    cursor: '#ff007f',
    selection: '#381442',
    xterm: {
      background: '#08090f00',
      foreground: '#00ffcc',
      cursor: '#ff007f',
      selectionBackground: '#381442',
      black: '#0d0f18',
      red: '#ff0055',
      green: '#00ff66',
      yellow: '#ffcc00',
      blue: '#00ccff',
      magenta: '#ff007f',
      cyan: '#00ffcc',
      white: '#e0f7fa',
      brightBlack: '#2a2f45',
      brightRed: '#ff3377',
      brightGreen: '#33ff88',
      brightYellow: '#ffdd33',
      brightBlue: '#33d6ff',
      brightMagenta: '#ff3399',
      brightCyan: '#33ffd6',
      brightWhite: '#ffffff',
    },
  },
];

export function applyTheme(themeId: string, opacity: number = 0.95): AetherTheme {
  const theme = AETHER_THEMES.find((t) => t.id === themeId) || AETHER_THEMES[0];
  const root = document.documentElement;

  root.style.setProperty('--color-bg', theme.bg);
  root.style.setProperty('--color-bg-dark', theme.bgDark);
  root.style.setProperty('--color-panel', theme.panel);
  root.style.setProperty('--color-border', theme.border);
  root.style.setProperty('--color-fg', theme.fg);
  root.style.setProperty('--color-blue', theme.accent);

  document.body.style.backgroundColor = `rgba(${hexToRgb(theme.bgDark)}, ${opacity})`;

  try {
    localStorage.setItem('aether_theme', theme.id);
    localStorage.setItem('aether_opacity', opacity.toString());
  } catch (e) {}

  return theme;
}

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }
  return '22, 22, 30';
}
