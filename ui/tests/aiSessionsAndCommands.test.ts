import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jitiFactory from 'jiti';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock Storage and Environment
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => (storageMap.has(key) ? storageMap.get(key)! : null),
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value));
  },
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  },
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = {
  localStorage: mockLocalStorage,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).document = {
  documentElement: {
    style: { setProperty: () => {}, getPropertyValue: () => '' },
    classList: { add: () => {}, remove: () => {}, contains: () => false },
  },
  body: { style: { backgroundColor: '' } },
};

const jiti = jitiFactory(import.meta.url);
const aetherStore = jiti('../src/stores/aetherStore.ts');

const {
  getAetherState,
  sendAiMessage,
  createAiSession,
  switchAiSession,
  renameAiSession,
  deleteAiSession,
  clearCurrentAiSession,
  getActiveAiSession,
  executeAiCommand,
  AI_COMMANDS,
  setSelectedAiProvider,
  setSelectedAiModel,
} = aetherStore;

describe('AI Assistant Session System & Slash Commands Tests', () => {
  beforeEach(() => {
    storageMap.clear();
    const state = getAetherState();
    state.aiMessages = [];
    state.aiSessions = [
      {
        id: 'session_init',
        title: 'Percakapan Utama',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        provider: 'openai',
        model: 'gpt-4o',
        messages: [],
      },
    ];
    state.activeAiSessionId = 'session_init';
    state.aiLoading = false;
    state.aiError = null;
    state.selectedAiProvider = 'openai';
    state.selectedAiModel = 'gpt-4o';
  });

  describe('1. AI Session Creation, Switching, and Deletion', () => {
    it('creates a new session and sets it active', () => {
      const state = getAetherState();
      const newId = createAiSession('Debug Sesi');

      assert.strictEqual(state.activeAiSessionId, newId);
      assert.strictEqual(state.aiSessions.length, 2);
      assert.strictEqual(state.aiSessions[0].title, 'Debug Sesi');
      assert.strictEqual(state.aiMessages.length, 0);
    });

    it('switches between multiple sessions seamlessly', async () => {
      const state = getAetherState();
      const id1 = state.activeAiSessionId;

      await sendAiMessage('hello in session 1');
      assert.strictEqual(state.aiMessages.length, 2);

      const id2 = createAiSession('Session 2');
      assert.strictEqual(state.aiMessages.length, 0);

      await sendAiMessage('hello in session 2');
      assert.strictEqual(state.aiMessages.length, 2);

      // Switch back to session 1
      switchAiSession(id1);
      assert.strictEqual(state.activeAiSessionId, id1);
      assert.strictEqual(state.aiMessages.length, 2);
      assert.strictEqual(state.aiMessages[0].content, 'hello in session 1');

      // Switch back to session 2
      switchAiSession(id2);
      assert.strictEqual(state.activeAiSessionId, id2);
      assert.strictEqual(state.aiMessages[0].content, 'hello in session 2');
    });

    it('renames an active session', () => {
      const state = getAetherState();
      const current = getActiveAiSession();
      renameAiSession(current.id, 'New Renamed Title');

      assert.strictEqual(current.title, 'New Renamed Title');
    });

    it('deletes a session and safely switches to adjacent session', () => {
      const state = getAetherState();
      const id1 = state.activeAiSessionId;
      const id2 = createAiSession('Session to keep');

      assert.strictEqual(state.aiSessions.length, 2);
      deleteAiSession(id1);

      assert.strictEqual(state.aiSessions.length, 1);
      assert.strictEqual(state.activeAiSessionId, id2);
    });

    it('clears messages within the active session', async () => {
      const state = getAetherState();
      await sendAiMessage('query to clear');
      assert.strictEqual(state.aiMessages.length, 2);

      clearCurrentAiSession();
      assert.strictEqual(state.aiMessages.length, 0);
      const active = getActiveAiSession();
      assert.strictEqual(active.messages.length, 0);
    });
  });

  describe('2. Slash Commands Engine', () => {
    it('executes /help and outputs list of available commands', async () => {
      const state = getAetherState();
      const res = await executeAiCommand('/help');

      assert.strictEqual(res.handled, true);
      assert.ok(res.output?.includes('/help'));
      assert.ok(res.output?.includes('/new'));
      assert.ok(res.output?.includes('/sessions'));
      assert.ok(res.output?.includes('/model'));
      assert.ok(res.output?.includes('/provider'));
    });

    it('executes /new [title] to create a new session via command', async () => {
      const state = getAetherState();
      await sendAiMessage('/new Analisis Log');

      assert.strictEqual(state.aiSessions.length, 2);
      const active = getActiveAiSession();
      assert.strictEqual(active.title, 'Analisis Log');
    });

    it('executes /sessions to list all current sessions', async () => {
      const state = getAetherState();
      createAiSession('Session Alpha');
      const res = await executeAiCommand('/sessions');

      assert.strictEqual(res.handled, true);
      assert.ok(res.output?.includes('Session Alpha'));
      assert.ok(res.output?.includes('[AKTIF]'));
    });

    it('executes /model to switch active model', async () => {
      const state = getAetherState();
      await sendAiMessage('/model Eris-Max');

      assert.strictEqual(state.selectedAiModel, 'Eris-Max');
      const active = getActiveAiSession();
      assert.strictEqual(active.model, 'Eris-Max');
    });

    it('executes /provider to switch active provider', async () => {
      const state = getAetherState();
      await sendAiMessage('/provider openrouter');

      assert.strictEqual(state.selectedAiProvider, 'openrouter');
      const active = getActiveAiSession();
      assert.strictEqual(active.provider, 'openrouter');
    });

    it('executes /status and reports current session metadata', async () => {
      const res = await executeAiCommand('/status');
      assert.strictEqual(res.handled, true);
      assert.ok(res.output?.includes('Status AI Assistant'));
    });

    it('executes /export and generates markdown transcript', async () => {
      const state = getAetherState();
      await sendAiMessage('How do I run tests?');
      const res = await executeAiCommand('/export');

      assert.strictEqual(res.handled, true);
      const lastMsg = state.aiMessages[state.aiMessages.length - 1];
      assert.ok(lastMsg.content.includes('Transkrip Sesi Diekspor'));
    });

    it('handles unknown commands with informative help tip', async () => {
      const state = getAetherState();
      await sendAiMessage('/foobar');

      const lastMsg = state.aiMessages[state.aiMessages.length - 1];
      assert.ok(lastMsg.content.includes('tidak dikenali'));
      assert.ok(lastMsg.content.includes('/help'));
    });
  });

  describe('3. AI Commands Definition Catalog', () => {
    it('verifies AI_COMMANDS catalog includes all essential commands', () => {
      assert.ok(Array.isArray(AI_COMMANDS));
      const commandNames = AI_COMMANDS.map((c: any) => c.command);

      assert.ok(commandNames.includes('/help'));
      assert.ok(commandNames.includes('/new'));
      assert.ok(commandNames.includes('/sessions'));
      assert.ok(commandNames.includes('/session switch'));
      assert.ok(commandNames.includes('/session rename'));
      assert.ok(commandNames.includes('/session delete'));
      assert.ok(commandNames.includes('/clear'));
      assert.ok(commandNames.includes('/model'));
      assert.ok(commandNames.includes('/provider'));
      assert.ok(commandNames.includes('/system'));
      assert.ok(commandNames.includes('/context'));
      assert.ok(commandNames.includes('/status'));
      assert.ok(commandNames.includes('/export'));
    });
  });
});
