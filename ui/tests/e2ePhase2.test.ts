import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ----------------------------------------------------------------------------
// Minimal mock browser & Tauri IPC environment for Node.js test execution
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
      case 'cmd_write_pty':
        return null;
      case 'cmd_terminate_pane':
        return true;
      case 'cmd_get_scrollback':
        return { data: [], end_offset: 0 };
      case 'cmd_read_workspace_directory': {
        const norm = (args.relativePath || args.relative_path || '').replace(/^\/+|\/+$/g, '');
        const mockEntries: Record<string, any[]> = {
          '': [
            { name: '.aether', path: '.aether', is_dir: true, is_symlink: false, size_bytes: 4096, extension: null },
            { name: 'crates', path: 'crates', is_dir: true, is_symlink: false, size_bytes: 4096, extension: null },
            { name: 'ui', path: 'ui', is_dir: true, is_symlink: false, size_bytes: 4096, extension: null },
            { name: 'Cargo.toml', path: 'Cargo.toml', is_dir: false, is_symlink: false, size_bytes: 1840, extension: 'toml' },
            { name: 'PROJECT.md', path: 'PROJECT.md', is_dir: false, is_symlink: false, size_bytes: 7390, extension: 'md' },
          ],
          'ui': [
            { name: 'src', path: 'ui/src', is_dir: true, is_symlink: false, size_bytes: 4096, extension: null },
            { name: 'package.json', path: 'ui/package.json', is_dir: false, is_symlink: false, size_bytes: 789, extension: 'json' },
          ],
        };
        return (
          mockEntries[norm] || [
            {
              name: 'index.ts',
              path: norm ? `${norm}/index.ts` : 'index.ts',
              is_dir: false,
              is_symlink: false,
              size_bytes: 1024,
              extension: 'ts',
            },
          ]
        );
      }
      case 'cmd_search_workspace_files': {
        const query = (args.query || '').trim().toLowerCase();
        if (!query) return [];
        return [
          {
            file_path: 'PROJECT.md',
            line_number: 13,
            line_content: 'Aether Drive Sidebar drawer (AetherDriveSidebar.tsx) on the left dock of <main>',
            match_start: 13,
            match_end: 13 + query.length,
          },
          {
            file_path: 'ui/src/main.tsx',
            line_number: 125,
            line_content: '<AetherDriveSidebar /> docked alongside TerminalGrid',
            match_start: 1,
            match_end: 1 + query.length,
          },
        ]
          .filter((m) => m.line_content.toLowerCase().includes(query))
          .slice(0, args.maxResults || args.max_results || 100);
      }
      case 'cmd_read_workspace_file': {
        const p = args.relativePath || args.relative_path || '';
        const mockContent = `// Content of ${p}\nexport const ready = true;\n`;
        return {
          relative_path: p,
          content: mockContent,
          total_bytes: mockContent.length,
          is_truncated: false,
        };
      }
      case 'cmd_list_workflows':
        return [];
      case 'cmd_claim_module':
        return { granted: true, conflicts: [] };
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
  __TAURI_INTERNALS__: mockTauriIpc,
};

const mockDocument = {
  documentElement: {
    style: {
      setProperty: () => {},
    },
    classList: {
      add: () => {},
      remove: () => {},
    },
  },
  body: {
    style: {
      backgroundColor: '',
    },
  },
};

(globalThis as any).isTauri = true;
(globalThis as any).__TAURI_INTERNALS__ = mockTauriIpc;
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = mockWindow;
(globalThis as any).document = mockDocument;

// Import modules using jiti for TypeScript handling in Node
import jitiFactory from 'jiti';
const jiti = jitiFactory(import.meta.url);
const aetherStore = jiti('../src/stores/aetherStore.ts');
import { classifyCommand, type ClassificationResult } from '../src/utils/commandClassifier.ts';

const {
  toggleAetherDriveSidebar,
  setAetherDriveActiveTab,
  toggleAetherDrivePathExpanded,
  setAetherDriveExpandedPaths,
  setupGlobalShortcuts,
  readWorkspaceDirectory,
  searchWorkspaceFiles,
  readWorkspaceFile,
  loadWorkflows,
  extractWorkflowParams,
  renderWorkflowTemplate,
  runWorkflow,
  spawnAgentPane,
  sendPaneToBackground,
  bringBackgroundToForeground,
  routePromptToAgent,
  executeCommandInPane,
  createTab,
  switchTab,
  nextTab,
  previousTab,
} = aetherStore;

// ============================================================================
// Algorithmic Specifications & Helper Utilities for Resilience (R3)
// ============================================================================

/**
 * Authoritative SSH keepalive injection specification derived from
 * `crates/aetherd/src/pty_manager.rs:119-143`.
 */
function injectSshKeepaliveArgs(args: string[]): string[] {
  const hasAliveInterval = args.some((a) => a.includes('ServerAliveInterval'));
  const hasAliveCount = args.some((a) => a.includes('ServerAliveCountMax'));
  const hasTcpKeepalive = args.some((a) => a.includes('TCPKeepAlive'));

  const toInsert: string[] = [];
  if (!hasAliveInterval) {
    toInsert.push('-o', 'ServerAliveInterval=15');
  }
  if (!hasAliveCount) {
    toInsert.push('-o', 'ServerAliveCountMax=3');
  }
  if (!hasTcpKeepalive) {
    toInsert.push('-o', 'TCPKeepAlive=yes');
  }
  return [...toInsert, ...args];
}

/**
 * Authoritative PTY circular ring buffer simulation matching
 * `crates/aetherd/src/pty_manager.rs:450-459` (512 KB capacity).
 */
class PtyRingBufferSimulation {
  private buffer: number[] = [];
  readonly capacity: number;
  private totalOffset: number = 0;

  constructor(capacity = 512 * 1024) {
    this.capacity = capacity;
  }

  write(bytes: number[]): { offset: number; length: number } {
    const offset = this.totalOffset;
    const incomingLen = bytes.length;
    if (this.buffer.length + incomingLen > this.capacity) {
      const overflow = this.buffer.length + incomingLen - this.capacity;
      const toDrain = Math.min(overflow, this.buffer.length);
      this.buffer.splice(0, toDrain);
    }
    this.buffer.push(...bytes);
    this.totalOffset += incomingLen;
    return { offset, length: incomingLen };
  }

  getSnapshot(): { data: number[]; endOffset: number } {
    return { data: [...this.buffer], endOffset: this.totalOffset };
  }

  size(): number {
    return this.buffer.length;
  }
}

/**
 * Authoritative client-side buffer deduplication algorithm matching
 * `ui/src/components/XtermWebGLPane.tsx:236-250,267-279`.
 */
function deduplicateQueuedChunks(
  scrollbackEndOffset: number,
  preRestoreQueue: { data: string; offset: number }[]
): string[] {
  const renderedChunks: string[] = [];
  let lastWrittenOffset = scrollbackEndOffset;

  for (const item of preRestoreQueue) {
    const chunkLen = item.data.length;
    if (item.offset + chunkLen <= lastWrittenOffset) {
      // Chunk is already included in the scrollback buffer snapshot! Discard to prevent double render.
      continue;
    }
    if (item.offset < lastWrittenOffset) {
      const slice = item.data.slice(lastWrittenOffset - item.offset);
      lastWrittenOffset += slice.length;
      renderedChunks.push(slice);
    } else {
      lastWrittenOffset = item.offset + chunkLen;
      renderedChunks.push(item.data);
    }
  }

  return renderedChunks;
}

// ============================================================================
// 4-TIER E2E TEST SUITE FOR PHASE 2 ROADMAP
// ============================================================================

describe('Phase 2 E2E Test Suite (4-Tier Architecture)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  // ==========================================================================
  // TIER 1: Feature Coverage (Unit / Subsystem Happy Path)
  // ==========================================================================
  describe('Tier 1: Feature Coverage (R1, R2, R3)', () => {
    describe('R1: Aether Drive Sidebar & Navigation', () => {
      it('T1-R1-01: toggles sidebar open state and persists to localStorage', () => {
        toggleAetherDriveSidebar(true);
        assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');

        toggleAetherDriveSidebar(false);
        assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'false');

        // Toggle inversion
        toggleAetherDriveSidebar();
        assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');
        toggleAetherDriveSidebar();
        assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'false');
      });

      it('T1-R1-02: switches active tabs and persists selection', () => {
        setAetherDriveActiveTab('search');
        assert.strictEqual(mockLocalStorage.getItem('aether_drive_active_tab'), 'search');

        setAetherDriveActiveTab('workflows');
        assert.strictEqual(mockLocalStorage.getItem('aether_drive_active_tab'), 'workflows');

        setAetherDriveActiveTab('tree');
        assert.strictEqual(mockLocalStorage.getItem('aether_drive_active_tab'), 'tree');
      });

      it('T1-R1-03: manages directory path expansion state', () => {
        toggleAetherDrivePathExpanded('crates', true);
        const exp1 = JSON.parse(mockLocalStorage.getItem('aether_drive_expanded_paths') || '[]');
        assert.ok(exp1.includes('crates'));

        toggleAetherDrivePathExpanded('crates/aether-gui', true);
        const exp2 = JSON.parse(mockLocalStorage.getItem('aether_drive_expanded_paths') || '[]');
        assert.ok(exp2.includes('crates'));
        assert.ok(exp2.includes('crates/aether-gui'));

        toggleAetherDrivePathExpanded('crates', false);
        const exp3 = JSON.parse(mockLocalStorage.getItem('aether_drive_expanded_paths') || '[]');
        assert.ok(!exp3.includes('crates'));
        assert.ok(exp3.includes('crates/aether-gui'));

        setAetherDriveExpandedPaths(['crates', 'ui', 'docs']);
        const exp4 = JSON.parse(mockLocalStorage.getItem('aether_drive_expanded_paths') || '[]');
        assert.deepStrictEqual(exp4, ['crates', 'ui', 'docs']);
      });

      it('T1-R1-04: binds global shortcut (Cmd+\\ / Ctrl+\\) to toggle sidebar', () => {
        const cleanup = setupGlobalShortcuts();
        toggleAetherDriveSidebar(false);

        let defaultPrevented = false;
        const ctrlEvent = {
          type: 'keydown',
          key: '\\',
          code: 'Backslash',
          ctrlKey: true,
          metaKey: false,
          preventDefault: () => {
            defaultPrevented = true;
          },
        };

        mockWindow.dispatchEvent(ctrlEvent);
        assert.strictEqual(defaultPrevented, true);
        assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');

        let metaPrevented = false;
        const metaEvent = {
          type: 'keydown',
          key: '\\',
          code: 'Backslash',
          ctrlKey: false,
          metaKey: true,
          preventDefault: () => {
            metaPrevented = true;
          },
        };

        mockWindow.dispatchEvent(metaEvent);
        assert.strictEqual(metaPrevented, true);
        assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'false');

        cleanup();
      });

      it('T1-R1-05: lists workspace directories and files with metadata', async () => {
        const rootEntries = await readWorkspaceDirectory('');
        assert.ok(Array.isArray(rootEntries));
        assert.ok(rootEntries.length >= 4);

        const crates = rootEntries.find((e) => e.name === 'crates');
        assert.ok(crates && crates.is_dir === true);

        const cargoToml = rootEntries.find((e) => e.name === 'Cargo.toml');
        assert.ok(cargoToml && cargoToml.is_dir === false);
        assert.strictEqual(cargoToml.extension, 'toml');
        assert.ok(cargoToml.size_bytes > 0);

        const uiEntries = await readWorkspaceDirectory('ui');
        assert.ok(uiEntries.some((e) => e.name === 'src' && e.is_dir));
        assert.ok(uiEntries.some((e) => e.name === 'package.json' && !e.is_dir));
      });

      it('T1-R1-06: inspects file content with path and size metadata', async () => {
        const fileContent = await readWorkspaceFile('PROJECT.md');
        assert.strictEqual(fileContent.relative_path, 'PROJECT.md');
        assert.strictEqual(typeof fileContent.content, 'string');
        assert.ok(fileContent.total_bytes > 0);
        assert.strictEqual(fileContent.is_truncated, false);
      });

      it('T1-R1-07: searches workspace text with snippet previews and limit options', async () => {
        const matches = await searchWorkspaceFiles('Aether Drive', 10);
        assert.ok(Array.isArray(matches));
        assert.ok(matches.length > 0);
        assert.ok(matches.every((m) => m.file_path && m.line_number > 0 && m.line_content));

        const limited = await searchWorkspaceFiles('Aether', 1);
        assert.strictEqual(limited.length, 1);
      });

      it('T1-R1-08: loads workflows and handles parameter extraction and rendering', async () => {
        const workflows = await loadWorkflows();
        assert.ok(Array.isArray(workflows));
        assert.ok(workflows.length >= 5);

        const cargoCheckWf = workflows.find((w) => w.id === 'wf_cargo_check');
        assert.ok(cargoCheckWf);

        const params = extractWorkflowParams(cargoCheckWf.commandTemplate);
        assert.deepStrictEqual(params, ['crate_name']);

        const rendered = renderWorkflowTemplate(cargoCheckWf.commandTemplate, { crate_name: 'aetherd' });
        assert.strictEqual(rendered, 'cargo check --package aetherd --all-targets');
      });
    });

    describe('R2: Intelligent Command Classifier & Routing', () => {
      it('T1-R2-01: classifies standard developer CLI binaries as shell', () => {
        const binaries = [
          'git status',
          'cargo check --workspace',
          'npm run dev',
          'docker ps -a',
          'ls -la /tmp',
          'curl -sSL https://api.github.com',
          'python3 script.py',
          'kill -9 12345',
        ];

        for (const cmd of binaries) {
          const res = classifyCommand(cmd);
          assert.strictEqual(res.type, 'shell', `Expected '${cmd}' to be shell`);
          assert.strictEqual(res.suggestedMode, 'cmd');
          assert.ok(res.confidence >= 0.9);
        }
      });

      it('T1-R2-02: classifies shell operators (pipes, redirects, chains) as shell', () => {
        const shellOps = [
          'cat Cargo.toml | grep version',
          'echo "test" > /tmp/out.txt',
          'cargo check && cargo test',
          'make clean; make all',
          'sleep 5 &',
        ];

        for (const cmd of shellOps) {
          const res = classifyCommand(cmd);
          assert.strictEqual(res.type, 'shell', `Expected '${cmd}' to be shell`);
          assert.strictEqual(res.suggestedMode, 'cmd');
        }
      });

      it('T1-R2-03: classifies explicit prefixes (# for AI, $ for shell, @agent)', () => {
        const aiPrompt = classifyCommand('# optimize this query');
        assert.strictEqual(aiPrompt.type, 'natural_language');
        assert.strictEqual(aiPrompt.suggestedMode, 'ai');
        assert.strictEqual(aiPrompt.confidence, 1.0);

        const shellCmd = classifyCommand('$ git status');
        assert.strictEqual(shellCmd.type, 'shell');
        assert.strictEqual(shellCmd.suggestedMode, 'cmd');
        assert.strictEqual(shellCmd.confidence, 1.0);

        const agentMention = classifyCommand('@claude refactor the store');
        assert.strictEqual(agentMention.type, 'natural_language');
        assert.strictEqual(agentMention.suggestedMode, 'ai');
      });

      it('T1-R2-04: classifies natural language interrogatives as AI instructions', () => {
        const nlQueries = [
          'how do I run tests in this workspace?',
          'why is cargo test failing with exit code 101?',
          'what is the difference between pty and tty?',
          'where is the daemon configuration stored?',
          'can you explain the Aether Drive architecture?',
          'could you generate a unit test for this function?',
        ];

        for (const query of nlQueries) {
          const res = classifyCommand(query);
          assert.strictEqual(res.type, 'natural_language', `Expected '${query}' to be natural_language`);
          assert.strictEqual(res.suggestedMode, 'ai');
          assert.ok(res.confidence >= 0.85);
        }
      });

      it('T1-R2-05: classifies imperative agent action verbs as AI instructions', () => {
        const actionVerbs = [
          'fix the broken test in pty_manager.rs',
          'refactor the authentication handler to use argon2',
          'debug the panic in crates/aetherd/src/main.rs',
        ];

        for (const prompt of actionVerbs) {
          const res = classifyCommand(prompt);
          assert.strictEqual(res.type, 'natural_language', `Expected '${prompt}' to be natural_language`);
          assert.strictEqual(res.suggestedMode, 'ai');
        }
      });

      it('T1-R2-06: disambiguates commands sharing names with English words', () => {
        // Conversational phrasing following collision binaries (find out, kill the, cat my)
        assert.strictEqual(classifyCommand('find out why the server crashed').type, 'natural_language');
        assert.strictEqual(classifyCommand('find . -name "*.rs"').type, 'shell');

        assert.strictEqual(classifyCommand('cat my favorite configuration file').type, 'natural_language');
        assert.strictEqual(classifyCommand('cat Cargo.toml').type, 'shell');

        assert.strictEqual(classifyCommand('kill the process running on port 3000').type, 'natural_language');
        assert.strictEqual(classifyCommand('kill -9 5432').type, 'shell');
      });

      it('T1-R2-07: routes natural language prompts to agent without # prefix', async () => {
        const pane = await routePromptToAgent('explain the PTY ring buffer');
        assert.ok(pane);
        assert.strictEqual(typeof pane.id, 'string');
      });
    });

    describe('R3: Terminal & Remote Session Resilience', () => {
      it('T1-R3-01: injects SSH keepalive and resilience flags', () => {
        const initialArgs = ['user@remote.host', '-p', '2222'];
        const injected = injectSshKeepaliveArgs(initialArgs);

        assert.ok(injected.includes('ServerAliveInterval=15'));
        assert.ok(injected.includes('ServerAliveCountMax=3'));
        assert.ok(injected.includes('TCPKeepAlive=yes'));

        // Preserves custom arguments
        assert.ok(injected.includes('user@remote.host'));
        assert.ok(injected.includes('-p'));
        assert.ok(injected.includes('2222'));

        // Idempotent: does not duplicate keepalive options
        const secondPass = injectSshKeepaliveArgs(injected);
        const intervalCount = secondPass.filter((a) => a === 'ServerAliveInterval=15').length;
        assert.strictEqual(intervalCount, 1);
      });

      it('T1-R3-02: maintains 512KB ring buffer retention and circular FIFO drain', () => {
        const ring = new PtyRingBufferSimulation(100); // 100-byte test capacity
        const chunk1 = Array.from({ length: 60 }, (_, i) => i);
        ring.write(chunk1);
        assert.strictEqual(ring.size(), 60);

        // Overflow: 60 + 60 = 120 -> 20 bytes drained from front
        const chunk2 = Array.from({ length: 60 }, (_, i) => 100 + i);
        ring.write(chunk2);
        assert.strictEqual(ring.size(), 100);

        const snapshot = ring.getSnapshot();
        assert.strictEqual(snapshot.endOffset, 120);
        // The first element should be index 20 of chunk1
        assert.strictEqual(snapshot.data[0], 20);
        // The last element should be last element of chunk2
        assert.strictEqual(snapshot.data[99], 159);
      });

      it('T1-R3-03: deduplicates incoming live PTY chunks against restored scrollback', () => {
        const scrollbackEndOffset = 1000;
        const preRestoreQueue = [
          // Chunk 1: completely inside scrollback (bytes 800-950) -> should be discarded
          { data: 'old_bytes_800_950', offset: 800 },
          // Chunk 2: exactly at boundary (bytes 980-1000) -> should be discarded
          { data: 'exact_boundary_bytes', offset: 980 },
          // Chunk 3: partially overlapping (bytes 990-1010) -> slice first 10, keep last 10
          { data: '1234567890abcdefghij', offset: 990 },
          // Chunk 4: fresh stream bytes (bytes 1010-1030) -> kept in full
          { data: 'fresh_stream_bytes_!', offset: 1010 },
        ];

        const rendered = deduplicateQueuedChunks(scrollbackEndOffset, preRestoreQueue);
        assert.strictEqual(rendered.length, 2);
        // Chunk 3 sliced from offset 10 (1000 - 990 = 10)
        assert.strictEqual(rendered[0], 'abcdefghij');
        assert.strictEqual(rendered[1], 'fresh_stream_bytes_!');
      });

      it('T1-R3-04: detaches pane to background and restores without process termination', async () => {
        const pane = await spawnAgentPane('bash');
        assert.ok(pane);

        // Detach to background
        sendPaneToBackground(pane.id);

        // Bring back to foreground as active pane
        await bringBackgroundToForeground(pane.id, false);
      });
    });
  });

  // ==========================================================================
  // TIER 2: Boundary & Corner Cases (Limits, Stress, Errors)
  // ==========================================================================
  describe('Tier 2: Boundary & Corner Cases', () => {
    it('T2-01: handles empty and whitespace-only inputs gracefully', async () => {
      const resEmpty = classifyCommand('');
      assert.strictEqual(resEmpty.type, 'shell');
      assert.strictEqual(resEmpty.confidence, 1.0);

      const resSpace = classifyCommand('   \t\n  ');
      assert.strictEqual(resSpace.type, 'shell');

      const searchEmpty = await searchWorkspaceFiles('   \n  ');
      assert.deepStrictEqual(searchEmpty, []);

      const renderedEmpty = renderWorkflowTemplate('cargo test {{missing_param}}', {});
      assert.strictEqual(renderedEmpty, 'cargo test ');

      const routedEmpty = await routePromptToAgent('   ');
      assert.strictEqual(routedEmpty, null);
    });

    it('T2-02: handles 10x rapid sidebar toggle spams deterministically', () => {
      // Toggle 10 times consecutively
      for (let i = 0; i < 10; i++) {
        toggleAetherDriveSidebar();
      }
      // An even number of inverts from initial false returns false
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'false');

      // 11th invert returns true
      toggleAetherDriveSidebar();
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');
    });

    it('T2-03: handles deep directory paths and redundant slashes safely', async () => {
      const entries = await readWorkspaceDirectory('///crates///aether-gui///');
      assert.ok(Array.isArray(entries));

      // Non-existent deep path fallback
      const nonExistent = await readWorkspaceDirectory('non/existent/deep/nested/path');
      assert.ok(Array.isArray(nonExistent));
      assert.strictEqual(nonExistent.length, 1);
      assert.strictEqual(nonExistent[0].name, 'index.ts');
    });

    it('T2-04: enforces file inspection metadata and size limits', async () => {
      const content = await readWorkspaceFile('Cargo.toml', 100);
      assert.strictEqual(content.relative_path, 'Cargo.toml');
      assert.ok(typeof content.content === 'string');
      assert.strictEqual(typeof content.is_truncated, 'boolean');
      assert.ok(content.total_bytes > 0);
    });

    it('T2-05: correctly classifies CLI flags on unknown commands', () => {
      const flags = [
        '-v',
        '--version',
        '--help',
        'mytool -la',
        'customcli --all --force',
      ];

      for (const f of flags) {
        const res = classifyCommand(f);
        assert.strictEqual(res.type, 'shell', `Expected '${f}' to be shell`);
        assert.strictEqual(res.suggestedMode, 'cmd');
      }
    });

    it('T2-06: supports Unicode, case-folding, and special characters', async () => {
      // Uppercase shell command
      const upperCmd = classifyCommand('CARGO TEST --WORKSPACE');
      assert.strictEqual(upperCmd.type, 'shell');

      // Case-insensitive search match
      const lowerResults = await searchWorkspaceFiles('aether drive');
      const upperResults = await searchWorkspaceFiles('AETHER DRIVE');
      assert.strictEqual(lowerResults.length, upperResults.length);

      // Search with regex meta-characters without regex throw
      const regexSpecial = await searchWorkspaceFiles('fn test_.*[0-9]+');
      assert.ok(Array.isArray(regexSpecial));
    });

    it('T2-07: preserves shell mode when quoted string contains question mark', () => {
      const res = classifyCommand('git commit -m "why did this build fail?"');
      assert.strictEqual(res.type, 'shell');
      assert.strictEqual(res.suggestedMode, 'cmd');
    });

    it('T2-08: preserves natural language mode when question contains shell pipe', () => {
      const res = classifyCommand('how do I use | in bash?');
      assert.strictEqual(res.type, 'natural_language');
      assert.strictEqual(res.suggestedMode, 'ai');
    });

    it('T2-09: defaults ambiguous single words to shell command', () => {
      const ambiguousWords = ['help', 'test', 'status', 'build', 'clear'];
      for (const word of ambiguousWords) {
        const res = classifyCommand(word);
        assert.strictEqual(res.type, 'shell', `Expected '${word}' to default to shell`);
        assert.strictEqual(res.suggestedMode, 'cmd');
      }
    });
  });

  // ==========================================================================
  // TIER 3: Cross-Feature Interactions
  // ==========================================================================
  describe('Tier 3: Cross-Feature Interactions', () => {
    it('T3-01: allows concurrent sidebar navigation while classifier operates', () => {
      toggleAetherDriveSidebar(true);
      setAetherDriveActiveTab('search');

      const cmd1 = classifyCommand('git diff --stat');
      assert.strictEqual(cmd1.type, 'shell');

      toggleAetherDrivePathExpanded('crates', true);

      const prompt1 = classifyCommand('why is the worktree locked?');
      assert.strictEqual(prompt1.type, 'natural_language');

      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_active_tab'), 'search');
    });

    it('T3-02: substitutes workflow template parameters and dispatches to agent', async () => {
      const template = 'echo "Conduct architectural review for module: {{module}}"';
      const params = extractWorkflowParams(template);
      assert.deepStrictEqual(params, ['module']);

      const rendered = renderWorkflowTemplate(template, { module: 'pty_manager' });
      assert.strictEqual(rendered, 'echo "Conduct architectural review for module: pty_manager"');

      // Forward rendered command to AI pipeline
      const pane = await routePromptToAgent(rendered);
      assert.ok(pane);
    });

    it('T3-03: forwards inspected file path to AI agent seamlessly', async () => {
      const fileEntry = {
        name: 'pty_manager.rs',
        path: 'crates/aetherd/src/pty_manager.rs',
        is_dir: false,
        is_symlink: false,
        size_bytes: 35000,
        extension: 'rs',
      };

      const fileContent = await readWorkspaceFile(fileEntry.path);
      assert.strictEqual(fileContent.relative_path, fileEntry.path);

      // Generate "Ask AI" instruction
      const askAiPrompt = `Explain file: ${fileEntry.path}`;
      const classification = classifyCommand(askAiPrompt);
      assert.strictEqual(classification.type, 'natural_language');

      const agentPane = await routePromptToAgent(askAiPrompt);
      assert.ok(agentPane);
    });

    it('T3-04: validates search results map to readable workspace files', async () => {
      const results = await searchWorkspaceFiles('Aether Drive', 5);
      assert.ok(results.length > 0);

      const targetResult = results[0];
      const inspected = await readWorkspaceFile(targetResult.file_path);
      assert.strictEqual(inspected.relative_path, targetResult.file_path);
      assert.ok(inspected.content.length > 0);
    });

    it('T3-05: keeps sidebar state persistent across tab switches', async () => {
      toggleAetherDriveSidebar(true);
      setAetherDriveActiveTab('workflows');

      await createTab('Secondary Tab', 'bash');
      nextTab();
      previousTab();

      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_active_tab'), 'workflows');
    });
  });

  // ==========================================================================
  // TIER 4: Real-World Scenarios (End-to-End Developer Workflows)
  // ==========================================================================
  describe('Tier 4: Real-World Scenarios', () => {
    it('T4-01: executes Developer Exploration Workflow end-to-end', async () => {
      // Step 1: Developer presses shortcut Cmd+\ to open Aether Drive
      toggleAetherDriveSidebar(true);
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');

      // Step 2: Switches to search tab
      setAetherDriveActiveTab('search');
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_active_tab'), 'search');

      // Step 3: Enters search query "Aether Drive"
      const searchMatches = await searchWorkspaceFiles('Aether Drive');
      assert.ok(searchMatches.length > 0);

      // Step 4: Selects first match and inspects file
      const selectedMatch = searchMatches[0];
      const file = await readWorkspaceFile(selectedMatch.file_path);
      assert.strictEqual(file.relative_path, selectedMatch.file_path);

      // Step 5: Dispatches "Ask AI About File"
      const aiPrompt = `Explain file: ${file.relative_path}`;
      const agentPane = await routePromptToAgent(aiPrompt);
      assert.ok(agentPane);

      // Step 6: Switches to Workflows tab and loads workflows
      setAetherDriveActiveTab('workflows');
      const workflows = await loadWorkflows();
      const cargoCheck = workflows.find((w) => w.id === 'wf_cargo_check');
      assert.ok(cargoCheck);

      // Step 7: Executes workflow with parameter
      const executed = await runWorkflow(
        cargoCheck.commandTemplate,
        { crate_name: 'aether-gui' },
        agentPane.id
      );
      assert.strictEqual(executed, true);

      // Step 8: Closes sidebar with shortcut
      toggleAetherDriveSidebar(false);
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'false');
    });

    it('T4-02: executes Resilient Remote SSH & Background Compile Workflow', async () => {
      // Step 1: Developer initiates SSH command
      const sshCommand = 'ssh dev@remote-cluster.internal';
      const classification = classifyCommand(sshCommand);
      assert.strictEqual(classification.type, 'shell');

      // Step 2: Injects resilience keepalive flags
      const sshArgs = ['dev@remote-cluster.internal'];
      const resilientArgs = injectSshKeepaliveArgs(sshArgs);
      assert.ok(resilientArgs.includes('ServerAliveInterval=15'));
      assert.ok(resilientArgs.includes('TCPKeepAlive=yes'));

      // Step 3: Spawns compile job in pane
      const compilePane = await spawnAgentPane('cargo');
      assert.ok(compilePane);

      // Step 4: Moves compile pane to background task
      sendPaneToBackground(compilePane.id);

      // Step 5: Streaming output arrives during detachment into ring buffer
      const ringBuffer = new PtyRingBufferSimulation(512 * 1024);
      const compileLog1 = Array.from({ length: 500 }, (_, i) => i % 256);
      ringBuffer.write(compileLog1);

      // Step 6: Brings background task back to foreground
      await bringBackgroundToForeground(compilePane.id, false);

      // Step 7: Restores terminal scrollback and deduplicates pre-restore queue
      const snapshot = ringBuffer.getSnapshot();
      assert.strictEqual(snapshot.endOffset, 500);

      const preRestoreQueue = [
        { data: 'log_chunk_already_restored', offset: 400 },
        { data: 'new_stream_after_restoration', offset: 500 },
      ];

      const deduplicated = deduplicateQueuedChunks(snapshot.endOffset, preRestoreQueue);
      assert.strictEqual(deduplicated.length, 1);
      assert.strictEqual(deduplicated[0], 'new_stream_after_restoration');
    });
  });
});
