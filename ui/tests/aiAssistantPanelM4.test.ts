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

let clipboardText = '';
const mockClipboard = {
  writeText: async (text: string) => {
    clipboardText = text;
  },
  readText: async () => clipboardText,
};

const mockTauriIpc = {
  invoke: async (cmd: string, args: any = {}) => {
    switch (cmd) {
      case 'cmd_ai_chat':
        if (args.prompt?.includes('SIMULATE_IPC_ERROR')) {
          throw new Error('Tauri IPC AI chat failure: 500 Internal Error');
        }
        return `### AetherCortex Response\n\nProcessed query via **${args.provider}** (\`${args.model || 'gpt-4o'}\`).\n\n\`\`\`bash\necho "Tauri IPC Execution Success"\n\`\`\``;
      default:
        return null;
    }
  },
};

const mockWindow: any = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
  navigator: {
    clipboard: mockClipboard,
  },
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
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: mockWindow.navigator,
    configurable: true,
    writable: true,
  });
} catch {
  try {
    Object.defineProperty((globalThis as any).navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true,
      writable: true,
    });
  } catch {}
}
(globalThis as any).__TAURI_INTERNALS__ = mockTauriIpc;

import jitiFactory from 'jiti';
const jiti = jitiFactory(import.meta.url);
const aetherStore = jiti('../src/stores/aetherStore.ts');

const {
  getAetherState,
  toggleAiAssistant,
  setAiAssistantOpen,
  sendAiMessage,
  clearAiMessages,
  retryLastAiMessage,
  insertTerminalContextToAi,
  setSelectedAiProvider,
  setSelectedAiModel,
  setAiLoading,
  setAiError,
  BUILT_IN_PROVIDERS,
} = aetherStore;

describe('Milestone 4: Collapsible AI Assistant Panel', () => {
  beforeEach(() => {
    storageMap.clear();
    clipboardText = '';
    const state = getAetherState();
    state.aiAssistantOpen = false;
    state.aiMessages = [];
    state.aiLoading = false;
    state.aiError = null;
    state.aiPendingContext = null;
    state.selectedAiProvider = 'openai';
    state.selectedAiModel = 'gpt-4o';
    state.customProviders = [];
    state.panes = [
      {
        id: 'pane-alpha',
        cliType: 'bash',
        status: 'IDLE',
        worktreePath: '/workspace/project-alpha',
        gitBranch: 'feature/m4-panel',
        openPorts: [3000, 8080],
        lastExitCode: 0,
      },
    ];
    state.activePaneId = 'pane-alpha';
  });

  // ==========================================================================
  // 1. Collapsible Panel Toggle & State Control
  // ==========================================================================
  describe('1. Collapsible Panel Toggle & State Control', () => {
    it('initializes with aiAssistantOpen false or from localStorage', () => {
      const state = getAetherState();
      assert.strictEqual(state.aiAssistantOpen, false);

      storageMap.set('aether_ai_assistant_open', 'true');
      toggleAiAssistant(true);
      assert.strictEqual(state.aiAssistantOpen, true);
      assert.strictEqual(storageMap.get('aether_ai_assistant_open'), 'true');
    });

    it('toggleAiAssistant cleanly inverts or sets explicit open state', () => {
      const state = getAetherState();

      // Explicit open
      toggleAiAssistant(true);
      assert.strictEqual(state.aiAssistantOpen, true);
      assert.strictEqual(storageMap.get('aether_ai_assistant_open'), 'true');

      // Invert toggle
      toggleAiAssistant();
      assert.strictEqual(state.aiAssistantOpen, false);
      assert.strictEqual(storageMap.get('aether_ai_assistant_open'), 'false');

      // Set via setAiAssistantOpen alias
      setAiAssistantOpen(true);
      assert.strictEqual(state.aiAssistantOpen, true);
      assert.strictEqual(storageMap.get('aether_ai_assistant_open'), 'true');
    });

    it('verifies AiAssistantPanel source code implements required width and side-by-side border', () => {
      const panelPath = path.resolve(__dirname, '../src/components/AiAssistantPanel.tsx');
      assert.ok(fs.existsSync(panelPath), 'AiAssistantPanel.tsx must exist');

      const source = fs.readFileSync(panelPath, 'utf8');
      assert.ok(source.includes('w-[380px]'), 'Panel must specify ~380px width');
      assert.ok(source.includes('border-l border-cortex-border'), 'Panel must have left border separating from terminal');
      assert.ok(source.includes('data-testid="ai-assistant-panel"'), 'Panel must have data-testid="ai-assistant-panel"');
      assert.ok(source.includes('data-testid="ai-panel-close-button"'), 'Panel must have close/collapse button');
      assert.ok(source.includes('data-testid="ai-clear-history-button"'), 'Panel must have clear history button');
    });
  });

  // ==========================================================================
  // 2. Message History Persistence & Store Actions
  // ==========================================================================
  describe('2. Message History Persistence & Store Actions', () => {
    it('sendAiMessage appends user prompt and realistic assistant response', async () => {
      const state = getAetherState();

      await sendAiMessage('how do I check git status?');

      assert.strictEqual(state.aiMessages.length, 2);
      const userMsg = state.aiMessages[0];
      const asstMsg = state.aiMessages[1];

      assert.strictEqual(userMsg.role, 'user');
      assert.strictEqual(userMsg.content, 'how do I check git status?');

      assert.strictEqual(asstMsg.role, 'assistant');
      assert.ok(asstMsg.content.includes('Git Command Recommendation'));
      assert.ok(asstMsg.content.includes('git status'));
      assert.ok(asstMsg.metadata?.tokens && asstMsg.metadata.tokens > 0);
      assert.ok(asstMsg.metadata?.latencyMs && asstMsg.metadata.latencyMs >= 15);
      assert.ok(asstMsg.metadata?.cards && asstMsg.metadata.cards.length >= 3);

      // Verify persistence in localStorage
      const persisted = storageMap.get('aether_ai_messages');
      assert.ok(persisted, 'Messages must be stored in localStorage');
      const parsed = JSON.parse(persisted);
      assert.strictEqual(parsed.length, 2);
    });

    it('clearAiMessages resets store state and clears localStorage', async () => {
      const state = getAetherState();
      await sendAiMessage('test query');
      assert.ok(state.aiMessages.length > 0);
      assert.ok(storageMap.has('aether_ai_messages'));

      clearAiMessages();
      assert.strictEqual(state.aiMessages.length, 0);
      assert.strictEqual(state.aiError, null);
      assert.strictEqual(state.aiLoading, false);
      assert.strictEqual(storageMap.has('aether_ai_messages'), false);
    });

    it('ignores empty or whitespace-only prompts', async () => {
      const state = getAetherState();
      await sendAiMessage('   ');
      assert.strictEqual(state.aiMessages.length, 0);
      await sendAiMessage('');
      assert.strictEqual(state.aiMessages.length, 0);
    });
  });

  // ==========================================================================
  // 3. Loading, Actionable Error State & Retry Flow
  // ==========================================================================
  describe('3. Loading, Actionable Error State & Retry Flow', () => {
    it('sets loading indicator while awaiting response', async () => {
      const state = getAetherState();

      // Trigger message send and inspect loading state transition
      const sendPromise = sendAiMessage('run cargo check');
      assert.strictEqual(state.aiLoading, true);

      await sendPromise;
      assert.strictEqual(state.aiLoading, false);
      assert.strictEqual(state.aiError, null);
    });

    it('handles simulated errors by setting aiError and actionable error card', async () => {
      const state = getAetherState();

      await sendAiMessage('[SIMULATE_ERROR] connect to remote');
      assert.strictEqual(state.aiLoading, false);
      assert.ok(state.aiError, 'Error message must be set in store');
      assert.ok(state.aiError.includes('503 Service Unavailable'));

      // The last message in history must record the error
      const lastMsg = state.aiMessages[state.aiMessages.length - 1];
      assert.strictEqual(lastMsg.role, 'assistant');
      assert.ok(lastMsg.error);
    });

    it('retryLastAiMessage removes error and successfully resends last user prompt', async () => {
      const state = getAetherState();

      // 1. Send normal message
      await sendAiMessage('explain cargo test');
      assert.strictEqual(state.aiMessages.length, 2);

      // 2. Simulate error on subsequent message
      setAiError('Temporary connection drop');
      const errAssistantMsg = {
        id: 'msg_temp_err',
        role: 'assistant' as const,
        content: 'Temporary connection drop',
        timestamp: Date.now(),
        error: 'Temporary connection drop',
      };
      state.aiMessages.push(errAssistantMsg);

      // 3. Trigger retry
      await retryLastAiMessage();

      // Error must be cleared and assistant response freshly resolved
      assert.strictEqual(state.aiError, null);
      const lastMsg = state.aiMessages[state.aiMessages.length - 1];
      assert.strictEqual(lastMsg.role, 'assistant');
      assert.strictEqual(lastMsg.error, undefined);
      assert.ok(lastMsg.content.includes('Cargo') || lastMsg.content.includes('cargo'));
    });
  });

  // ==========================================================================
  // 4. Contextual Terminal Assistance
  // ==========================================================================
  describe('4. Contextual Terminal Assistance', () => {
    it('insertTerminalContextToAi extracts active pane details and attaches system context', () => {
      const state = getAetherState();
      state.panes = [
        {
          id: 'pane-alpha',
          cliType: 'zsh',
          status: 'IDLE',
          worktreePath: '/home/developer/Elliot',
          gitBranch: 'milestone-4',
          openPorts: [3000],
          lastExitCode: 0,
        },
      ];
      state.activePaneId = 'pane-alpha';

      insertTerminalContextToAi('pane-alpha');

      assert.strictEqual(state.aiAssistantOpen, true, 'Attaching context should open assistant panel');
      assert.strictEqual(state.aiMessages.length, 1);

      const ctxMsg = state.aiMessages[0];
      assert.strictEqual(ctxMsg.role, 'system');
      assert.ok(ctxMsg.content.includes('Terminal Context Attached'));
      assert.ok(ctxMsg.content.includes('pane-alpha'));
      assert.ok(ctxMsg.content.includes('/home/developer/Elliot'));
      assert.ok(ctxMsg.content.includes('milestone-4'));
      assert.ok(ctxMsg.content.includes('zsh'));

      // Check metadata cards
      assert.ok(ctxMsg.metadata?.cards);
      const paneCard = ctxMsg.metadata.cards.find((c) => c.key === 'Pane');
      assert.strictEqual(paneCard?.value, 'pane-alpha');
      const dirCard = ctxMsg.metadata.cards.find((c) => c.key === 'Directory');
      assert.strictEqual(dirCard?.value, '/home/developer/Elliot');
    });

    it('fallback to first pane when activePaneId is unspecified', () => {
      const state = getAetherState();
      state.activePaneId = null;

      insertTerminalContextToAi();
      assert.strictEqual(state.aiMessages.length, 1);
      assert.strictEqual(state.aiMessages[0].role, 'system');
    });
  });

  // ==========================================================================
  // 5. Synchronized Provider and Model Selectors
  // ==========================================================================
  describe('5. Synchronized Provider and Model Selectors', () => {
    it('AiAssistantPanel.tsx source contains synchronized provider and model selectors', () => {
      const panelPath = path.resolve(__dirname, '../src/components/AiAssistantPanel.tsx');
      const source = fs.readFileSync(panelPath, 'utf8');

      assert.ok(source.includes('data-testid="ai-panel-provider-select"'));
      assert.ok(source.includes('data-testid="ai-panel-model-select"'));
      assert.ok(source.includes('setSelectedAiProvider'));
      assert.ok(source.includes('setSelectedAiModel'));
      assert.ok(source.includes('data-testid="ai-provider-badge"'));
    });

    it('updates provider and model bidirectionally through aetherStore', () => {
      setSelectedAiProvider('anthropic');
      const state = getAetherState();
      assert.strictEqual(state.selectedAiProvider, 'anthropic');
      assert.strictEqual(state.selectedAiModel, 'claude-3-5-sonnet-20241022');

      setSelectedAiModel('claude-3-5-haiku-20241022');
      assert.strictEqual(state.selectedAiModel, 'claude-3-5-haiku-20241022');

      setSelectedAiProvider('groq');
      assert.strictEqual(state.selectedAiProvider, 'groq');
      assert.strictEqual(state.selectedAiModel, 'llama-3.3-70b-versatile');
    });
  });

  // ==========================================================================
  // 6. Markdown Rendering, Code Blocks & Clipboard Copy Feedback
  // ==========================================================================
  describe('6. Markdown Rendering, Code Blocks & Clipboard Copy Feedback', () => {
    it('verifies MarkdownContent, CodeBlock, InfoCards, and AiAssistantPanel component exports', () => {
      const panelPath = path.resolve(__dirname, '../src/components/AiAssistantPanel.tsx');
      const source = fs.readFileSync(panelPath, 'utf8');

      assert.ok(source.includes('export const AiAssistantPanel'), 'Must export AiAssistantPanel');
      assert.ok(source.includes('export const MarkdownContent'), 'Must export MarkdownContent');
      assert.ok(source.includes('export const CodeBlock'), 'Must export CodeBlock');
      assert.ok(source.includes('export const InfoCards'), 'Must export InfoCards');
    });

    it('verifies CodeBlock component implements copy button and Copied! state', () => {
      const panelPath = path.resolve(__dirname, '../src/components/AiAssistantPanel.tsx');
      const source = fs.readFileSync(panelPath, 'utf8');

      assert.ok(source.includes('data-testid="code-copy-button"'));
      assert.ok(source.includes('Copied!'));
      assert.ok(source.includes('navigator.clipboard.writeText'));
      assert.ok(source.includes('setTimeout'));
      assert.ok(source.includes('data-testid="code-language-tag"'));
    });

    it('verifies MarkdownContent supports headers, lists, bold, and inline code', () => {
      const panelPath = path.resolve(__dirname, '../src/components/AiAssistantPanel.tsx');
      const source = fs.readFileSync(panelPath, 'utf8');

      assert.ok(source.includes('trimmed.startsWith(\'# \')'), 'Must parse h1');
      assert.ok(source.includes('trimmed.startsWith(\'## \')'), 'Must parse h2');
      assert.ok(source.includes('trimmed.startsWith(\'### \')'), 'Must parse h3');
      assert.ok(source.includes('trimmed.startsWith(\'- \')'), 'Must parse bullet lists');
      assert.ok(source.includes('parseInlineFormatting'), 'Must parse inline formatting');
      assert.ok(source.includes('fenceRegex'), 'Must parse code fences');
    });

    it('verifies technical key-value info cards container and items', () => {
      const panelPath = path.resolve(__dirname, '../src/components/AiAssistantPanel.tsx');
      const source = fs.readFileSync(panelPath, 'utf8');

      assert.ok(source.includes('data-testid="ai-info-cards"'));
      assert.ok(source.includes('data-testid="ai-info-card"'));
      assert.ok(source.includes('data-testid="ai-info-card-value"'));
    });
  });

  // ==========================================================================
  // 7. Prompt Submission & Bottom Input Bar
  // ==========================================================================
  describe('7. Prompt Submission & Bottom Input Bar', () => {
    it('verifies input textarea, send button, and keyboard handlers', () => {
      const panelPath = path.resolve(__dirname, '../src/components/AiAssistantPanel.tsx');
      const source = fs.readFileSync(panelPath, 'utf8');

      assert.ok(source.includes('data-testid="ai-panel-input"'));
      assert.ok(source.includes('data-testid="ai-panel-send-button"'));
      assert.ok(source.includes("e.key === 'Enter' && !e.shiftKey"));
      assert.ok(source.includes("(e.metaKey || e.ctrlKey) && e.key === 'Enter'"));
    });
  });

  // ==========================================================================
  // 8. Layout Integration in main.tsx, Sidebar & TopBar
  // ==========================================================================
  describe('8. Layout Integration in main.tsx, Sidebar & TopBar', () => {
    it('verifies AiAssistantPanel is docked alongside TerminalGrid in main.tsx', () => {
      const mainPath = path.resolve(__dirname, '../src/main.tsx');
      const source = fs.readFileSync(mainPath, 'utf8');

      assert.ok(source.includes("import { AiAssistantPanel } from './components/AiAssistantPanel';"));
      assert.ok(source.includes('<TerminalGrid registerTermWriter={registerTermWriter} />'));
      assert.ok(source.includes('<AiAssistantPanel />'));
    });

    it('verifies PersistentLeftSidebar nav-assistant triggers toggleAiAssistant', () => {
      const sidebarPath = path.resolve(__dirname, '../src/components/PersistentLeftSidebar.tsx');
      const source = fs.readFileSync(sidebarPath, 'utf8');

      assert.ok(source.includes('data-testid="nav-assistant"'));
      assert.ok(source.includes("handleNavClick('assistant')"));
      assert.ok(source.includes('toggleAiAssistant'));
    });

    it('verifies TopBar AI Connected pill triggers toggleAiAssistant', () => {
      const topbarPath = path.resolve(__dirname, '../src/components/TopBar.tsx');
      const source = fs.readFileSync(topbarPath, 'utf8');

      assert.ok(source.includes('data-testid="ai-status-pill"'));
      assert.ok(source.includes('handleAiPillClick'));
      assert.ok(source.includes('toggleAiAssistant'));
    });
  });

  // ==========================================================================
  // 9. Strict Repository Constraints: Zero Prohibited Copy & Zero Emojis
  // ==========================================================================
  describe('9. Strict Repository Constraints: Zero Prohibited Copy & Zero Emojis', () => {
    it('strictly ensures zero occurrences of prohibited copy across M4 files', () => {
      const filesToCheck = [
        path.resolve(__dirname, '../src/components/AiAssistantPanel.tsx'),
        path.resolve(__dirname, '../src/stores/aetherStore.ts'),
        path.resolve(__dirname, '../src/main.tsx'),
      ];

      const banned = ['B', 'Y', 'O', 'K'].join('');
      const regex = new RegExp(`\\b${banned}\\b`, 'i');

      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(regex);
        assert.equal(
          match,
          null,
          `File ${path.basename(filePath)} must contain ZERO occurrences of prohibited copy.`
        );
      }
    });

    it('strictly ensures zero emoji characters across M4 source and test files', () => {
      const filesToCheck = [
        path.resolve(__dirname, '../src/components/AiAssistantPanel.tsx'),
        __filename,
      ];

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(emojiRegex);
        assert.strictEqual(
          match,
          null,
          `File ${path.basename(filePath)} contains prohibited emoji: ${match?.[0]}`
        );
      }
    });
  });
});
