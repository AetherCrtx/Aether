import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

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

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = mockWindow;
(globalThis as any).document = mockDocument;

import jitiFactory from 'jiti';
const jiti = jitiFactory(import.meta.url);
const aetherStore = jiti('../src/stores/aetherStore.ts');

const {
  toggleAetherDriveSidebar,
  setAetherDriveActiveTab,
  toggleAetherDrivePathExpanded,
  setAetherDriveExpandedPaths,
  setupGlobalShortcuts,
  readWorkspaceDirectory,
  searchWorkspaceFiles,
  readWorkspaceFile,
  extractWorkflowParams,
  renderWorkflowTemplate,
  runWorkflow,
} = aetherStore;

describe('Aether Drive Sidebar & State Persistence (Milestone 3 / R1)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  describe('Sidebar Toggle & Persistence', () => {
    it('toggles sidebar open state and persists to localStorage', () => {
      // Toggle to true
      toggleAetherDriveSidebar(true);
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');

      // Toggle to false
      toggleAetherDriveSidebar(false);
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'false');

      // Toggle invert
      toggleAetherDriveSidebar();
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');

      toggleAetherDriveSidebar();
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'false');
    });
  });

  describe('Active Tab Switching & Persistence', () => {
    it('sets active tab and persists to localStorage', () => {
      setAetherDriveActiveTab('search');
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_active_tab'), 'search');

      setAetherDriveActiveTab('workflows');
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_active_tab'), 'workflows');

      setAetherDriveActiveTab('tree');
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_active_tab'), 'tree');
    });
  });

  describe('Directory Path Expansion State & Persistence', () => {
    it('toggles path expansion and persists to localStorage as JSON array', () => {
      toggleAetherDrivePathExpanded('crates', true);
      const saved1 = JSON.parse(mockLocalStorage.getItem('aether_drive_expanded_paths') || '[]');
      assert.ok(Array.isArray(saved1));
      assert.ok(saved1.includes('crates'));

      toggleAetherDrivePathExpanded('ui/src', true);
      const saved2 = JSON.parse(mockLocalStorage.getItem('aether_drive_expanded_paths') || '[]');
      assert.ok(saved2.includes('crates'));
      assert.ok(saved2.includes('ui/src'));

      toggleAetherDrivePathExpanded('crates', false);
      const saved3 = JSON.parse(mockLocalStorage.getItem('aether_drive_expanded_paths') || '[]');
      assert.ok(!saved3.includes('crates'));
      assert.ok(saved3.includes('ui/src'));
    });

    it('sets multiple expanded paths via setAetherDriveExpandedPaths', () => {
      setAetherDriveExpandedPaths(['crates', 'ui', 'crates/aether-gui']);
      const saved = JSON.parse(mockLocalStorage.getItem('aether_drive_expanded_paths') || '[]');
      assert.deepStrictEqual(saved, ['crates', 'ui', 'crates/aether-gui']);
    });
  });

  describe('Global Keyboard Shortcut Listener (Cmd+\\ / Ctrl+\\)', () => {
    it('triggers toggleAetherDriveSidebar on Ctrl+\\ and prevents default', () => {
      const cleanup = setupGlobalShortcuts();
      toggleAetherDriveSidebar(false);

      let defaultPrevented = false;
      const fakeEvent = {
        type: 'keydown',
        key: '\\',
        code: 'Backslash',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: () => {
          defaultPrevented = true;
        },
      };

      mockWindow.dispatchEvent(fakeEvent);

      assert.strictEqual(defaultPrevented, true, 'preventDefault should be called on Ctrl+\\');
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'true');

      cleanup();
    });

    it('triggers toggleAetherDriveSidebar on Cmd+\\ (metaKey) and prevents default', () => {
      const cleanup = setupGlobalShortcuts();
      toggleAetherDriveSidebar(true);

      let defaultPrevented = false;
      const fakeEvent = {
        type: 'keydown',
        key: '\\',
        code: 'Backslash',
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false,
        preventDefault: () => {
          defaultPrevented = true;
        },
      };

      mockWindow.dispatchEvent(fakeEvent);

      assert.strictEqual(defaultPrevented, true, 'preventDefault should be called on Cmd+\\');
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'false');

      cleanup();
    });

    it('ignores unrelated keyboard events', () => {
      const cleanup = setupGlobalShortcuts();
      toggleAetherDriveSidebar(false);

      let defaultPrevented = false;
      const fakeEvent = {
        type: 'keydown',
        key: 'k',
        code: 'KeyK',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: () => {
          defaultPrevented = true;
        },
      };

      mockWindow.dispatchEvent(fakeEvent);

      assert.strictEqual(defaultPrevented, false, 'preventDefault should not be called for Ctrl+K');
      assert.strictEqual(mockLocalStorage.getItem('aether_drive_sidebar_open'), 'false');

      cleanup();
    });
  });

  describe('Workspace Directory IPC & Mock Fallback', () => {
    it('reads workspace root entries and differentiates dirs and files', async () => {
      const entries = await readWorkspaceDirectory('');
      assert.ok(Array.isArray(entries));
      assert.ok(entries.length > 0);

      const cratesDir = entries.find((e) => e.name === 'crates');
      assert.ok(cratesDir, 'Root should include crates directory');
      assert.strictEqual(cratesDir.is_dir, true);

      const cargoToml = entries.find((e) => e.name === 'Cargo.toml');
      assert.ok(cargoToml, 'Root should include Cargo.toml');
      assert.strictEqual(cargoToml.is_dir, false);
      assert.strictEqual(cargoToml.extension, 'toml');
    });

    it('reads subdirectories correctly', async () => {
      const uiEntries = await readWorkspaceDirectory('ui');
      assert.ok(Array.isArray(uiEntries));
      assert.ok(uiEntries.some((e) => e.name === 'src' && e.is_dir));
      assert.ok(uiEntries.some((e) => e.name === 'package.json' && !e.is_dir));
    });
  });

  describe('Workspace Text Search IPC & Fallback', () => {
    it('searches workspace text and returns matching results with line numbers', async () => {
      const results = await searchWorkspaceFiles('Aether Drive');
      assert.ok(Array.isArray(results));
      assert.ok(results.length > 0);
      assert.ok(results.every((r) => r.file_path && r.line_number > 0 && r.line_content));
    });

    it('returns empty array for empty query', async () => {
      const results = await searchWorkspaceFiles('   ');
      assert.deepStrictEqual(results, []);
    });

    it('respects maxResults limit', async () => {
      const results = await searchWorkspaceFiles('Aether', 1);
      assert.ok(results.length <= 1);
    });
  });

  describe('Workspace File Content Inspection & Fallback', () => {
    it('reads workspace file content and returns metadata', async () => {
      const content = await readWorkspaceFile('PROJECT.md');
      assert.strictEqual(content.relative_path, 'PROJECT.md');
      assert.ok(typeof content.content === 'string');
      assert.ok(content.total_bytes >= 0);
      assert.strictEqual(typeof content.is_truncated, 'boolean');
    });
  });

  describe('Workflows Execution & Parameter Templating', () => {
    it('extracts unique parameters from workflow templates', () => {
      const params = extractWorkflowParams(
        'docker run -d --name {{container_name}} -p {{port}}:{{port}} {{image_name}}'
      );
      assert.deepStrictEqual(params, ['container_name', 'port', 'image_name']);
    });

    it('renders workflow templates with provided values', () => {
      const rendered = renderWorkflowTemplate('cargo test -p {{crate}} {{test_filter}}', {
        crate: 'aether-gui',
        test_filter: '-- --nocapture',
      });
      assert.strictEqual(rendered, 'cargo test -p aether-gui -- --nocapture');
    });

    it('handles missing template parameters gracefully by replacing with empty string', () => {
      const rendered = renderWorkflowTemplate('echo {{message}} {{flag}}', {
        message: 'hello',
      });
      assert.strictEqual(rendered, 'echo hello ');
    });
  });
});
