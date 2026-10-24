import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ----------------------------------------------------------------------------
// Set up minimal mock browser environment for Node.js unit testing
// ----------------------------------------------------------------------------
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

const eventListeners: Record<string, ((e: any) => void)[]> = {};
const mockWindow = {
  addEventListener: (event: string, cb: (e: any) => void) => {
    eventListeners[event] = eventListeners[event] || [];
    eventListeners[event].push(cb);
  },
  removeEventListener: (event: string, cb: (e: any) => void) => {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event].filter((l) => l !== cb);
    }
  },
  dispatchEvent: (event: any) => {
    for (const cb of eventListeners[event.type] || []) {
      cb(event);
    }
  },
};

const rootProperties: Record<string, string> = {};
const rootClasses = new Set<string>();

const mockDocument = {
  documentElement: {
    style: {
      setProperty: (prop: string, val: string) => {
        rootProperties[prop] = val;
      },
      getPropertyValue: (prop: string) => rootProperties[prop] || '',
    },
    classList: {
      add: (cls: string) => rootClasses.add(cls),
      remove: (cls: string) => rootClasses.delete(cls),
      contains: (cls: string) => rootClasses.has(cls),
    },
  },
  body: {
    style: {
      backgroundColor: '',
    },
  },
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = mockWindow;
(globalThis as any).document = mockDocument;

import jitiFactory from 'jiti';
const jiti = jitiFactory(import.meta.url);
const aetherStore = jiti('../src/stores/aetherStore.ts');
const themesUtil = jiti('../src/utils/themes.ts');

const {
  toggleSidebar,
  toggleAetherDriveSidebar,
  toggleAiAssistant,
  toggleSidebarMinimized,
  setAetherTheme,
  getAetherState,
} = aetherStore;

const { AETHER_THEMES, applyTheme } = themesUtil;

describe('Milestone 1: Brand Identity, Design Tokens & Persistent Sidebar Unit Tests', () => {
  beforeEach(() => {
    storageMap.clear();
    for (const key of Object.keys(rootProperties)) {
      delete rootProperties[key];
    }
    rootClasses.clear();
  });

  describe('1. Brand Design Tokens & Palette Specifications', () => {
    it('defines aethercortex-dark and aethercortex-light as the primary themes', () => {
      const darkTheme = AETHER_THEMES.find((t: any) => t.id === 'aethercortex-dark');
      const lightTheme = AETHER_THEMES.find((t: any) => t.id === 'aethercortex-light');

      assert.ok(darkTheme, 'aethercortex-dark must be defined in AETHER_THEMES');
      assert.ok(lightTheme, 'aethercortex-light must be defined in AETHER_THEMES');

      // Verify Dark Mode palette tokens
      assert.equal(darkTheme.accent, '#00F0FF');
      assert.equal(darkTheme.bgDark, '#050809');
      assert.equal(darkTheme.bg, '#0B1013');
      assert.equal(darkTheme.panel, '#0E1418');
      assert.equal(darkTheme.border, '#162026');
      assert.equal(darkTheme.fg, '#F8FAFC');

      // Verify Light Mode palette tokens with high-contrast cyan
      assert.equal(lightTheme.accent, '#00A3AD');
      assert.equal(lightTheme.bgDark, '#FFFFFF');
      assert.equal(lightTheme.bg, '#F8F9FA');
      assert.equal(lightTheme.panel, '#F1F4F6');
      assert.equal(lightTheme.border, '#CBD5E1');
      assert.equal(lightTheme.fg, '#1E3A8A');
    });

    it('applyTheme updates CSS variables and persists selection to localStorage', () => {
      applyTheme('aethercortex-dark');
      assert.equal(storageMap.get('aether_theme'), 'aethercortex-dark');
      assert.equal(rootProperties['--cortex-accent'], '#00F0FF');
      assert.equal(rootClasses.has('dark-mode'), true);
      assert.equal(rootClasses.has('light-mode'), false);

      applyTheme('aethercortex-light');
      assert.equal(storageMap.get('aether_theme'), 'aethercortex-light');
      assert.equal(rootProperties['--cortex-accent'], '#00A3AD');
      assert.equal(rootClasses.has('light-mode'), true);
      assert.equal(rootClasses.has('dark-mode'), false);
    });
  });

  describe('2. Store Defaults, Persistence & Navigation Actions', () => {
    it('defaults currentTheme to aethercortex-dark in aetherStore', () => {
      const state = getAetherState();
      assert.equal(state.currentTheme, 'aethercortex-dark');
    });

    it('setAetherTheme persists selection and updates global store state', () => {
      setAetherTheme('aethercortex-light');
      const state = getAetherState();
      assert.equal(state.currentTheme, 'aethercortex-light');
      assert.equal(storageMap.get('aether_theme'), 'aethercortex-light');

      // Reset to dark
      setAetherTheme('aethercortex-dark');
      assert.equal(getAetherState().currentTheme, 'aethercortex-dark');
    });

    it('toggleAiAssistant correctly toggles state and persists to localStorage', () => {
      toggleAiAssistant(true);
      assert.equal(getAetherState().aiAssistantOpen, true);
      assert.equal(storageMap.get('aether_ai_assistant_open'), 'true');

      toggleAiAssistant(false);
      assert.equal(getAetherState().aiAssistantOpen, false);
      assert.equal(storageMap.get('aether_ai_assistant_open'), 'false');

      toggleAiAssistant();
      assert.equal(getAetherState().aiAssistantOpen, true);
    });

    it('toggleSidebar aliases toggleAetherDriveSidebar', () => {
      assert.equal(typeof toggleSidebar, 'function');
      toggleSidebar(true);
      assert.equal(getAetherState().aetherDriveSidebarOpen, true);
      assert.equal(storageMap.get('aether_drive_sidebar_open'), 'true');

      toggleSidebar(false);
      assert.equal(getAetherState().aetherDriveSidebarOpen, false);
      assert.equal(storageMap.get('aether_drive_sidebar_open'), 'false');
    });
  });

  describe('3. Component Architecture & Typography Compliance', () => {
    it('PersistentLeftSidebar file exists and exports valid React component & logo', () => {
      const sidebarPath = path.resolve(__dirname, '../src/components/PersistentLeftSidebar.tsx');
      assert.ok(fs.existsSync(sidebarPath), 'PersistentLeftSidebar.tsx must exist');

      const content = fs.readFileSync(sidebarPath, 'utf8');
      assert.ok(content.includes('export const PersistentLeftSidebar'), 'Must export PersistentLeftSidebar');
      assert.ok(content.includes('export const AetherCortexLogo'), 'Must export AetherCortexLogo');
      assert.ok(content.includes('BETTER TOOLS.'), 'Must contain branding slogan');
      assert.ok(content.includes('BIGGER POSSIBILITIES.'), 'Must contain branding slogan');
      assert.ok(content.includes('///'), 'Must contain 3 diagonal slashes');
      assert.ok(content.includes('Terminal'), 'Must contain Terminal navigation item');
      assert.ok(content.includes('AI Assistant'), 'Must contain AI Assistant navigation item');
      assert.ok(content.includes('Workspace'), 'Must contain Workspace navigation item');
      assert.ok(content.includes('Settings'), 'Must contain Settings navigation item');
    });

    it('removes global font-mono from ui/index.html body and updates title', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf8');

      assert.ok(html.includes('<title>AetherCortex</title>'), 'Title must be AetherCortex');
      assert.ok(!html.includes('body class="bg-tokyo-bgDark text-tokyo-fg overflow-hidden font-mono antialiased"'), 'Must not have font-mono on body');
      assert.ok(html.includes('font-sans'), 'Body must use font-sans');
    });

    it('defines cortex design tokens in tailwind.config.js', () => {
      const twPath = path.resolve(__dirname, '../tailwind.config.js');
      const tw = fs.readFileSync(twPath, 'utf8');

      assert.ok(tw.includes('cortex:'), 'Tailwind config must include cortex colors');
      assert.ok(tw.includes("accent: 'var(--cortex-accent)'"), 'Must define cortex accent');
      assert.ok(tw.includes("sans: ['Inter'"), 'Must define sans fontFamily');
    });
  });

  describe('4. Strict Copy Restriction ("BYOK" Ban)', () => {
    it('ensures zero occurrences of prohibited BYOK copy across all UI and test files', () => {
      const filesToCheck = [
        path.resolve(__dirname, '../src/main.tsx'),
        path.resolve(__dirname, '../src/components/PersistentLeftSidebar.tsx'),
        path.resolve(__dirname, '../src/components/OrchestratorBar.tsx'),
        path.resolve(__dirname, '../src/components/AiSettingsModal.tsx'),
        path.resolve(__dirname, 'aiPilot.test.ts'),
        path.resolve(__dirname, '../../crates/aetherd/src/ai_pilot/supervisor.rs'),
      ];

      for (const filePath of filesToCheck) {
        assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(/BYOK/i);
        assert.equal(
          match,
          null,
          `Prohibited copy "BYOK" found in ${filePath}!`
        );
      }
    });
  });

  describe('5. Zero-Emoji Compliance', () => {
    it('verifies 0 emoji characters in core documentation files', () => {
      const emojiRegex = /\p{Extended_Pictographic}/u;
      const docsToCheck = [
        path.resolve(__dirname, '../../README.md'),
        path.resolve(__dirname, '../../CONTRIBUTING.md'),
        path.resolve(__dirname, '../../SECURITY.md'),
        path.resolve(__dirname, '../../TEST_READY.md'),
        path.resolve(__dirname, '../../HANDOFF.md'),
      ];

      for (const docPath of docsToCheck) {
        assert.ok(fs.existsSync(docPath), `Doc file must exist: ${docPath}`);
        const content = fs.readFileSync(docPath, 'utf8');
        const emojisFound: string[] = [];
        for (const ch of content) {
          if (emojiRegex.test(ch)) {
            emojisFound.push(ch);
          }
        }
        assert.equal(
          emojisFound.length,
          0,
          `Found emojis ${JSON.stringify(emojisFound)} in ${docPath}!`
        );
      }
    });
  });

  describe('6. Persistent Left Sidebar Minimization & Collapse Tests', () => {
    it('verifies sidebar minimize and expand controls in PersistentLeftSidebar and TopBar', () => {
      const sidebarPath = path.resolve(__dirname, '../src/components/PersistentLeftSidebar.tsx');
      const topBarPath = path.resolve(__dirname, '../src/components/TopBar.tsx');
      const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
      const topBarContent = fs.readFileSync(topBarPath, 'utf8');

      assert.ok(sidebarContent.includes('data-testid="btn-minimize-sidebar"'), 'Must have minimize button');
      assert.ok(sidebarContent.includes('data-testid="btn-expand-sidebar"'), 'Must have expand button');
      assert.ok(sidebarContent.includes("isMinimized ? 'w-16'"), 'Must prioritize w-16 when isMinimized is true');
      assert.ok(topBarContent.includes('data-testid="btn-topbar-toggle-sidebar"'), 'TopBar must have sidebar toggle');
    });

    it('verifies toggleSidebarMinimized mutates store state and persists to storage', () => {
      const stateBefore = getAetherState().sidebarMinimized;
      toggleSidebarMinimized(true);
      assert.strictEqual(getAetherState().sidebarMinimized, true);
      toggleSidebarMinimized(false);
      assert.strictEqual(getAetherState().sidebarMinimized, false);
      toggleSidebarMinimized(!stateBefore);
      assert.strictEqual(getAetherState().sidebarMinimized, !stateBefore);
      // Restore initial state
      toggleSidebarMinimized(stateBefore);
    });
  });
});

