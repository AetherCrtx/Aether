import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up minimal mock browser environment for Node.js unit testing
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
  toggleAiSettings,
  loadAiProviderConfig,
  clearAiPilotSteps,
  getAetherState,
} = aetherStore;

describe('AI Pilot & Provider Engine Unit Tests', () => {
  beforeEach(() => {
    storageMap.clear();
  });

  it('toggles AI settings modal visibility', () => {
    toggleAiSettings(true);
    let state = getAetherState();
    assert.equal(state.aiSettingsOpen, true);

    toggleAiSettings(false);
    state = getAetherState();
    assert.equal(state.aiSettingsOpen, false);

    toggleAiSettings();
    state = getAetherState();
    assert.equal(state.aiSettingsOpen, true);
    toggleAiSettings(false);
  });

  it('loads default AI provider configuration in fallback environment', async () => {
    const config = await loadAiProviderConfig();
    assert.ok(config);
    assert.equal(config.default_provider, 'openrouter');
    assert.ok(config.providers.openrouter);
    assert.ok(config.providers.gemini);
    assert.ok(config.providers.anthropic);
    assert.ok(config.providers.ollama);

    assert.equal(config.providers.openrouter.model, 'anthropic/claude-3.5-sonnet');
    assert.equal(config.providers.gemini.model, 'gemini-1.5-pro');
    assert.equal(config.providers.anthropic.model, 'claude-3-5-sonnet-20241022');
    assert.equal(config.providers.ollama.model, 'llama3:latest');
  });

  it('clears AI pilot execution steps per pane and globally', () => {
    let state = getAetherState();
    state.aiPilotSteps.push({
      paneId: 'pane-1',
      step: 'Reasoning',
      details: 'Inspecting screen',
      timestamp: Date.now(),
    });
    state.aiPilotSteps.push({
      paneId: 'pane-2',
      step: 'Tool: type_into_pane',
      details: 'Typing cargo test',
      timestamp: Date.now(),
    });

    assert.equal(state.aiPilotSteps.length, 2);

    clearAiPilotSteps('pane-1');
    state = getAetherState();
    assert.equal(state.aiPilotSteps.length, 1);
    assert.equal(state.aiPilotSteps[0].paneId, 'pane-2');

    clearAiPilotSteps();
    state = getAetherState();
    assert.equal(state.aiPilotSteps.length, 0);
  });
});
