# Authoritative UI Architecture Survey & Blueprint Report
**Mission**: R1 Brand Identity & Global Layout + R6 Light/Dark Mode Design Tokens  
**Project**: AetherCortex (Elliot)  
**Agent**: UI Layout and Brand Explorer  
**Date**: 2026-10-24  

---

## 1. Executive Summary

This report delivers a comprehensive investigation of the `ui/` frontend codebase for AetherCortex, accompanied by an authoritative, implementation-ready blueprint for **R1 (Brand Identity & Global Layout)** and **R6 (Light Mode and Dark Mode Design Tokens)**.

The current application operates as a multi-pane GPU-accelerated terminal with an integrated file workspace sidebar (`AetherDriveSidebar`), a chrome-style tab bar (`ChromeHeaderTabs`), and command classification. However, the existing UI still carries legacy Tokyo Night palette artifacts, hardcoded terminal styling, monospace interface typography leaks, and scattered toolbar controls.

By adopting a strict **Minimalism + Neo-Brutalism** design system, AetherCortex will transition into a cohesive developer workspace characterized by:
- **Flat solid surfaces**: Zero gradients, zero glassmorphism (`backdrop-blur` replaced with solid high-contrast panels), zero glowing drop-shadows, and zero decorative clutter.
- **Crisp, high-contrast borders**: 1px borders using `#162026` and `#1F2E36` in Dark Mode, `#CBD5E1` and `#94A3B8` in Light Mode.
- **Dedicated persistent left sidebar**: Houses the SVG AetherCortex brand identity, 4 primary navigation items (`Terminal`, `AI Assistant`, `Workspace`, `Settings`) with active/hover indicators, and bottom mission branding (`| BETTER TOOLS. BIGGER POSSIBILITIES.` and `///`).
- **Strict dual typography**: Sans-serif (`Inter`, system sans) for all interface chrome, navigation, headers, and buttons; Monospace (`JetBrainsMono Nerd Font`, `FiraCode Nerd Font`) strictly scoped to terminal output, code blocks, input bar commands, and keybinding badges (`<kbd>`).
- **Cohesive semantic design tokens**: Dark Mode (`#050809` / `#0B1013` / `#00F0FF`) and Light Mode (`#F8F9FA` / `#FFFFFF` / `#00A3AD`), persisted in `localStorage` and dynamically synchronized with active xterm.js WebGL instances.
- **Zero emoji compliance**: Strict enforcement of SVG icons and geometric text symbols across code, UI, and documentation.

---

## 2. Codebase Baseline & Architectural Survey

### 2.1 File Map & Component Responsibilities

| Path | Primary Responsibility | Current State & Gaps |
|---|---|---|
| `ui/index.html` | HTML document entry point | Contains legacy `<title>AetherTerminal</title>` and `body.font-mono` which forces all UI text into monospace. |
| `ui/tailwind.config.js` | Tailwind utility class mappings | Only extends legacy `tokyo` colors (`#1a1b26`, `#16161e`, etc.) and `mono` font. Lacks `cortex` semantic tokens and sans font. |
| `ui/src/index.css` | Global CSS variables & styling | Defines raw CSS variables but retains hardcoded Tokyo background `rgba(22, 22, 30, 0.95)`, scrollbar `#292e42`, and legacy cyan `#008B94`. |
| `ui/src/main.tsx` | Main application shell & root component | Combines top bar, sidebar toggle, tab management, modals, and main viewport. Directly mounts `AetherDriveSidebar` and `TerminalGrid`. |
| `ui/src/components/ChromeHeaderTabs.tsx` | Chrome-style terminal tabs & new tab trigger | Well-architected tab manager with rename, duplicate, and color context menu. Needs `AI Connected` status pill integration. |
| `ui/src/components/AetherDriveSidebar.tsx` | Workspace file tree, search, and workflows | Collapsible drawer (`w-80`) toggled via `Cmd+\` / `Ctrl+\`. Must integrate smoothly as the target of the `[Workspace] Workspace` nav item. |
| `ui/src/components/TerminalGrid.tsx` | Recursive binary split pane terminal layout | Renders `AgentHeaderPill`, `XtermWebGLPane`, and `ModernInputBar`. Uses hardcoded `bg-tokyo-bgDark` and `border-tokyo-border`. |
| `ui/src/components/XtermWebGLPane.tsx` | Xterm.js instance with WebGL2 acceleration | Hardcodes Tokyo Night dark theme at instantiation (lines 94-115) and does **not** listen to `currentTheme` store updates! |
| `ui/src/components/ModernInputBar.tsx` | Command & AI prompt input bar | Displays user-facing "Modern Input Bar", lacks synchronized model/provider selector, needs placeholder update. |
| `ui/src/components/ThemeModal.tsx` | Appearance and theme switcher modal | Lists themes from `AETHER_THEMES`. Defaults fallback to `'tokyo-night'`. |
| `ui/src/utils/themes.ts` | Theme definitions and `applyTheme()` | Defines `aethercortex-dark` and `aethercortex-light`. Light mode accent is currently `#008B94` instead of required `#00A3AD`. |
| `ui/src/stores/aetherStore.ts` | Global Zustand/vanilla state store | Line 254 defaults `currentTheme` fallback to `'tokyo-night'`. Handles `aetherDriveSidebarOpen`, tabs, splits, and IPC. |

### 2.2 Current Layout Hierarchy in `main.tsx`

```tsx
<div className="flex flex-col h-screen w-screen bg-slate-950 font-mono">
  {/* Top Header (10 units high) with logo, drive toggle, tabs, and action tools */}
  <header className="h-10 bg-slate-900/90 backdrop-blur border-b border-slate-800/80 px-3 flex items-center justify-between">
    <div className="brand">AETHER//TERM</div>
    <button onClick={toggleAetherDriveSidebar}>Drive</button>
    <ChromeHeaderTabs />
    <GlobalActionToolbar />
  </header>

  {/* Main content area */}
  <main className="flex-1 w-full relative overflow-hidden bg-slate-950 flex flex-row">
    <AetherDriveSidebar />
    <div className="flex-1 h-full relative overflow-hidden min-w-0">
      <TerminalGrid registerTermWriter={registerTermWriter} />
    </div>
  </main>

  {/* Bottom status footer */}
  <footer className="h-6 bg-slate-950 border-t border-slate-800/80 px-3 flex items-center justify-between">
    <ActivePaneInfo />
    <KeybindingsCheatSheet />
  </footer>

  {/* Modals and floating drawers */}
  <ModalsAndDrawers />
</div>
```

---

## 3. Critical Gaps & Bugs in Current Implementation

Before laying out the blueprint, our investigation identified several acute bugs and spec violations in the existing frontend:

### 3.1 Hardcoded Theme Fallback Bug
- **Location**: `ui/src/stores/aetherStore.ts:254` and `ui/src/components/ThemeModal.tsx:13`
- **Current Code**:
  ```ts
  currentTheme: typeof localStorage !== 'undefined' ? (localStorage.getItem('aether_theme') || 'tokyo-night') : 'tokyo-night'
  ```
- **Issue**: Any fresh launch or cleared localStorage defaults to `'tokyo-night'` rather than the flagship `'aethercortex-dark'`.
- **Resolution**: Change fallback to `'aethercortex-dark'`.

### 3.2 Terminal Theme Desynchronization Bug
- **Location**: `ui/src/components/XtermWebGLPane.tsx:94-115`
- **Issue**: `XtermWebGLPane` constructs `new Terminal({ theme: { ... } })` with a static inline Tokyo Night color scheme. It does **not** subscribe to `store.currentTheme` or update `term.options.theme` when users toggle between Dark Mode and Light Mode.
- **Resolution**: Add an effect in `XtermWebGLPane` watching `store.currentTheme`:
  ```ts
  useEffect(() => {
    if (!termRef.current) return;
    const activeTheme = AETHER_THEMES.find((t) => t.id === store.currentTheme) || AETHER_THEMES[0];
    termRef.current.options.theme = activeTheme.xterm;
  }, [store.currentTheme]);
  ```

### 3.3 Typography Leakage Bug
- **Location**: `ui/index.html:9` and `ui/src/main.tsx:129`
- **Issue**: `font-mono` is applied to `<body class="... font-mono ...">` and outer `App` `div`. Consequently, all button labels, tab titles, modal text, and headers render in monospace.
- **Specification (R1)**: "Typography: sans-serif for interface labels and monospace for terminal output and code."
- **Resolution**: Change root to `font-sans` (`Inter`, system sans). Apply `font-mono` specifically to `XtermWebGLPane`, code blocks, `<kbd>`, and command input text.

### 3.4 Forbidden Copy Violations: "BYOK" (5 Instances)
The authoritative request strictly specifies:
> *"Strict UI copy restriction: Never display the term 'BYOK' anywhere in the application UI (use 'API Key', 'Provider Settings', or 'Connection Settings')."*

The following 5 instances violate this rule:
1. `ui/src/components/AiSettingsModal.tsx:192`: `<span>Native AI Pilot & Multi-Provider BYOK</span>`
2. `ui/src/components/AiSettingsModal.tsx:289`: `<span>API Key (BYOK)</span>`
3. `ui/src/main.tsx:463`: `title="Aether Native AI Pilot & Multi-Provider BYOK Settings"`
4. `ui/src/components/OrchestratorBar.tsx:185`: `title="Configure BYOK Provider and API Keys"`
5. `ui/src/components/OrchestratorBar.tsx:188`: `<span>BYOK Settings</span>`

### 3.5 Light Mode Accent Mismatch
- **Location**: `ui/src/utils/themes.ts:77` and `ui/src/index.css:29-31`
- **Current Value**: `#008B94`
- **Requirement (R6)**: "Light Mode (`#F8F9FA` / `#FFFFFF` / high-contrast cyan `#00A3AD`)."
- **Resolution**: Update light mode accent token to `#00A3AD`.

---

## 4. Authoritative Blueprint: R1 (Brand Identity & Global Layout)

### 4.1 Minimalism + Neo-Brutalism Design Principles

1. **Flat Solid Geometry**:
   - Zero gradients (`no bg-gradient-to-*`).
   - Zero glassmorphism: Replace `backdrop-blur` and translucent overlays (`bg-slate-900/90`) with opaque solid panels (`bg-cortex-surface1`, `bg-cortex-bgAlt`).
   - Zero glowing shadows: Remove `shadow-cyan-500/20` and `drop-shadow`.
   - Use crisp, razor-sharp 1px borders (`border-cortex-border`, `border-cortex-borderStrong`).
2. **Color Palette Mapping**:
   - Primary Accent: Cosmic Cyan `#00F0FF` (Dark) / High-Contrast Cyan `#00A3AD` (Light).
   - Base Background: Near-black `#050809` (Dark) / Pure White `#FFFFFF` (Light).
   - Secondary Background: Charcoal `#0B1013` (Dark) / Off-white `#F8F9FA` (Light).
   - Surface Panels: Contrast panel 1 `#0E1418` (Dark) / `#F1F4F6` (Light), panel 2 `#121A1F` (Dark) / `#E5E9EC` (Light).
   - Text: Off-white `#F8F9FA` (Dark) / Near-black `#050809` (Light); Muted gray `#8E9BA4` (Dark) / `#5A6872` (Light).
   - Borders: Crisp high-contrast `#162026` & `#1F2E36` (Dark) / `#CBD5E1` & `#94A3B8` (Light).
3. **Typography**:
   - Sans-serif font stack for interface labels: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
   - Monospace font stack for terminal and code: `'JetBrainsMono Nerd Font', 'FiraCode Nerd Font', ui-monospace, Menlo, Monaco, Consolas, monospace`.

### 4.2 Persistent Left Sidebar Specification

#### Layout Structure & Dimensions
- **Position**: Anchored to the far left of the viewport, full window height (`h-screen`), fixed width `w-56` (14rem / 224px), shrink-0.
- **Background**: Solid Charcoal `var(--cortex-bg-alt)` (`#0B1013` in Dark Mode, `#F8F9FA` in Light Mode).
- **Right Border**: 1px crisp line `var(--cortex-border)` (`#162026` in Dark Mode, `#CBD5E1` in Light Mode).
- **Z-Index**: `z-30`.

#### Sections

```
+-------------------------------------------------------------+
| [Logo] AetherCortex                                         |  <-- Top Brand Header (h-14)
|-------------------------------------------------------------|
|                                                             |
|  [>_]  Terminal                 (Active indicator bar)      |
|  [[AI]]   AI Assistant                                         |  <-- Navigation Items (h-10 each)
|  [[Workspace]]  Workspace                                            |
|  [[Settings]]   Settings                                             |
|                                                             |
|  (flex-1 vertical spacer)                                   |
|                                                             |
|-------------------------------------------------------------|
| | BETTER TOOLS.                                             |  <-- Bottom Branding
|   BIGGER POSSIBILITIES.                                     |
| ///                                                         |
+-------------------------------------------------------------+
```

1. **Brand Header**:
   - Height: `h-14` (3.5rem / 56px), padding `px-4 flex items-center gap-3 border-b border-cortex-border`.
   - **AetherCortex Logo Component** (`AetherCortexLogo.tsx`):
     - Dimensions: `w-7 h-7` (28x28px).
     - Visual: Pure white letter `A` stylized in geometric neo-brutalist glyph, surrounded by a 1.5px Cosmic Cyan (`#00F0FF`) elliptical orbit path, with a crisp 4-point sparkle star positioned at the upper orbit apex.
     - Implemented as a clean inline SVG vector (resolution-independent, zero external asset dependencies).
   - **Brand Title**:
     - Text: `AetherCortex`.
     - Typography: `font-sans font-bold text-sm tracking-tight text-cortex-text`.
2. **Navigation Items**:
   - 4 Items:
     1. `>_ Terminal`: Activates / focuses the main terminal viewport.
     2. `[AI] AI Assistant`: Toggles the side-by-side AI conversation panel.
     3. `[Workspace] Workspace`: Toggles the `AetherDriveSidebar` file drawer (`Cmd+\` / `Ctrl+\`).
     4. `[Settings] Settings`: Opens provider & theme settings modal (`Cmd+,` / `Ctrl+,`).
   - **Active State Indicator**:
     - A vertical 2px Cosmic Cyan line (`bg-cortex-accent`) anchored on the left edge (`absolute left-0 top-1 bottom-1 w-[2px] bg-cortex-accent`).
     - Background: Solid `bg-cortex-surface1` (`#0E1418` in Dark Mode).
     - Text color: `text-cortex-text` (`#F8F9FA`).
     - Icon color: `text-cortex-accent` (`#00F0FF`).
   - **Hover State**:
     - Background: `hover:bg-cortex-surface2` (`#121A1F`).
     - Text color: `hover:text-cortex-text`.
     - Transition: Instant crisp border and background switch (`transition-colors duration-100`).
   - **Zero Emoji Compliance**:
     - Never use unicode emojis in icon rendering!
     - `>_ Terminal`: Clean `<Terminal className="w-4 h-4 text-cortex-accent" />` or stylized `>_` glyph in monospace.
     - `[AI] AI Assistant`: Clean `<Sparkles className="w-4 h-4 text-cortex-accent" />`.
     - `[Workspace] Workspace`: Clean `<FolderTree className="w-4 h-4 text-cortex-textMuted" />`.
     - `[Settings] Settings`: Clean `<Settings className="w-4 h-4 text-cortex-textMuted" />`.
3. **Bottom Branding Section**:
   - Padding: `p-4 border-t border-cortex-border bg-cortex-bgAlt`.
   - **Vertical Accent Bar & Slogan**:
     - Flex container: `flex items-start gap-2.5 mb-2`.
     - Cyan Bar: `w-[2px] h-7 bg-cortex-accent shrink-0 rounded-none`.
     - Slogan:
       ```
       BETTER TOOLS.
       BIGGER POSSIBILITIES.
       ```
       Typography: `text-[9px] font-sans font-bold uppercase tracking-widest text-cortex-textMuted leading-tight select-none`.
   - **3 Diagonal Slashes**:
     - Text: `///`.
     - Typography: `text-xs font-mono font-bold tracking-widest text-cortex-accent select-none`.

---

## 5. Global Layout Coordination & Component Architecture

### 5.1 Three-Column Desktop Layout Structure

```
+--------------------------------------------------------------------------------------------------------------------------+
| Persistent Left Sidebar | Main Application Shell                                                                         |
| (w-56, fixed)           |                                                                                                |
|                         | Top Bar (h-10):                                                                                |
|                         |   [Tabs: Tab 1, Tab 2...] [+]   | [AI Connected Pill] | [Split Pane / Actions / Window]        |
|                         |------------------------------------------------------------------------------------------------|
|                         | Content Viewport (flex-1 flex flex-row min-h-0 overflow-hidden):                               |
|                         |   +-------------------+  +---------------------------------------+  +------------------------+ |
|                         |   | AetherDrive       |  | Main Terminal                         |  | AI Assistant Panel     | |
|                         |   | Workspace Drawer  |  | (TerminalGrid: multi-pane splits,     |  | (Side-by-side          | |
|                         |   | (w-72 or w-80,    |  |  xterm.js WebGL,                      |  |  collapsible chat,     | |
|                         |   |  collapsible via  |  |  Input Bar)                           |  |  markdown, code copy)  | |
|                         |   |  'Workspace' nav  |  |                                       |  | (w-96, collapsible via | |
|                         |   |  or Cmd+\)        |  | (flex-1 min-w-0)                      |  |  'AI Assistant' nav)   | |
|                         |   +-------------------+  +---------------------------------------+  +------------------------+ |
|                         |------------------------------------------------------------------------------------------------|
|                         | Bottom Status Bar (h-6):                                                                       |
|                         |   ACTIVE: pane_1 (running) | DIR: /project | PORTS: 8080      Ctrl+P  Ctrl+T  Cmd+D            |
+--------------------------------------------------------------------------------------------------------------------------+
```

### 5.2 Coordination with `AetherDriveSidebar`
- `AetherDriveSidebar` currently renders inside `<main className="flex-row">`.
- It acts as the **Workspace Drawer** displaying the active worktree directory tree, workspace search, and markdown workflows.
- In the new layout:
  - When the user clicks `[Workspace] Workspace` in the persistent left sidebar, it calls `toggleAetherDriveSidebar()`.
  - The drawer slides open immediately adjacent to the persistent left sidebar.
  - When closed, it unmounts from the flex row without affecting terminal PTY sessions or layout ratios.
  - Keyboard shortcut `Cmd+\` / `Ctrl+\` toggles this drawer without requiring mouse interaction.
  - State persistence in `localStorage.getItem('aether_drive_sidebar_open')` remains fully intact.

### 5.3 Coordination with AI Assistant Panel (R3)
- The AI Assistant panel is positioned side-by-side on the right of the main terminal.
- Clicking `[AI] AI Assistant` in the persistent left sidebar toggles `aiAssistantOpen` in `aetherStore`.
- The main terminal automatically flexes to share the horizontal width. When the panel is toggled, `window.dispatchEvent(new Event('resize'))` or `fitAddon.fit()` recalculates the PTY rows and columns cleanly.

### 5.4 Top Header Bar Refactoring (R2)
- Reorganize the top bar (`header` in `main.tsx`) to house:
  1. Terminal tab buttons (`ChromeHeaderTabs`).
  2. New Tab button (`+`).
  3. **`AI Connected` status pill** (Requirement R2):
     ```tsx
     <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-cortex-border bg-cortex-surface1 text-[11px] font-sans">
       <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
       <span className="text-cortex-textMuted font-medium">AI Connected</span>
     </div>
     ```
  4. Quick action buttons: Split Vertical (`Alt+V`), Split Horizontal (`Alt+S`), Equalize Panes (`Alt+E`), Command Palette (`Ctrl+P`).

---

## 6. Authoritative Blueprint: R6 (Light Mode & Dark Mode Design Tokens)

### 6.1 Semantic Token Definition in `ui/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ==========================================================================
   AetherCortex Semantic Design Tokens (Minimalism + Neo-Brutalism)
   ========================================================================== */

:root,
:root.dark-mode {
  /* Dark Mode Tokens (Primary Specification) */
  --cortex-bg: #050809;             /* Near-black primary background */
  --cortex-bg-alt: #0B1013;         /* Charcoal secondary background / sidebar */
  --cortex-surface-1: #0E1418;      /* Dark panel with subtle contrast */
  --cortex-surface-2: #121A1F;      /* Secondary panel surface / hover state */
  --cortex-border: #162026;         /* Thin crisp line border */
  --cortex-border-strong: #1F2E36;  /* High-contrast divider line */
  --cortex-text: #F8F9FA;           /* Off-white primary text */
  --cortex-text-muted: #8E9BA4;     /* Muted gray secondary text */
  --cortex-accent: #00F0FF;         /* Cosmic Cyan primary accent */
  --cortex-accent-hover: #38F4FF;   /* Accent hover highlight */
  --cortex-accent-muted: rgba(0, 240, 255, 0.12); /* Subtle highlight */
  --cortex-error: #FF3B5C;          /* Crisp red for errors */
  --cortex-success: #00E599;        /* Crisp green for success */
  --cortex-warning: #FFB800;        /* Crisp amber for warnings */

  /* Backward compatibility alias bindings */
  --color-bg: var(--cortex-bg-alt);
  --color-bg-dark: var(--cortex-bg);
  --color-panel: var(--cortex-surface-1);
  --color-border: var(--cortex-border);
  --color-fg: var(--cortex-text);
  --color-fg-muted: var(--cortex-text-muted);
  --color-blue: var(--cortex-accent);
  --color-cyan: var(--cortex-accent);
  --color-accent: var(--cortex-accent);
}

:root.light-mode {
  /* Light Mode Tokens (Primary Specification) */
  --cortex-bg: #FFFFFF;             /* Pure white primary background */
  --cortex-bg-alt: #F8F9FA;         /* Off-white secondary background / sidebar */
  --cortex-surface-1: #F1F4F6;      /* Light panel with subtle contrast */
  --cortex-surface-2: #E5E9EC;      /* Secondary panel surface / hover state */
  --cortex-border: #CBD5E1;         /* Thin crisp line border */
  --cortex-border-strong: #94A3B8;  /* High-contrast divider line */
  --cortex-text: #050809;           /* Near-black primary text */
  --cortex-text-muted: #5A6872;     /* Muted slate secondary text */
  --cortex-accent: #00A3AD;         /* High-contrast Cosmic Cyan */
  --cortex-accent-hover: #008790;   /* Accent hover highlight */
  --cortex-accent-muted: rgba(0, 163, 173, 0.12); /* Subtle highlight */
  --cortex-error: #DC2626;          /* Crisp red for errors */
  --cortex-success: #059669;        /* Crisp green for success */
  --cortex-warning: #D97706;        /* Crisp amber for warnings */

  /* Backward compatibility alias bindings */
  --color-bg: var(--cortex-bg-alt);
  --color-bg-dark: var(--cortex-bg);
  --color-panel: var(--cortex-surface-1);
  --color-border: var(--cortex-border);
  --color-fg: var(--cortex-text);
  --color-fg-muted: var(--cortex-text-muted);
  --color-blue: var(--cortex-accent);
  --color-cyan: var(--cortex-accent);
  --color-accent: var(--cortex-accent);
}

body {
  background-color: var(--cortex-bg);
  color: var(--cortex-text);
  user-select: none;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* Crisp Neo-Brutalist scrollbars */
::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--cortex-border-strong);
  border-radius: 0;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--cortex-accent);
}
```

### 6.2 Tailwind Integration in `ui/tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '.dark-mode'],
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
        mono: ['"JetBrainsMono Nerd Font"', '"FiraCode Nerd Font"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      }
    },
  },
  plugins: [],
}
```

### 6.3 LocalStorage Persistence Flow & Bootstrap Synchronization

1. **Bootstrap Initialization**:
   In `ui/src/stores/aetherStore.ts`:
   ```ts
   // Initialize theme fallback: 'aethercortex-dark'
   currentTheme: typeof localStorage !== 'undefined'
     ? (localStorage.getItem('aether_theme') || 'aethercortex-dark')
     : 'aethercortex-dark',
   ```
2. **Apply Theme Function** in `ui/src/utils/themes.ts`:
   - Adds `.dark-mode` or `.light-mode` to `document.documentElement`.
   - Writes `localStorage.setItem('aether_theme', themeId)`.
   - Updates CSS variables on root.
   - Updates `document.body.style.backgroundColor = theme.bgDark`.
3. **Reactive Broadcast to XTerm**:
   - Every `XtermWebGLPane` instance listens to `store.currentTheme` and updates `term.options.theme = activeTheme.xterm` immediately.

---

## 7. Component Blueprint: `PersistentLeftSidebar.tsx`

The following complete, drop-in React component implements all specifications of R1 without any emoji characters:

```tsx
import React from 'react';
import {
  useAetherStore,
  toggleAetherDriveSidebar,
  toggleAiSettings,
} from '../stores/aetherStore';
import {
  Terminal,
  Sparkles,
  FolderTree,
  Settings,
} from 'lucide-react';

interface Props {
  activeSection?: 'terminal' | 'assistant' | 'workspace' | 'settings';
  onSelectSection?: (section: 'terminal' | 'assistant' | 'workspace' | 'settings') => void;
  onToggleAiAssistant?: () => void;
  aiAssistantOpen?: boolean;
}

/**
 * Clean SVG Vector AetherCortex Logo:
 * Pure white letter 'A' with a cosmic cyan orbit swoosh and sparkle star.
 */
export const AetherCortexLogo: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0 select-none`}
    aria-label="AetherCortex Logo"
  >
    {/* Cosmic Cyan Orbit Swoosh */}
    <ellipse
      cx="50"
      cy="52"
      rx="42"
      ry="16"
      stroke="#00F0FF"
      strokeWidth="2.5"
      transform="rotate(-24 50 52)"
      strokeDasharray="180 30"
      strokeLinecap="round"
    />

    {/* Neo-Brutalist Geometric White Letter A */}
    <path
      d="M50 18L26 80H37.5L43 65H57L62.5 80H74L50 18ZM46.5 54.5L50 43.5L53.5 54.5H46.5Z"
      fill="#F8F9FA"
    />

    {/* Sparkle Star at Orbit Apex */}
    <path
      d="M74 25L75.5 30L80.5 31.5L75.5 33L74 38L72.5 33L67.5 31.5L72.5 30L74 25Z"
      fill="#00F0FF"
    />
  </svg>
);

export const PersistentLeftSidebar: React.FC<Props> = ({
  activeSection = 'terminal',
  onSelectSection,
  onToggleAiAssistant,
  aiAssistantOpen = false,
}) => {
  const store = useAetherStore();

  const handleNavClick = (section: 'terminal' | 'assistant' | 'workspace' | 'settings') => {
    if (onSelectSection) {
      onSelectSection(section);
    }
    if (section === 'workspace') {
      toggleAetherDriveSidebar();
    } else if (section === 'assistant') {
      if (onToggleAiAssistant) {
        onToggleAiAssistant();
      }
    } else if (section === 'settings') {
      toggleAiSettings(true);
    }
  };

  const isWorkspaceActive = store.aetherDriveSidebarOpen;
  const isAssistantActive = aiAssistantOpen;
  const isSettingsActive = store.aiSettingsOpen || store.themeModalOpen;
  const isTerminalActive = !isWorkspaceActive && !isAssistantActive && !isSettingsActive;

  return (
    <aside
      className="w-56 h-screen flex flex-col justify-between shrink-0 select-none bg-cortex-bgAlt border-r border-cortex-border font-sans z-30"
      data-testid="persistent-left-sidebar"
    >
      {/* Top: Brand Header & Navigation */}
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="h-14 px-4 flex items-center gap-3 border-b border-cortex-border">
          <AetherCortexLogo className="w-7 h-7" />
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-cortex-text">
              AetherCortex
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-2 space-y-1" aria-label="Main Navigation">
          {/* 1. Terminal */}
          <button
            onClick={() => handleNavClick('terminal')}
            className={`w-full relative flex items-center gap-3 px-3 py-2 text-xs font-medium transition-colors text-left ${
              isTerminalActive
                ? 'bg-cortex-surface1 text-cortex-text font-semibold'
                : 'text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2'
            }`}
            data-testid="nav-terminal"
          >
            {isTerminalActive && (
              <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-cortex-accent" />
            )}
            <Terminal className="w-4 h-4 text-cortex-accent shrink-0" />
            <span>Terminal</span>
          </button>

          {/* 2. AI Assistant */}
          <button
            onClick={() => handleNavClick('assistant')}
            className={`w-full relative flex items-center gap-3 px-3 py-2 text-xs font-medium transition-colors text-left ${
              isAssistantActive
                ? 'bg-cortex-surface1 text-cortex-text font-semibold'
                : 'text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2'
            }`}
            data-testid="nav-assistant"
          >
            {isAssistantActive && (
              <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-cortex-accent" />
            )}
            <Sparkles className="w-4 h-4 text-cortex-accent shrink-0" />
            <span>AI Assistant</span>
          </button>

          {/* 3. Workspace */}
          <button
            onClick={() => handleNavClick('workspace')}
            className={`w-full relative flex items-center gap-3 px-3 py-2 text-xs font-medium transition-colors text-left ${
              isWorkspaceActive
                ? 'bg-cortex-surface1 text-cortex-text font-semibold'
                : 'text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2'
            }`}
            data-testid="nav-workspace"
          >
            {isWorkspaceActive && (
              <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-cortex-accent" />
            )}
            <FolderTree className="w-4 h-4 text-cortex-textMuted shrink-0" />
            <div className="flex-1 flex items-center justify-between">
              <span>Workspace</span>
              <kbd className="text-[9px] font-mono px-1 py-0.2 bg-cortex-surface2 border border-cortex-border text-cortex-textMuted">
                Ctrl+\
              </kbd>
            </div>
          </button>

          {/* 4. Settings */}
          <button
            onClick={() => handleNavClick('settings')}
            className={`w-full relative flex items-center gap-3 px-3 py-2 text-xs font-medium transition-colors text-left ${
              isSettingsActive
                ? 'bg-cortex-surface1 text-cortex-text font-semibold'
                : 'text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2'
            }`}
            data-testid="nav-settings"
          >
            {isSettingsActive && (
              <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-cortex-accent" />
            )}
            <Settings className="w-4 h-4 text-cortex-textMuted shrink-0" />
            <span>Settings</span>
          </button>
        </nav>
      </div>

      {/* Bottom: Neo-Brutalist Branding */}
      <div className="p-4 border-t border-cortex-border bg-cortex-bgAlt">
        <div className="flex items-start gap-2.5 mb-2">
          {/* Vertical Cyan Accent Bar */}
          <span className="w-[2px] h-7 bg-cortex-accent shrink-0" />
          <div className="flex flex-col text-[9px] font-sans font-bold uppercase tracking-wider text-cortex-textMuted leading-tight">
            <span>BETTER TOOLS.</span>
            <span>BIGGER POSSIBILITIES.</span>
          </div>
        </div>

        {/* 3 Diagonal Slashes */}
        <div className="text-xs font-mono font-bold tracking-widest text-cortex-accent pl-3">
          ///
        </div>
      </div>
    </aside>
  );
};
```

---

## 7. Step-by-Step Implementation Plan for Codebase Engineers

### Phase 1: Core Tokens & Styling Setup (R6)
1. **Update `ui/tailwind.config.js`**:
   - Add `cortex` color dictionary pointing to CSS variables (`var(--cortex-*)`).
   - Add `fontFamily.sans` with Inter and system stack.
2. **Update `ui/src/index.css`**:
   - Define `--cortex-*` tokens under `:root, :root.dark-mode` and `:root.light-mode`.
   - Update scrollbar and body defaults to use `--cortex-border` and `--cortex-accent`.
3. **Update `ui/src/utils/themes.ts`**:
   - Change `aethercortex-light` accent to `#00A3AD`.
   - Update `applyTheme()` to sync variables and class names.
4. **Update `ui/src/stores/aetherStore.ts`**:
   - Change initial theme fallback from `'tokyo-night'` to `'aethercortex-dark'`.

### Phase 2: Navigation & Persistent Left Sidebar (R1)
1. **Create `ui/src/components/PersistentLeftSidebar.tsx`**:
   - Implement `AetherCortexLogo` inline SVG.
   - Implement 4 nav buttons (`Terminal`, `AI Assistant`, `Workspace`, `Settings`).
   - Implement bottom vertical cyan bar + `BETTER TOOLS. BIGGER POSSIBILITIES.` + `///`.
2. **Mount in `ui/src/main.tsx`**:
   - Restructure outer layout into a horizontal flex container:
     ```tsx
     <div className="flex flex-row h-screen w-screen bg-cortex-bg text-cortex-text font-sans overflow-hidden">
       <PersistentLeftSidebar />
       <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden">
         <header ...>
           <ChromeHeaderTabs />
           {/* AI Connected Status Pill */}
         </header>
         <main ...>
           <AetherDriveSidebar />
           <TerminalGrid />
         </main>
         <footer ... />
       </div>
     </div>
     ```
3. **Update `ui/index.html`**:
   - Change title to `AetherCortex`.
   - Change body class from `bg-tokyo-bgDark text-tokyo-fg font-mono` to `bg-cortex-bg text-cortex-text font-sans antialiased`.

### Phase 3: Cleanup & Quality Verification
1. **Audit & Remove all 5 "BYOK" instances**:
   - Replace with "API Key", "Provider Settings", or "Connection Settings".
2. **Rename "Modern Input Bar"**:
   - Replace user-facing occurrences with "Input Bar".
3. **Verify XTerm Dynamic Theming**:
   - Add `useEffect` in `XtermWebGLPane.tsx` watching `store.currentTheme`.
4. **Run Verification Gates**:
   - `npm run build` in `ui/` -> exit code 0.
   - `node --test ui/tests/*.test.ts` -> 74/74 pass.
   - `cargo check --workspace && cargo test --workspace` -> 86/86 pass.
   - Static audit confirms zero emoji characters.
   - `graphify update .` updates architecture graph.

---

## 8. Verification Matrix

| Acceptance Criterion | Verification Method | Pass Target |
|---|---|---|
| R1 Persistent Left Sidebar | Inspect DOM in `main.tsx` and test rendering | Renders logo, title, 4 items, bottom slogan, and `///` |
| R1 Zero Emojis | Static scanner script | 0 emoji characters in code or comments |
| R1 Typography | CSS computed style on labels vs terminal | Sans-serif on UI labels; monospace on xterm and `<kbd>` |
| R6 Design Tokens | CSS variables audit in DevTools | Dark `#050809`/`#0B1013`/`#00F0FF`, Light `#F8F9FA`/`#FFFFFF`/`#00A3AD` |
| R6 Persistence | localStorage inspect | `localStorage.getItem('aether_theme')` preserves across reloads |
| No BYOK | Ripgrep audit across `ui/src` | 0 occurrences of "BYOK" |
| TypeScript Build | `npm run build` | Exit code 0, 0 TS errors |
| Test Suites | `node --test ui/tests/*.test.ts` | 100% green tests |
