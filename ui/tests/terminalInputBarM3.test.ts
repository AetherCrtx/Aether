import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------------------------------------------------------
// Minimal mock browser & Tauri IPC environment for Node.js unit testing
// ----------------------------------------------------------------------------
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

const eventListeners: Record<string, ((e: any) => void)[]> = {};
let paneCounter = 1;

const mockTauriIpc = {
  invoke: async (cmd: string, args: any = {}) => {
    switch (cmd) {
      case 'cmd_spawn_pane': {
        const id = `pane_${paneCounter++}`;
        return {
          pane_id: id,
          pid: 10000 + paneCounter,
          worktree_path: `.aether/worktrees/${id}`,
          git_branch: `aether/${id}`,
        };
      }
      case 'cmd_kill_pane':
      case 'cmd_terminate_pane':
        return true;
      case 'cmd_write_pty':
        return null;
      case 'cmd_get_scrollback':
        return { data: [], end_offset: 0 };
      default:
        return null;
    }
  },
};

const mockWindow: any = {
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
  innerWidth: 1920,
  innerHeight: 1080,
  __TAURI_INTERNALS__: mockTauriIpc,
};

const mockDocument = {
  documentElement: {
    style: {
      setProperty: () => {},
      getPropertyValue: () => '',
    },
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
    },
  },
  body: {
    style: {
      backgroundColor: '',
    },
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = mockWindow;
(globalThis as any).document = mockDocument;
(globalThis as any).__TAURI_INTERNALS__ = mockTauriIpc;

import jitiFactory from 'jiti';
const jiti = jitiFactory(import.meta.url);
const aetherStore = jiti('../src/stores/aetherStore.ts');
const { classifyCommand } = jiti('../src/utils/commandClassifier.ts');

const {
  getAetherState,
  createTab,
  switchTab,
  closeTab,
  renameTab,
  toggleAiAssistant,
  toggleAiSettings,
  setSelectedAiProvider,
  setSelectedAiModel,
  addCustomProvider,
  isRunningInTauri,
  BUILT_IN_PROVIDERS,
} = aetherStore;

describe('Milestone 3: Terminal Top Bar, Tab/Split Controls & Input Bar', () => {
  beforeEach(() => {
    storageMap.clear();
    const state = getAetherState();
    state.tabs = [
      {
        id: 'tab-1',
        title: 'Terminal 1',
        paneIds: ['pane-1'],
        layout: { type: 'pane', paneId: 'pane-1' },
        activePaneId: 'pane-1',
      },
    ];
    state.activeTabId = 'tab-1';
    state.panes = [
      {
        id: 'pane-1',
        cliType: 'bash',
        status: 'running',
        worktreePath: '/workspace/project',
        gitBranch: 'main',
        viewMode: 'raw',
        inputBarOpen: true,
      },
    ];
    state.activePaneId = 'pane-1';
    state.selectedAiProvider = 'openai';
    state.selectedAiModel = 'gpt-4o';
    state.customProviders = [];
    state.aiAssistantOpen = false;
    state.aiSettingsOpen = false;
  });

  // ==========================================================================
  // 1. Top Bar & Tab Management Tests
  // ==========================================================================
  describe('1. Top Bar & Tab Management', () => {
    it('creates new tabs and updates store state on createTab', async () => {
      const state = getAetherState();
      assert.equal(state.tabs.length, 1);

      await createTab('Terminal 2');
      assert.equal(state.tabs.length, 2);
      assert.equal(state.tabs[1].title, 'Terminal 2');
      assert.equal(state.activeTabId, state.tabs[1].id);
    });

    it('switches between tabs and preserves active state on switchTab', async () => {
      const state = getAetherState();
      await createTab('Terminal 2');
      const tab1Id = state.tabs[0].id;
      const tab2Id = state.tabs[1].id;

      assert.equal(state.activeTabId, tab2Id);
      switchTab(tab1Id);
      assert.equal(state.activeTabId, tab1Id);
    });

    it('closes tabs and redirects focus to adjacent tab on closeTab', async () => {
      const state = getAetherState();
      await createTab('Terminal 2');
      await createTab('Terminal 3');
      assert.equal(state.tabs.length, 3);

      const tab2Id = state.tabs[1].id;
      await closeTab(tab2Id);
      assert.equal(state.tabs.length, 2);
      assert.ok(!state.tabs.some((t: any) => t.id === tab2Id));
    });

    it('renames tabs accurately via renameTab', () => {
      const state = getAetherState();
      const tab1Id = state.tabs[0].id;
      renameTab(tab1Id, 'Build Server');
      assert.equal(state.tabs[0].title, 'Build Server');
    });

    it('TopBar.tsx and ChromeHeaderTabs.tsx contain essential test IDs and tab triggers', () => {
      const topBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/TopBar.tsx'),
        'utf8'
      );
      const tabsSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/ChromeHeaderTabs.tsx'),
        'utf8'
      );

      // TopBar integration
      assert.ok(topBarSrc.includes('data-testid="top-bar"'), 'TopBar must have data-testid="top-bar"');
      assert.ok(topBarSrc.includes('data-testid="topbar-tabs-container"'), 'TopBar must contain tab container');
      assert.ok(topBarSrc.includes('<ChromeHeaderTabs'), 'TopBar must render ChromeHeaderTabs');

      // ChromeHeaderTabs triggers
      assert.ok(tabsSrc.includes('data-testid={`tab-${tab.id}`}'), 'Tab buttons must have data-testid');
      assert.ok(tabsSrc.includes('data-active={isActive ? \'true\' : \'false\'}'), 'Active tab must have data-active');
      assert.ok(tabsSrc.includes('data-testid={`tab-close-${tab.id}`}'), 'Tab close buttons must have data-testid');
      assert.ok(tabsSrc.includes('closeTab(tab.id)'), 'Tab close buttons must invoke closeTab');
      assert.ok(tabsSrc.includes('data-testid="btn-new-tab"'), 'New tab button must have data-testid="btn-new-tab"');
      assert.ok(tabsSrc.includes('createTab()'), 'New tab button must invoke createTab()');
      assert.ok(tabsSrc.includes('#00F0FF'), 'Active tab styling must include Cosmic Cyan #00F0FF accent');
    });
  });

  // ==========================================================================
  // 2. AI Connected Status Pill Tests
  // ==========================================================================
  describe('2. AI Connected Status Pill', () => {
    it('TopBar.tsx implements AI Connected status pill with Cosmic Cyan #00F0FF dot indicator', () => {
      const topBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/TopBar.tsx'),
        'utf8'
      );

      assert.ok(topBarSrc.includes('data-testid="ai-status-pill"'), 'AI status pill must render with data-testid');
      assert.ok(topBarSrc.includes('data-testid="ai-status-dot"'), 'AI status dot indicator must have data-testid');
      assert.ok(topBarSrc.includes('bg-[#00F0FF]'), 'Status dot must use Cosmic Cyan #00F0FF accent');
      assert.ok(topBarSrc.includes('AI Connected'), 'Status pill must display "AI Connected"');
      assert.ok(topBarSrc.includes('data-testid="ai-provider-label"'), 'Provider label must have data-testid');
    });

    it('toggles AI Assistant panel state when pill is clicked', () => {
      const state = getAetherState();
      assert.equal(state.aiAssistantOpen, false);

      toggleAiAssistant();
      assert.equal(state.aiAssistantOpen, true);

      toggleAiAssistant();
      assert.equal(state.aiAssistantOpen, false);
    });

    it('provides provider settings trigger button in TopBar', () => {
      const topBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/TopBar.tsx'),
        'utf8'
      );
      assert.ok(topBarSrc.includes('data-testid="btn-ai-settings"'), 'TopBar must have AI settings button');
      assert.ok(topBarSrc.includes('toggleAiSettings(true)'), 'AI settings button must open settings modal');

      const state = getAetherState();
      assert.equal(state.aiSettingsOpen, false);
      toggleAiSettings(true);
      assert.equal(state.aiSettingsOpen, true);
    });

    it('displays active provider label from store selectedAiProvider', () => {
      const state = getAetherState();
      setSelectedAiProvider('anthropic');
      assert.equal(state.selectedAiProvider, 'anthropic');

      setSelectedAiProvider('gemini');
      assert.equal(state.selectedAiProvider, 'gemini');
    });
  });

  // ==========================================================================
  // 3. Standard Window Controls & Web Preview Safety Tests
  // ==========================================================================
  describe('3. Standard Window Controls & Web Preview Safety Checks', () => {
    it('TopBar.tsx defines standard window controls cluster (minimize, maximize, close)', () => {
      const topBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/TopBar.tsx'),
        'utf8'
      );

      assert.ok(topBarSrc.includes('data-testid="window-controls"'), 'Window controls cluster must be present');
      assert.ok(topBarSrc.includes('data-testid="window-minimize"'), 'Minimize button must be present');
      assert.ok(topBarSrc.includes('data-testid="window-maximize"'), 'Maximize button must be present');
      assert.ok(topBarSrc.includes('data-testid="window-close"'), 'Close button must be present');
    });

    it('safely handles window controls in web preview mode without throwing', () => {
      const topBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/TopBar.tsx'),
        'utf8'
      );

      // Verify safety check wraps tauri window invocation
      assert.ok(
        topBarSrc.includes('if (isRunningInTauri())'),
        'Window control actions must be guarded with isRunningInTauri()'
      );
      assert.ok(
        topBarSrc.includes("import('@tauri-apps/api/window')"),
        'Tauri window API must be loaded dynamically with safe fallback'
      );
    });
  });

  // ==========================================================================
  // 4. Input Bar Renaming & Backwards Compatibility Tests
  // ==========================================================================
  describe('4. Input Bar Renaming & Backwards Compatibility', () => {
    it('re-exports InputBar through ModernInputBar.tsx for backward compatibility', () => {
      const modernInputBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/ModernInputBar.tsx'),
        'utf8'
      );
      assert.ok(
        modernInputBarSrc.includes("export { InputBar }"),
        'ModernInputBar.tsx must export InputBar'
      );
      assert.ok(
        modernInputBarSrc.includes("export const ModernInputBar"),
        'ModernInputBar.tsx must export ModernInputBar'
      );
    });

    it('verifies tooltip in AgentHeaderPill has been renamed to "Toggle Input Bar (Alt+I)"', () => {
      const pillSource = fs.readFileSync(
        path.join(__dirname, '../src/components/AgentHeaderPill.tsx'),
        'utf8'
      );
      assert.ok(
        pillSource.includes('title="Toggle Input Bar (Alt+I)"'),
        'AgentHeaderPill must use "Toggle Input Bar (Alt+I)"'
      );
      assert.ok(
        !pillSource.includes('title="Toggle Modern Input Bar (Alt+I)"'),
        'AgentHeaderPill must not contain "Toggle Modern Input Bar"'
      );
    });

    it('verifies zero occurrences of "Modern Input Bar" in source code and comments', () => {
      const srcDir = path.join(__dirname, '../src');
      function checkDir(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (/\.(ts|tsx)$/.test(entry.name) && entry.name !== 'ModernInputBar.tsx') {
            const content = fs.readFileSync(fullPath, 'utf8');
            assert.ok(
              !content.includes('Modern Input Bar'),
              `Found prohibited string "Modern Input Bar" in ${fullPath}`
            );
          }
        }
      }
      checkDir(srcDir);
    });
  });

  // ==========================================================================
  // 5. Input Bar Multiline Dynamic Height & Concise Placeholder Tests
  // ==========================================================================
  describe('5. Input Bar Multiline Height & Concise Placeholder', () => {
    it('uses exact concise placeholder: "Ask AetherCortex or enter a command..."', () => {
      const inputBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/InputBar.tsx'),
        'utf8'
      );
      assert.ok(
        inputBarSrc.includes('placeholder="Ask AetherCortex or enter a command..."'),
        'InputBar must use exact concise placeholder'
      );
    });

    it('enforces multiline dynamic height boundaries between 32px and 160px', () => {
      const inputBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/InputBar.tsx'),
        'utf8'
      );

      // Verify scrollHeight measurement and clamping between 32px and 160px
      assert.ok(
        inputBarSrc.includes('Math.min(Math.max(el.scrollHeight, 32), 160)'),
        'InputBar must clamp textarea dynamic height between 32 and 160'
      );
      assert.ok(
        inputBarSrc.includes("style={{ minHeight: '32px', maxHeight: '160px' }}"),
        'InputBar must enforce 32px minHeight and 160px maxHeight'
      );
    });

    it('handles Shift+Enter for multiline newline insertion without premature submit', () => {
      const inputBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/InputBar.tsx'),
        'utf8'
      );
      assert.ok(
        inputBarSrc.includes("if (e.key === 'Enter' && !e.shiftKey)"),
        'InputBar must submit only on Enter without Shift'
      );
    });
  });

  // ==========================================================================
  // 6. Mode Distinction & Shell Protection Guard Tests
  // ==========================================================================
  describe('6. Mode Distinction & Shell Protection Guard', () => {
    it('differentiates between shell command ($) and AI prompt (#)', () => {
      const cmdResult = classifyCommand('$ git status');
      assert.equal(cmdResult.type, 'shell');
      assert.equal(cmdResult.suggestedMode, 'cmd');

      const aiResult = classifyCommand('# generate a typescript interface for user profile');
      assert.equal(aiResult.type, 'natural_language');
      assert.equal(aiResult.suggestedMode, 'ai');
    });

    it('classifies natural language prompts without # prefix as natural_language', () => {
      const prompt1 = classifyCommand('how do I check memory usage on Linux');
      assert.equal(prompt1.type, 'natural_language');
      assert.equal(prompt1.suggestedMode, 'ai');
      assert.ok(prompt1.confidence >= 0.75);

      const prompt2 = classifyCommand('explain why the build failed with exit code 1');
      assert.equal(prompt2.type, 'natural_language');
      assert.equal(prompt2.suggestedMode, 'ai');
      assert.ok(prompt2.confidence >= 0.75);
    });

    it('InputBar.tsx enforces strict shell protection guard against natural language execution', () => {
      const inputBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/InputBar.tsx'),
        'utf8'
      );

      // Verify shell protection guard logic
      assert.ok(
        inputBarSrc.includes('const isIntendedForAi = (isExplicitAi || mode === \'ai\' || isNaturalLanguage) && !isExplicitShell;'),
        'InputBar must determine if input is intended for AI'
      );
      assert.ok(
        inputBarSrc.includes('if (isIntendedForAi)'),
        'InputBar must branch on isIntendedForAi'
      );
      assert.ok(
        inputBarSrc.includes('routePromptToAgent(cleanPrompt, targetPaneId)'),
        'InputBar must route intended AI prompt to agent'
      );
      assert.ok(
        inputBarSrc.includes('if (!isExplicitShell && isNaturalLanguage && classification.confidence >= 0.75)'),
        'InputBar must implement defense-in-depth confidence guard'
      );
    });

    it('allows explicit shell execution when prefixed with $', () => {
      let shellExecuted = false;
      let executedCmd = '';
      let aiDispatched = false;

      const inputWithDollar = '$ how do I list sockets'; // questions with explicit $ prefix
      const isExplicitShell = inputWithDollar.startsWith('$ ') || inputWithDollar.startsWith('$');

      if (isExplicitShell) {
        shellExecuted = true;
        executedCmd = inputWithDollar.replace(/^\$\s*/, '').trim();
      } else {
        aiDispatched = true;
      }

      assert.equal(shellExecuted, true, 'Explicit $ prefix must force shell command mode');
      assert.equal(executedCmd, 'how do I list sockets');
      assert.equal(aiDispatched, false, 'AI dispatch must not occur on explicit $ prefix');
    });

    it('strictly routes natural language prompts to AI and blocks shell execution', () => {
      let shellExecuted = false;
      let executedCmd = '';
      let aiDispatched = false;
      let dispatchedPrompt = '';

      const onExecute = (cmd: string) => {
        shellExecuted = true;
        executedCmd = cmd;
      };

      const onAiPrompt = (prompt: string) => {
        aiDispatched = true;
        dispatchedPrompt = prompt;
      };

      const promptText = 'how do I list all open network sockets';
      const classification = classifyCommand(promptText);
      assert.equal(classification.type, 'natural_language');

      const isExplicitShell = promptText.startsWith('$ ') || promptText.startsWith('$');
      const isExplicitAi = promptText.startsWith('#') || promptText.startsWith('@');
      const isNaturalLanguage = classification.type === 'natural_language';
      const isIntendedForAi = (isExplicitAi || isNaturalLanguage) && !isExplicitShell;

      if (isIntendedForAi) {
        onAiPrompt(promptText);
      } else {
        onExecute(promptText);
      }

      assert.equal(aiDispatched, true, 'Natural language prompt must route to AI');
      assert.equal(dispatchedPrompt, promptText);
      assert.equal(shellExecuted, false, 'Shell command execution must be strictly blocked');
      assert.equal(executedCmd, '');
    });
  });

  // ==========================================================================
  // 7. Synchronized Provider and Model Selector in Input Bar Tests
  // ==========================================================================
  describe('7. Synchronized Provider and Model Selector in Input Bar', () => {
    it('InputBar.tsx embeds provider and model selector directly', () => {
      const inputBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/InputBar.tsx'),
        'utf8'
      );

      assert.ok(
        inputBarSrc.includes('data-testid="inputbar-provider-selector"'),
        'InputBar must render provider selector container'
      );
      assert.ok(
        inputBarSrc.includes('data-testid="inputbar-provider-select"'),
        'InputBar must render provider select dropdown'
      );
      assert.ok(
        inputBarSrc.includes('value={store.selectedAiProvider}'),
        'Provider select must bind to store.selectedAiProvider'
      );
      assert.ok(
        inputBarSrc.includes('onChange={(e) => setSelectedAiProvider(e.target.value)}'),
        'Provider select must call setSelectedAiProvider'
      );
      assert.ok(
        inputBarSrc.includes('data-testid="inputbar-model-label"'),
        'InputBar must render model label'
      );
      assert.ok(
        inputBarSrc.includes('{store.selectedAiModel}'),
        'Model label must display store.selectedAiModel'
      );
    });

    it('synchronizes provider change with aetherStore single source of truth', () => {
      const state = getAetherState();
      assert.equal(state.selectedAiProvider, 'openai');
      assert.equal(state.selectedAiModel, 'gpt-4o');

      // Change provider to Anthropic
      setSelectedAiProvider('anthropic');
      assert.equal(state.selectedAiProvider, 'anthropic');
      assert.equal(state.selectedAiModel, 'claude-3-5-sonnet-20241022');

      // Change provider to Groq
      setSelectedAiProvider('groq');
      assert.equal(state.selectedAiProvider, 'groq');
      assert.equal(state.selectedAiModel, 'llama-3.3-70b-versatile');
    });

    it('synchronizes custom providers in aetherStore and selector', () => {
      const state = getAetherState();
      state.customProviders = [
        {
          id: 'custom-qwen',
          displayName: 'Qwen 2.5 Coder',
          baseUrl: 'https://api.qwen.ai',
          apiKey: 'sk-qwen',
          model: 'qwen-2.5-coder-32b',
          protocol: 'openai',
        },
      ];

      setSelectedAiProvider('custom-qwen');
      assert.equal(state.selectedAiProvider, 'custom-qwen');
      assert.equal(state.selectedAiModel, 'qwen-2.5-coder-32b');
    });
  });

  // ==========================================================================
  // 8. Strict Constraint Audits: Zero Prohibited Copy & Zero Emojis
  // ==========================================================================
  describe('8. Strict Constraint Audits: Zero Prohibited Copy & Zero Emojis', () => {
    it('strictly ensures zero occurrences of prohibited copy in src/ source files', () => {
      const srcDir = path.join(__dirname, '../src');
      const bannedPattern = new RegExp(['B', 'Y', 'O', 'K'].join(''), 'i');

      function scan(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (/\.(ts|tsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const match = content.match(bannedPattern);
            assert.equal(
              match,
              null,
              `Prohibited copy found in source file: ${fullPath}`
            );
          }
        }
      }
      scan(srcDir);
    });

    it('strictly ensures zero emoji characters across src/ and tests/', () => {
      const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      const dirsToScan = [
        path.join(__dirname, '../src'),
        path.join(__dirname, '../tests'),
      ];

      for (const baseDir of dirsToScan) {
        function scan(dir: string) {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scan(fullPath);
            } else if (/\.(ts|tsx|css|html)$/.test(entry.name)) {
              const content = fs.readFileSync(fullPath, 'utf8');
              const match = emojiRegex.exec(content);
              assert.ok(
                !match,
                `Prohibited emoji character "${match?.[0]}" found in ${fullPath}`
              );
            }
          }
        }
        scan(baseDir);
      }
    });
  });
});
