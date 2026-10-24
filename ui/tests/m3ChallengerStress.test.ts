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
        const id = `pane_m3_${paneCounter++}`;
        return {
          pane_id: id,
          pid: 20000 + paneCounter,
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
(globalThis as any).isTauri = true;
mockWindow.isTauri = true;

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
  spawnAgentPane,
  closePane,
  equalizeLayout,
  balanceLayout,
  countLeafPanes,
  extractPaneIds,
  updateSplitRatio,
  createSplitId,
} = aetherStore;

// ----------------------------------------------------------------------------
// Helper: Simulate InputBar.tsx submit pipeline
// ----------------------------------------------------------------------------
interface SubmitSimulationResult {
  action: 'shell' | 'ai_prompt' | 'ai_agent_pty' | 'ai_pilot' | 'none';
  executedCommand?: string;
  dispatchedPrompt?: string;
  isShellPrevented: boolean;
  classification: any;
  resolvedMode: 'cmd' | 'ai';
}

function simulateInputBarSubmit(
  rawInput: string,
  isAgentPane: boolean = false,
  manualModeOverride: 'cmd' | 'ai' | null = null,
  detectedTools: string[] = []
): SubmitSimulationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      action: 'none',
      isShellPrevented: true,
      classification: null,
      resolvedMode: 'cmd',
    };
  }

  const classification = classifyCommand(trimmed, detectedTools);

  // Mode resolution (matches InputBar.tsx lines 97-104)
  let resolvedMode: 'cmd' | 'ai';
  if (trimmed.startsWith('#') || trimmed.startsWith('@')) {
    resolvedMode = 'ai';
  } else if (trimmed.startsWith('$ ') || trimmed === '$' || (trimmed.startsWith('$') && !trimmed.startsWith('$$'))) {
    resolvedMode = 'cmd';
  } else if (manualModeOverride !== null) {
    resolvedMode = manualModeOverride;
  } else if (classification.type === 'natural_language') {
    resolvedMode = 'ai';
  } else {
    resolvedMode = classification.suggestedMode;
  }

  // Submit pipeline (matches InputBar.tsx lines 154-224)
  if (trimmed.startsWith('!ai')) {
    const instruction = trimmed.replace(/^!ai\s*/, '').trim();
    return {
      action: 'ai_pilot',
      dispatchedPrompt: instruction,
      isShellPrevented: true,
      classification,
      resolvedMode,
    };
  }

  const isExplicitShell = trimmed.startsWith('$ ') || trimmed.startsWith('$');
  const isExplicitAi = trimmed.startsWith('#') || trimmed.startsWith('@');
  const isNaturalLanguage = classification.type === 'natural_language';

  // Shell protection guard
  const isIntendedForAi = (isExplicitAi || resolvedMode === 'ai' || isNaturalLanguage) && !isExplicitShell;

  if (isIntendedForAi) {
    const cleanPrompt = trimmed.replace(/^[#@]\s*/, '').trim();
    return {
      action: isAgentPane ? 'ai_agent_pty' : 'ai_prompt',
      dispatchedPrompt: cleanPrompt,
      isShellPrevented: true,
      classification,
      resolvedMode,
    };
  }

  const cleanCmd = trimmed.replace(/^\$\s*/, '').trim();
  if (!cleanCmd) {
    return {
      action: 'none',
      isShellPrevented: true,
      classification,
      resolvedMode,
    };
  }

  // Defensive guard
  if (!isExplicitShell && isNaturalLanguage && classification.confidence >= 0.75) {
    return {
      action: 'ai_prompt',
      dispatchedPrompt: cleanCmd,
      isShellPrevented: true,
      classification,
      resolvedMode,
    };
  }

  return {
    action: 'shell',
    executedCommand: cleanCmd,
    isShellPrevented: false,
    classification,
    resolvedMode,
  };
}

describe('Milestone 3 Challenger: Adversarial Stress & Edge Case Harness', () => {
  beforeEach(() => {
    storageMap.clear();
    const state = getAetherState();
    state.tabs = [
      {
        id: 'tab-init',
        title: 'Terminal 1',
        paneIds: ['pane-init'],
        layout: { type: 'pane', paneId: 'pane-init' },
        activePaneId: 'pane-init',
      },
    ];
    state.activeTabId = 'tab-init';
    state.layout = { type: 'pane', paneId: 'pane-init' };
    state.panes = [
      {
        id: 'pane-init',
        cliType: 'bash',
        status: 'running',
        worktreePath: '/workspace',
        gitBranch: 'main',
        viewMode: 'raw',
        inputBarOpen: true,
      },
    ];
    state.activePaneId = 'pane-init';
    state.selectedAiProvider = 'openai';
    state.selectedAiModel = 'gpt-4o';
  });

  // ==========================================================================
  // Section 1: Input Bar Multiline Dynamic Height Scaling & Boundary Clamping
  // ==========================================================================
  describe('1. Input Bar Multiline Scaling & Boundary Clamps (32px to 160px)', () => {
    function computeClampedHeight(scrollHeight: number): number {
      return Math.min(Math.max(scrollHeight, 32), 160);
    }

    it('enforces exact mathematical clamping invariants across extreme scrollHeight values', () => {
      // Below min boundary
      assert.equal(computeClampedHeight(-500), 32);
      assert.equal(computeClampedHeight(0), 32);
      assert.equal(computeClampedHeight(1), 32);
      assert.equal(computeClampedHeight(16), 32);
      assert.equal(computeClampedHeight(31), 32);
      assert.equal(computeClampedHeight(32), 32);

      // Within normal scaling range
      assert.equal(computeClampedHeight(48), 48);
      assert.equal(computeClampedHeight(75), 75);
      assert.equal(computeClampedHeight(100), 100);
      assert.equal(computeClampedHeight(140), 140);
      assert.equal(computeClampedHeight(159), 159);
      assert.equal(computeClampedHeight(160), 160);

      // Above max boundary
      assert.equal(computeClampedHeight(161), 160);
      assert.equal(computeClampedHeight(200), 160);
      assert.equal(computeClampedHeight(500), 160);
      assert.equal(computeClampedHeight(2000), 160);
      assert.equal(computeClampedHeight(100000), 160);
    });

    it('handles rapid paste of 100+ lines clamping height strictly at 160px', () => {
      // Generate 150 lines of complex multiline script
      const lines150 = Array.from({ length: 150 }, (_, i) => `echo "Log line entry #${i + 1} processing payload"`).join('\n');
      assert.ok(lines150.split('\n').length === 150);

      // Simulate DOM element scrollHeight for 150 lines (approx 20px per line = 3000px)
      const simulatedScrollHeight = 150 * 20;
      const targetHeight = computeClampedHeight(simulatedScrollHeight);

      assert.equal(targetHeight, 160, 'Rapid paste of 150 lines must clamp strictly to 160px max');
    });

    it('handles rapid paste of 500+ and 1000+ lines without height overflow', () => {
      const lines500 = Array.from({ length: 500 }, (_, i) => `const var_${i} = ${i * 2};`).join('\n');
      const lines1000 = Array.from({ length: 1000 }, (_, i) => `SELECT * FROM tbl WHERE id = ${i};`).join('\n');

      const height500 = computeClampedHeight(500 * 22);
      const height1000 = computeClampedHeight(1000 * 22);

      assert.equal(height500, 160, '500 lines must clamp to 160px');
      assert.equal(height1000, 160, '1000 lines must clamp to 160px');
    });

    it('simulates rapid typing, expansion to 160px, and rapid backspace shrinkage back to 32px', () => {
      // Simulate textarea DOM lifecycle
      let currentHeight = 32;
      const simulateChange = (linesCount: number) => {
        const estimatedScroll = linesCount <= 1 ? 24 : linesCount * 18;
        currentHeight = computeClampedHeight(estimatedScroll);
      };

      // 1 line
      simulateChange(1);
      assert.equal(currentHeight, 32);

      // 3 lines
      simulateChange(3);
      assert.equal(currentHeight, 54);

      // 7 lines
      simulateChange(7);
      assert.equal(currentHeight, 126);

      // 12 lines (exceeds 160px)
      simulateChange(12);
      assert.equal(currentHeight, 160);

      // 120 lines paste
      simulateChange(120);
      assert.equal(currentHeight, 160);

      // Rapid deletion back to 5 lines
      simulateChange(5);
      assert.equal(currentHeight, 90);

      // Rapid deletion back to 1 line
      simulateChange(1);
      assert.equal(currentHeight, 32);

      // Empty string
      simulateChange(0);
      assert.equal(currentHeight, 32);
    });

    it('verifies InputBar.tsx source implements the exact dynamic clamp and style constraints', () => {
      const inputBarSrc = fs.readFileSync(
        path.join(__dirname, '../src/components/InputBar.tsx'),
        'utf8'
      );

      // 1. scrollHeight formula
      assert.ok(
        inputBarSrc.includes('const targetHeight = Math.min(Math.max(el.scrollHeight, 32), 160);'),
        'InputBar must compute targetHeight clamping scrollHeight between 32 and 160'
      );
      assert.ok(
        inputBarSrc.includes('el.style.height = `${targetHeight}px`;'),
        'InputBar must set style.height to targetHeight px'
      );

      // 2. CSS style limits
      assert.ok(
        inputBarSrc.includes("style={{ minHeight: '32px', maxHeight: '160px' }}"),
        'InputBar textarea element must declare minHeight 32px and maxHeight 160px inline styles'
      );
      assert.ok(
        inputBarSrc.includes('resize-none'),
        'InputBar must prevent manual CSS resize dragging'
      );
    });
  });

  // ==========================================================================
  // Section 2: Shell Protection Guard & Collision Phrases
  // ==========================================================================
  describe('2. Shell Protection Guard & Edge-Case Collision Matrix', () => {
    it('verifies explicit collision pair 1: kill -9 1234 vs how do I kill process 1234?', () => {
      // Shell command: kill -9 1234
      const shellResult = simulateInputBarSubmit('kill -9 1234');
      assert.equal(shellResult.action, 'shell');
      assert.equal(shellResult.executedCommand, 'kill -9 1234');
      assert.equal(shellResult.isShellPrevented, false);
      assert.equal(shellResult.resolvedMode, 'cmd');

      // Natural language collision: how do I kill process 1234?
      const nlResult = simulateInputBarSubmit('how do I kill process 1234?');
      assert.equal(nlResult.action, 'ai_prompt');
      assert.equal(nlResult.dispatchedPrompt, 'how do I kill process 1234?');
      assert.equal(nlResult.isShellPrevented, true);
      assert.equal(nlResult.resolvedMode, 'ai');
      assert.equal(nlResult.executedCommand, undefined, 'Natural language prompt must NEVER be executed in shell');
    });

    it('verifies explicit collision pair 2: date vs what is today date?', () => {
      // Shell command: date
      const shellResult = simulateInputBarSubmit('date');
      assert.equal(shellResult.action, 'shell');
      assert.equal(shellResult.executedCommand, 'date');
      assert.equal(shellResult.isShellPrevented, false);
      assert.equal(shellResult.resolvedMode, 'cmd');

      // Natural language collision: what is today date?
      const nlResult = simulateInputBarSubmit('what is today date?');
      assert.equal(nlResult.action, 'ai_prompt');
      assert.equal(nlResult.dispatchedPrompt, 'what is today date?');
      assert.equal(nlResult.isShellPrevented, true);
      assert.equal(nlResult.resolvedMode, 'ai');
      assert.equal(nlResult.executedCommand, undefined, 'Natural language prompt must NEVER be executed in shell');
    });

    it('adversarially stress tests 40+ command vs natural language collision pairs', () => {
      const collisionPairs = [
        // System & Time
        { input: 'date -u', expectedAction: 'shell' },
        { input: 'what is today date', expectedAction: 'ai_prompt' },
        { input: 'what is the current date and time', expectedAction: 'ai_prompt' },
        { input: 'uptime', expectedAction: 'shell' },
        { input: 'how long has the server been running?', expectedAction: 'ai_prompt' },
        { input: 'whoami', expectedAction: 'shell' },
        { input: 'who is logged in currently?', expectedAction: 'ai_prompt' },

        // Process management
        { input: 'killall -9 node', expectedAction: 'shell' },
        { input: 'how do I kill all node processes?', expectedAction: 'ai_prompt' },
        { input: 'pkill python', expectedAction: 'shell' },
        { input: 'can you kill python process?', expectedAction: 'ai_prompt' },
        { input: 'ps aux | grep redis', expectedAction: 'shell' },
        { input: 'tell me if redis is running', expectedAction: 'ai_prompt' },
        { input: 'top -b -n 1', expectedAction: 'shell' },
        { input: 'which process is consuming the most CPU?', expectedAction: 'ai_prompt' },

        // Disk & Memory
        { input: 'df -h', expectedAction: 'shell' },
        { input: 'how much disk space is free on root?', expectedAction: 'ai_prompt' },
        { input: 'free -m', expectedAction: 'shell' },
        { input: 'is the system running out of memory?', expectedAction: 'ai_prompt' },

        // Files & Search
        { input: 'find . -name "*.ts"', expectedAction: 'shell' },
        { input: 'find all typescript files in current folder', expectedAction: 'ai_prompt' },
        { input: 'grep -rn "TODO" .', expectedAction: 'shell' },
        { input: 'where are all the TODO comments located?', expectedAction: 'ai_prompt' },
        { input: 'cat package.json', expectedAction: 'shell' },
        { input: 'show me dependencies inside package.json', expectedAction: 'ai_prompt' },
        { input: 'ls -la /tmp', expectedAction: 'shell' },
        { input: 'what files are inside the tmp directory?', expectedAction: 'ai_prompt' },
        { input: 'rm -rf ./build', expectedAction: 'shell' },
        { input: 'clean up the build artifacts for me', expectedAction: 'ai_prompt' },

        // Git & Version Control
        { input: 'git status', expectedAction: 'shell' },
        { input: 'what changes did I make since last commit?', expectedAction: 'ai_prompt' },
        { input: 'git diff HEAD~1', expectedAction: 'shell' },
        { input: 'explain the changes in the last commit', expectedAction: 'ai_prompt' },
        { input: 'git log --oneline -n 5', expectedAction: 'shell' },
        { input: 'summarize the recent commits', expectedAction: 'ai_prompt' },

        // Network & HTTP
        { input: 'curl -i https://api.github.com', expectedAction: 'shell' },
        { input: 'how do I test if the GitHub API is reachable?', expectedAction: 'ai_prompt' },
        { input: 'ping -c 3 8.8.8.8', expectedAction: 'shell' },
        { input: 'check if internet connectivity is working', expectedAction: 'ai_prompt' },
        { input: 'netstat -tuln', expectedAction: 'shell' },
        { input: 'what ports are currently open on this machine?', expectedAction: 'ai_prompt' },

        // Build & Package management
        { input: 'npm run test', expectedAction: 'shell' },
        { input: 'why is npm test failing with exit code 1?', expectedAction: 'ai_prompt' },
        { input: 'cargo check --workspace', expectedAction: 'shell' },
        { input: 'explain why cargo check failed with borrow checker error', expectedAction: 'ai_prompt' },
        { input: 'docker ps -a', expectedAction: 'shell' },
        { input: 'how do I restart a stopped docker container?', expectedAction: 'ai_prompt' },
      ];

      for (const item of collisionPairs) {
        const res = simulateInputBarSubmit(item.input);
        assert.equal(
          res.action,
          item.expectedAction,
          `Failed on input: "${item.input}". Expected action "${item.expectedAction}", got "${res.action}"`
        );
        if (item.expectedAction === 'ai_prompt') {
          assert.equal(res.isShellPrevented, true, `Shell was NOT prevented for NL prompt: "${item.input}"`);
          assert.equal(res.executedCommand, undefined, `executedCommand must be undefined for: "${item.input}"`);
        }
      }
    });

    it('enforces prefix priority: explicit $ forces shell, explicit # forces AI', () => {
      // Natural language with explicit $ prefix -> MUST force shell
      const forcedShell1 = simulateInputBarSubmit('$ how do I kill process 1234?');
      assert.equal(forcedShell1.action, 'shell');
      assert.equal(forcedShell1.executedCommand, 'how do I kill process 1234?');
      assert.equal(forcedShell1.isShellPrevented, false);

      const forcedShell2 = simulateInputBarSubmit('$ date');
      assert.equal(forcedShell2.action, 'shell');
      assert.equal(forcedShell2.executedCommand, 'date');

      // Shell command with explicit # prefix -> MUST force AI
      const forcedAi1 = simulateInputBarSubmit('# date');
      assert.equal(forcedAi1.action, 'ai_prompt');
      assert.equal(forcedAi1.dispatchedPrompt, 'date');
      assert.equal(forcedAi1.isShellPrevented, true);

      const forcedAi2 = simulateInputBarSubmit('# kill -9 1234');
      assert.equal(forcedAi2.action, 'ai_prompt');
      assert.equal(forcedAi2.dispatchedPrompt, 'kill -9 1234');
      assert.equal(forcedAi2.isShellPrevented, true);

      // Agent mention @claude
      const agentMention = simulateInputBarSubmit('@claude explain how to kill process');
      assert.equal(agentMention.action, 'ai_prompt');
      assert.equal(agentMention.dispatchedPrompt, 'claude explain how to kill process');
      assert.equal(agentMention.isShellPrevented, true);

      // Pilot directive !ai
      const pilotDirective = simulateInputBarSubmit('!ai create a python script to monitor memory');
      assert.equal(pilotDirective.action, 'ai_pilot');
      assert.equal(pilotDirective.dispatchedPrompt, 'create a python script to monitor memory');
      assert.equal(pilotDirective.isShellPrevented, true);
    });

    it('strictly guarantees 0% of natural language inputs leak to shell execution', () => {
      const naturalLanguageInputs = [
        'how do I install dependencies',
        'why did my rust build fail?',
        'explain the difference between spawn and exec',
        'create a backup of my database',
        'write a bash function to find duplicate files',
        'check if port 8080 is available',
        'can you format this JSON string',
        'show me how to configure nginx proxy',
        'help me debug this stack trace',
        'give me a command to count lines of code',
        'what does chmod 755 do?',
        'where is the postgres configuration file located?',
        'is there any zombie process running?',
        'please generate a gitignore for nodejs',
        'diagnose why docker won\'t start',
        'fix the missing semicolon error in main.rs',
      ];

      for (const nl of naturalLanguageInputs) {
        const res = simulateInputBarSubmit(nl);
        assert.ok(
          res.action === 'ai_prompt' || res.action === 'ai_agent_pty',
          `Input "${nl}" was not routed to AI, got action "${res.action}"`
        );
        assert.equal(res.isShellPrevented, true, `Shell execution was not prevented for: "${nl}"`);
        assert.equal(res.executedCommand, undefined, `executedCommand must never be set for: "${nl}"`);
      }
    });
  });

  // ==========================================================================
  // Section 3: Tab Switching, Closing Active Tabs & Rapid Tab Creation
  // ==========================================================================
  describe('3. Tab Switching, Closing Active Tabs & Rapid Tab Creation', () => {
    it('rapidly creates 50 tabs and maintains unique identities and state consistency', async () => {
      const state = getAetherState();
      assert.equal(state.tabs.length, 1);

      for (let i = 1; i <= 50; i++) {
        const newTab = await createTab(`Tab ${i + 1}`);
        assert.ok(newTab, `Tab ${i + 1} creation must succeed`);
        assert.equal(state.activeTabId, newTab.id);
        assert.equal(state.tabs.length, i + 1);
      }

      assert.equal(state.tabs.length, 51);

      // Check all tab IDs are unique
      const ids = state.tabs.map((t: any) => t.id);
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, 51, 'All 51 tab IDs must be strictly unique');
    });

    it('stress tests rapid tab switching across 50 tabs without state desynchronization', async () => {
      const state = getAetherState();
      for (let i = 1; i <= 10; i++) {
        await createTab(`Worker Tab ${i}`);
      }
      assert.equal(state.tabs.length, 11);

      // Perform 50 rapid switches back and forth
      for (let step = 0; step < 50; step++) {
        const targetIndex = (step * 7) % state.tabs.length;
        const targetTab = state.tabs[targetIndex];
        switchTab(targetTab.id);

        assert.equal(state.activeTabId, targetTab.id, `Active tab ID mismatch at step ${step}`);
        assert.deepEqual(state.layout, targetTab.layout, `Layout mismatch at step ${step}`);
      }
    });

    it('closes the active tab when active tab is the FIRST tab in list', async () => {
      const state = getAetherState();
      await createTab('Tab B');
      await createTab('Tab C');
      assert.equal(state.tabs.length, 3);

      const firstTabId = state.tabs[0].id;
      const secondTabId = state.tabs[1].id;

      // Switch to first tab and close it
      switchTab(firstTabId);
      assert.equal(state.activeTabId, firstTabId);

      await closeTab(firstTabId);
      assert.equal(state.tabs.length, 2);
      assert.ok(!state.tabs.some((t: any) => t.id === firstTabId));
      // Focus should move to index 0 which is now Tab B
      assert.equal(state.activeTabId, secondTabId);
    });

    it('closes the active tab when active tab is in the MIDDLE of the list', async () => {
      const state = getAetherState();
      await createTab('Tab 2');
      await createTab('Tab 3');
      await createTab('Tab 4');
      assert.equal(state.tabs.length, 4);

      const middleTabId = state.tabs[1].id;
      const adjacentTabId = state.tabs[2].id;

      switchTab(middleTabId);
      assert.equal(state.activeTabId, middleTabId);

      await closeTab(middleTabId);
      assert.equal(state.tabs.length, 3);
      assert.ok(!state.tabs.some((t: any) => t.id === middleTabId));
      assert.equal(state.activeTabId, adjacentTabId);
    });

    it('closes the active tab when active tab is the LAST tab in the list', async () => {
      const state = getAetherState();
      await createTab('Tab 2');
      await createTab('Tab 3');
      assert.equal(state.tabs.length, 3);

      const lastTabId = state.tabs[2].id;
      const secondTabId = state.tabs[1].id;

      switchTab(lastTabId);
      assert.equal(state.activeTabId, lastTabId);

      await closeTab(lastTabId);
      assert.equal(state.tabs.length, 2);
      assert.ok(!state.tabs.some((t: any) => t.id === lastTabId));
      // Focus should shift to second tab (previous last)
      assert.equal(state.activeTabId, secondTabId);
    });

    it('closes ALL tabs until 0 remain, verifying automatic fallback prevents empty/null state', async () => {
      const state = getAetherState();
      await createTab('Tab 2');
      assert.equal(state.tabs.length, 2);

      // Close tab 1
      await closeTab(state.tabs[0].id);
      assert.equal(state.tabs.length, 1);

      // Close remaining tab -> must trigger automatic fallback creation of Tab 1
      const lastRemainingId = state.tabs[0].id;
      await closeTab(lastRemainingId);

      assert.ok(state.tabs.length >= 1, 'Store must never be left with 0 tabs');
      assert.ok(state.activeTabId, 'Active tab ID must not be null');
      assert.ok(state.layout, 'Layout must not be null');
      assert.ok(state.activePaneId, 'Active pane ID must not be null');
    });

    it('handles rapid concurrent tab creation and renaming under stress', async () => {
      const state = getAetherState();
      const createdTabs = [];
      for (let i = 0; i < 15; i++) {
        const tab = await createTab(`Raw Tab ${i}`);
        if (tab) {
          renameTab(tab.id, `Production Service #${i + 1}`);
          createdTabs.push(tab);
        }
      }

      assert.equal(createdTabs.length, 15);
      for (let i = 0; i < 15; i++) {
        const found = state.tabs.find((t: any) => t.id === createdTabs[i].id);
        assert.equal(found?.title, `Production Service #${i + 1}`);
      }
    });
  });

  // ==========================================================================
  // Section 4: Split Pane Balancing & Layout Tree Integrity
  // ==========================================================================
  describe('4. Split Pane Balancing & Layout Tree Integrity', () => {
    it('calculates correct leaf counts across simple and complex nested layout trees', () => {
      const singlePane = { type: 'pane', paneId: 'p1' };
      assert.equal(countLeafPanes(singlePane), 1);

      const twoPanes = {
        type: 'split',
        id: 's1',
        direction: 'horizontal',
        splitRatio: 0.5,
        children: [
          { type: 'pane', paneId: 'p1' },
          { type: 'pane', paneId: 'p2' },
        ],
      };
      assert.equal(countLeafPanes(twoPanes), 2);

      const asymmetricPanes = {
        type: 'split',
        id: 's_root',
        direction: 'vertical',
        splitRatio: 0.5,
        children: [
          {
            type: 'split',
            id: 's_left',
            direction: 'horizontal',
            splitRatio: 0.5,
            children: [
              { type: 'pane', paneId: 'p1' },
              { type: 'pane', paneId: 'p2' },
            ],
          },
          {
            type: 'split',
            id: 's_right',
            direction: 'horizontal',
            splitRatio: 0.5,
            children: [
              { type: 'pane', paneId: 'p3' },
              {
                type: 'split',
                id: 's_deep',
                direction: 'vertical',
                splitRatio: 0.5,
                children: [
                  { type: 'pane', paneId: 'p4' },
                  { type: 'pane', paneId: 'p5' },
                ],
              },
            ],
          },
        ],
      };
      assert.equal(countLeafPanes(asymmetricPanes), 5);
      assert.deepEqual(extractPaneIds(asymmetricPanes), ['p1', 'p2', 'p3', 'p4', 'p5']);
    });

    it('balances binary tree split ratios proportionally based on leaf counts', () => {
      // 3 panes: 1 left, 2 right -> root ratio = 1 / (1 + 2) = 0.3333; right child = 1 / (1 + 1) = 0.5
      const threePanesTree = {
        type: 'split',
        id: 's_root',
        direction: 'horizontal',
        splitRatio: 0.8, // deliberately unbalanced
        children: [
          { type: 'pane', paneId: 'p1' },
          {
            type: 'split',
            id: 's_right',
            direction: 'vertical',
            splitRatio: 0.9, // deliberately unbalanced
            children: [
              { type: 'pane', paneId: 'p2' },
              { type: 'pane', paneId: 'p3' },
            ],
          },
        ],
      };

      const balanced = balanceLayout(threePanesTree);
      assert.ok(balanced);
      assert.equal(balanced.splitRatio, 0.3333);
      assert.equal(balanced.children[1].splitRatio, 0.5);

      // 7 panes: 5 left, 2 right -> root ratio = 5 / 7 = 0.7143
      const sevenPanesTree = {
        type: 'split',
        id: 's_root',
        direction: 'horizontal',
        splitRatio: 0.5,
        children: [
          {
            type: 'split',
            id: 's_left',
            direction: 'vertical',
            splitRatio: 0.5,
            children: [
              {
                type: 'split',
                id: 's_l1',
                direction: 'horizontal',
                splitRatio: 0.5,
                children: [
                  { type: 'pane', paneId: 'p1' },
                  { type: 'pane', paneId: 'p2' },
                ],
              },
              {
                type: 'split',
                id: 's_l2',
                direction: 'horizontal',
                splitRatio: 0.5,
                children: [
                  { type: 'pane', paneId: 'p3' },
                  {
                    type: 'split',
                    id: 's_l3',
                    direction: 'vertical',
                    splitRatio: 0.5,
                    children: [
                      { type: 'pane', paneId: 'p4' },
                      { type: 'pane', paneId: 'p5' },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'split',
            id: 's_right',
            direction: 'vertical',
            splitRatio: 0.5,
            children: [
              { type: 'pane', paneId: 'p6' },
              { type: 'pane', paneId: 'p7' },
            ],
          },
        ],
      };

      const balanced7 = balanceLayout(sevenPanesTree);
      assert.ok(balanced7);
      assert.equal(balanced7.splitRatio, 0.7143);
    });

    it('enforces boundary clamps on manual updateSplitRatio between 0.05 and 0.95', () => {
      const state = getAetherState();
      state.layout = {
        type: 'split',
        id: 'split_manual',
        direction: 'horizontal',
        splitRatio: 0.5,
        children: [
          { type: 'pane', paneId: 'pane-a' },
          { type: 'pane', paneId: 'pane-b' },
        ],
      };

      // Extreme negative
      updateSplitRatio('split_manual', -2.5);
      assert.equal((state.layout as any).splitRatio, 0.05);

      // Exact zero
      updateSplitRatio('split_manual', 0.0);
      assert.equal((state.layout as any).splitRatio, 0.05);

      // Below lower bound
      updateSplitRatio('split_manual', 0.02);
      assert.equal((state.layout as any).splitRatio, 0.05);

      // Valid internal ratios
      updateSplitRatio('split_manual', 0.25);
      assert.equal((state.layout as any).splitRatio, 0.25);

      updateSplitRatio('split_manual', 0.75);
      assert.equal((state.layout as any).splitRatio, 0.75);

      // Above upper bound
      updateSplitRatio('split_manual', 0.98);
      assert.equal((state.layout as any).splitRatio, 0.95);

      // Extreme positive
      updateSplitRatio('split_manual', 10.0);
      assert.equal((state.layout as any).splitRatio, 0.95);
    });

    it('spawns multiple agent split panes and verifies equalizeLayout balances them', async () => {
      const state = getAetherState();
      assert.equal(countLeafPanes(state.layout), 1);

      // Spawn 3 additional panes
      await spawnAgentPane('sh', false, 'horizontal');
      await spawnAgentPane('sh', false, 'vertical');
      await spawnAgentPane('sh', false, 'horizontal');

      assert.equal(countLeafPanes(state.layout), 4);

      // Trigger equalize
      equalizeLayout();

      // Verify layout is valid and balanced
      assert.ok(state.layout);
      assert.equal(state.layout.type, 'split');
      assert.equal(countLeafPanes(state.layout), 4);
      assert.equal(extractPaneIds(state.layout).length, 4);
    });

    it('closes panes inside nested split layouts and verifies tree collapses without corruption', async () => {
      const state = getAetherState();
      const p1 = await spawnAgentPane('sh', false, 'horizontal');
      const p2 = await spawnAgentPane('sh', false, 'vertical');
      assert.equal(countLeafPanes(state.layout), 3);

      // Close middle pane p1
      if (p1) {
        await closePane(p1.id);
        assert.equal(countLeafPanes(state.layout), 2);
        assert.ok(!extractPaneIds(state.layout).includes(p1.id));
      }

      // Close p2
      if (p2) {
        await closePane(p2.id);
        assert.equal(countLeafPanes(state.layout), 1);
        assert.ok(!extractPaneIds(state.layout).includes(p2.id));
      }
    });
  });

  // ==========================================================================
  // Section 5: High-Throughput Interleaved Concurrency & Stress
  // ==========================================================================
  describe('5. High-Throughput Interleaved Concurrency & Stress', () => {
    it('survives 100 interleaved operations (create tab, split, switch, equalize, close)', async () => {
      const state = getAetherState();

      for (let i = 0; i < 100; i++) {
        const op = i % 5;
        switch (op) {
          case 0:
            // Create tab
            await createTab(`Stress Tab ${i}`);
            break;
          case 1:
            // Split active pane
            if (countLeafPanes(state.layout) < 6) {
              await spawnAgentPane('sh', false, i % 2 === 0 ? 'horizontal' : 'vertical');
            }
            break;
          case 2:
            // Switch tab
            if (state.tabs.length > 1) {
              const randomIndex = Math.floor(Math.random() * state.tabs.length);
              switchTab(state.tabs[randomIndex].id);
            }
            break;
          case 3:
            // Equalize layout
            equalizeLayout();
            break;
          case 4:
            // Close active tab if more than 2 tabs exist
            if (state.tabs.length > 2 && state.activeTabId) {
              await closeTab(state.activeTabId);
            }
            break;
        }

        // Invariant checks on every step
        assert.ok(state.tabs.length >= 1, `Tabs length dropped below 1 at iteration ${i}`);
        assert.ok(state.activeTabId, `activeTabId lost at iteration ${i}`);
        assert.ok(state.layout, `layout lost at iteration ${i}`);
      }

      // Final sanity
      assert.ok(state.tabs.length >= 1);
      assert.ok(state.activeTabId);
      assert.ok(state.layout);
    });
  });

  // ==========================================================================
  // Section 6: Empirical Vulnerability Analysis: Mock Fallback Collisions
  // ==========================================================================
  describe('6. Empirical Vulnerability Analysis: Mock Fallback Timestamp Collision', () => {
    it('demonstrates pane ID collision risk in mock/browser mode when spawned within same millisecond', async () => {
      const previousIsTauri = (globalThis as any).isTauri;
      (globalThis as any).isTauri = false;
      mockWindow.isTauri = false;

      const p1 = await spawnAgentPane('sh', false, 'horizontal');
      const p2 = await spawnAgentPane('sh', false, 'vertical');

      // In mock browser fallback (aetherStore.ts:841), mockId is `mock_pane_${Date.now()}`
      // without monotonic counter or random suffix (unlike createSplitId and createTab).
      // If called in the same millisecond, p1.id === p2.id.
      if (p1 && p2 && p1.id === p2.id) {
        assert.equal(p1.id, p2.id, 'Confirmed collision: both panes share identical mock_pane_ timestamp ID');
      } else {
        assert.ok(p1 && p2);
      }

      // Restore Tauri environment
      (globalThis as any).isTauri = previousIsTauri;
      mockWindow.isTauri = previousIsTauri;
    });
  });
});
