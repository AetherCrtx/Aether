import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = mockWindow;
(globalThis as any).document = mockDocument;

import jitiFactory from 'jiti';
const jiti = jitiFactory(import.meta.url);
const aetherStore = jiti('../src/stores/aetherStore.ts');

const {
  getAetherState,
  setSelectedAiProvider,
  setSelectedAiModel,
  addCustomProvider,
  updateCustomProvider,
  deleteCustomProvider,
  testProviderConnection,
  testAiProviderConnection,
  loadAiProviderConfig,
  saveAiProviderConfig,
  deleteAiProviderConfig,
  toggleAiSettings,
  BUILT_IN_PROVIDERS,
} = aetherStore;

describe('Milestone 2: AI Provider Store & Provider Management', () => {
  beforeEach(() => {
    storageMap.clear();
    const state = getAetherState();
    state.customProviders = [];
    state.selectedAiProvider = 'openai';
    state.selectedAiModel = 'gpt-4o';
  });

  // ==========================================================================
  // 1. Full Provider Matrix Verification
  // ==========================================================================
  describe('1. Full AI Provider Matrix Support', () => {
    it('defines the complete standard provider matrix with expected defaults', () => {
      assert.ok(Array.isArray(BUILT_IN_PROVIDERS), 'BUILT_IN_PROVIDERS should be an array');
      assert.equal(BUILT_IN_PROVIDERS.length, 6, 'Should define exactly 6 built-in providers');

      const providerMap = new Map(BUILT_IN_PROVIDERS.map((p: any) => [p.id, p]));

      // 1. OpenAI (gpt-4o)
      const openai = providerMap.get('openai');
      assert.ok(openai, 'OpenAI provider must exist');
      assert.equal(openai.name, 'OpenAI');
      assert.equal(openai.defaultModel, 'gpt-4o');
      assert.equal(openai.defaultBaseUrl, 'https://api.openai.com/v1');
      assert.equal(openai.requiresKey, true);
      assert.equal(openai.protocol, 'openai');

      // 2. Anthropic (claude-3-5-sonnet-20241022)
      const anthropic = providerMap.get('anthropic');
      assert.ok(anthropic, 'Anthropic provider must exist');
      assert.equal(anthropic.name, 'Anthropic');
      assert.equal(anthropic.defaultModel, 'claude-3-5-sonnet-20241022');
      assert.equal(anthropic.defaultBaseUrl, 'https://api.anthropic.com/v1');
      assert.equal(anthropic.requiresKey, true);
      assert.equal(anthropic.protocol, 'anthropic');

      // 3. Google Gemini (gemini-1.5-pro)
      const gemini = providerMap.get('gemini');
      assert.ok(gemini, 'Google Gemini provider must exist');
      assert.equal(gemini.name, 'Google Gemini');
      assert.equal(gemini.defaultModel, 'gemini-1.5-pro');
      assert.equal(gemini.defaultBaseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
      assert.equal(gemini.requiresKey, true);
      assert.equal(gemini.protocol, 'openai');

      // 4. Groq (llama-3.3-70b-versatile)
      const groq = providerMap.get('groq');
      assert.ok(groq, 'Groq provider must exist');
      assert.equal(groq.name, 'Groq');
      assert.equal(groq.defaultModel, 'llama-3.3-70b-versatile');
      assert.equal(groq.defaultBaseUrl, 'https://api.groq.com/openai/v1');
      assert.equal(groq.requiresKey, true);
      assert.equal(groq.protocol, 'openai');

      // 5. OpenRouter (retained)
      const openrouter = providerMap.get('openrouter');
      assert.ok(openrouter, 'OpenRouter provider must exist');
      assert.equal(openrouter.name, 'OpenRouter');
      assert.equal(openrouter.defaultModel, 'anthropic/claude-3.5-sonnet');
      assert.equal(openrouter.defaultBaseUrl, 'https://openrouter.ai/api/v1');
      assert.equal(openrouter.requiresKey, true);
      assert.equal(openrouter.protocol, 'openai');

      // 6. Ollama (retained local)
      const ollama = providerMap.get('ollama');
      assert.ok(ollama, 'Ollama provider must exist');
      assert.equal(ollama.name, 'Ollama (Local)');
      assert.equal(ollama.defaultModel, 'llama3:latest');
      assert.equal(ollama.defaultBaseUrl, 'http://localhost:11434/v1');
      assert.equal(ollama.requiresKey, false, 'Ollama should not require API key');
      assert.equal(ollama.protocol, 'openai');
    });

    it('loads provider configuration with all built-in providers in fallback environment', async () => {
      const cfg = await loadAiProviderConfig();
      assert.ok(cfg);
      assert.ok(cfg.providers.openai);
      assert.ok(cfg.providers.anthropic);
      assert.ok(cfg.providers.gemini);
      assert.ok(cfg.providers.groq);
      assert.ok(cfg.providers.openrouter);
      assert.ok(cfg.providers.ollama);

      assert.equal(cfg.providers.openai.model, 'gpt-4o');
      assert.equal(cfg.providers.anthropic.model, 'claude-3-5-sonnet-20241022');
      assert.equal(cfg.providers.gemini.model, 'gemini-1.5-pro');
      assert.equal(cfg.providers.groq.model, 'llama-3.3-70b-versatile');
    });
  });

  // ==========================================================================
  // 2. Synchronized Provider & Model Single Source of Truth
  // ==========================================================================
  describe('2. Single Source of Truth for Provider & Model', () => {
    it('initializes selectedAiProvider and selectedAiModel with default values', () => {
      const state = getAetherState();
      assert.ok(state.selectedAiProvider);
      assert.ok(state.selectedAiModel);
    });

    it('synchronizes selectedAiProvider and switches selectedAiModel to provider default', () => {
      setSelectedAiProvider('anthropic');
      let state = getAetherState();
      assert.equal(state.selectedAiProvider, 'anthropic');
      assert.equal(state.selectedAiModel, 'claude-3-5-sonnet-20241022');
      assert.equal(storageMap.get('aether_selected_ai_provider'), 'anthropic');
      assert.equal(storageMap.get('aether_selected_ai_model'), 'claude-3-5-sonnet-20241022');

      setSelectedAiProvider('groq');
      state = getAetherState();
      assert.equal(state.selectedAiProvider, 'groq');
      assert.equal(state.selectedAiModel, 'llama-3.3-70b-versatile');
      assert.equal(storageMap.get('aether_selected_ai_provider'), 'groq');
      assert.equal(storageMap.get('aether_selected_ai_model'), 'llama-3.3-70b-versatile');
    });

    it('allows explicit selectedAiModel updates without altering provider', () => {
      setSelectedAiProvider('openai');
      setSelectedAiModel('gpt-4o-mini');
      const state = getAetherState();
      assert.equal(state.selectedAiProvider, 'openai');
      assert.equal(state.selectedAiModel, 'gpt-4o-mini');
      assert.equal(storageMap.get('aether_selected_ai_model'), 'gpt-4o-mini');
    });
  });

  // ==========================================================================
  // 3. Custom Provider Configuration CRUD
  // ==========================================================================
  describe('3. Custom Provider CRUD Operations', () => {
    it('validates required fields when adding a custom provider', async () => {
      // Missing display name
      await assert.rejects(
        async () => {
          await addCustomProvider({
            displayName: '',
            baseUrl: 'https://api.together.xyz/v1',
            apiKey: 'sk-test',
            model: 'meta-llama/Llama-3-70b',
            protocol: 'openai',
          });
        },
        /Display Name is required/
      );

      // Missing base URL
      await assert.rejects(
        async () => {
          await addCustomProvider({
            displayName: 'Together AI',
            baseUrl: '',
            apiKey: 'sk-test',
            model: 'meta-llama/Llama-3-70b',
            protocol: 'openai',
          });
        },
        /Base URL is required/
      );

      // Invalid base URL (must start with http:// or https://)
      await assert.rejects(
        async () => {
          await addCustomProvider({
            displayName: 'Together AI',
            baseUrl: 'api.together.xyz/v1',
            apiKey: 'sk-test',
            model: 'meta-llama/Llama-3-70b',
            protocol: 'openai',
          });
        },
        /Invalid Base URL/
      );

      // Missing model identifier
      await assert.rejects(
        async () => {
          await addCustomProvider({
            displayName: 'Together AI',
            baseUrl: 'https://api.together.xyz/v1',
            apiKey: 'sk-test',
            model: '',
            protocol: 'openai',
          });
        },
        /Model Identifier is required/
      );
    });

    it('adds a custom provider, persists to localStorage, and registers in state', async () => {
      const id = await addCustomProvider({
        displayName: 'Together AI',
        baseUrl: 'https://api.together.xyz/v1/',
        apiKey: 'sk-together-12345',
        model: 'meta-llama/Llama-3-70b',
        protocol: 'openai',
      });

      assert.ok(id, 'Should return generated provider id');
      assert.ok(id.startsWith('custom_'), 'Custom provider id should start with custom_');

      const state = getAetherState();
      assert.equal(state.customProviders.length, 1);
      const cp = state.customProviders[0];
      assert.equal(cp.id, id);
      assert.equal(cp.displayName, 'Together AI');
      // Trailing slash normalized
      assert.equal(cp.baseUrl, 'https://api.together.xyz/v1');
      assert.equal(cp.apiKey, 'sk-together-12345');
      assert.equal(cp.model, 'meta-llama/Llama-3-70b');
      assert.equal(cp.protocol, 'openai');

      // LocalStorage persistence verification
      const stored = JSON.parse(storageMap.get('aether_custom_providers') || '[]');
      assert.equal(stored.length, 1);
      assert.equal(stored[0].id, id);
    });

    it('updates an existing custom provider', async () => {
      const id = await addCustomProvider({
        displayName: 'DeepSeek Endpoint',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-ds-old',
        model: 'deepseek-chat',
        protocol: 'openai',
      });

      setSelectedAiProvider(id);
      let state = getAetherState();
      assert.equal(state.selectedAiModel, 'deepseek-chat');

      await updateCustomProvider(id, {
        displayName: 'DeepSeek v3',
        model: 'deepseek-coder',
        apiKey: 'sk-ds-new',
      });

      state = getAetherState();
      const updated = state.customProviders.find((p: any) => p.id === id);
      assert.ok(updated);
      assert.equal(updated.displayName, 'DeepSeek v3');
      assert.equal(updated.model, 'deepseek-coder');
      assert.equal(updated.apiKey, 'sk-ds-new');
      assert.equal(state.selectedAiModel, 'deepseek-coder', 'Should sync selectedAiModel if provider is active');

      // Persistence check
      const stored = JSON.parse(storageMap.get('aether_custom_providers') || '[]');
      assert.equal(stored[0].displayName, 'DeepSeek v3');
      assert.equal(stored[0].model, 'deepseek-coder');
    });

    it('throws error when updating non-existent custom provider', async () => {
      await assert.rejects(
        async () => {
          await updateCustomProvider('non_existent_id', { displayName: 'Ghost' });
        },
        /not found/
      );
    });

    it('deletes a custom provider and resets active provider if deleted was active', async () => {
      const id1 = await addCustomProvider({
        displayName: 'Provider A',
        baseUrl: 'https://api.a.com/v1',
        apiKey: 'sk-a',
        model: 'model-a',
        protocol: 'openai',
      });

      const id2 = await addCustomProvider({
        displayName: 'Provider B',
        baseUrl: 'https://api.b.com/v1',
        apiKey: 'sk-b',
        model: 'model-b',
        protocol: 'openai',
      });

      let state = getAetherState();
      assert.equal(state.customProviders.length, 2);

      // Select id1 as active provider
      setSelectedAiProvider(id1);
      assert.equal(state.selectedAiProvider, id1);

      // Delete id1
      await deleteCustomProvider(id1);
      state = getAetherState();
      assert.equal(state.customProviders.length, 1);
      assert.equal(state.customProviders[0].id, id2);

      // State should safely fall back to 'openai'
      assert.equal(state.selectedAiProvider, 'openai');
      assert.equal(state.selectedAiModel, 'gpt-4o');

      // Stored providers updated
      const stored = JSON.parse(storageMap.get('aether_custom_providers') || '[]');
      assert.equal(stored.length, 1);
      assert.equal(stored[0].id, id2);
    });
  });

  // ==========================================================================
  // 4. Live Connection Testing & Meaningful Feedback
  // ==========================================================================
  describe('4. Live Connection Testing & Meaningful Feedback', () => {
    it('fails connection test when required API key is missing', async () => {
      const res = await testProviderConnection('openai', { api_key: '' });
      assert.equal(res.success, false);
      assert.match(res.message, /API key is required/);
    });

    it('fails connection test when endpoint URL is malformed', async () => {
      const res = await testProviderConnection('custom', {
        api_key: 'sk-test',
        base_url: 'not-a-valid-url',
        model: 'test-model',
      });
      assert.equal(res.success, false);
      assert.match(res.message, /Invalid endpoint URL format/);
    });

    it('succeeds for Ollama without requiring an API key', async () => {
      const res = await testProviderConnection('ollama', { api_key: '' });
      assert.equal(res.success, true);
      assert.match(res.message, /Connected to Ollama/);
      assert.match(res.message, /Latency:/);
    });

    it('succeeds for standard provider with valid credentials in mock environment', async () => {
      const res = await testProviderConnection('anthropic', {
        api_key: 'sk-ant-valid-key-12345',
        model: 'claude-3-5-sonnet-20241022',
      });
      assert.equal(res.success, true);
      assert.match(res.message, /Connected to Anthropic/);
      assert.match(res.message, /Latency:/);
    });

    it('returns simulated failure details when key contains failure indicator', async () => {
      const res = await testProviderConnection('openai', {
        api_key: 'sk-invalid-test-key',
        model: 'gpt-4o',
      });
      assert.equal(res.success, false);
      assert.match(res.message, /Authentication or network error/);
    });

    it('supports testAiProviderConnection legacy signature for backward compatibility', async () => {
      const res = await testAiProviderConnection('groq', 'gsk_valid_key', 'llama-3.3-70b-versatile');
      assert.equal(res.success, true);
      assert.match(res.message, /Connected to Groq/);
    });
  });

  // ==========================================================================
  // 5. Strict Copy Restriction ("BYOK" Ban) & Zero-Emoji Compliance
  // ==========================================================================
  describe('5. Strict Constraints: Prohibited Copy & Zero Emojis', () => {
    it('strictly ensures zero occurrences of prohibited BYOK copy in source files', () => {
      const filesToCheck = [
        path.resolve(__dirname, '../src/components/AiSettingsModal.tsx'),
        path.resolve(__dirname, '../src/stores/aetherStore.ts'),
      ];

      const bannedPattern = new RegExp(['B', 'Y', 'O', 'K'].join(''), 'i');
      for (const filePath of filesToCheck) {
        assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(bannedPattern);
        assert.equal(match, null, `Prohibited copy found in ${filePath}!`);
      }
    });

    it('strictly ensures zero emoji characters in AiSettingsModal.tsx and aetherStore.ts', () => {
      const emojiRegex = /\p{Extended_Pictographic}/u;
      const filesToCheck = [
        path.resolve(__dirname, '../src/components/AiSettingsModal.tsx'),
        path.resolve(__dirname, '../src/stores/aetherStore.ts'),
      ];

      for (const filePath of filesToCheck) {
        assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(emojiRegex);
        assert.equal(match, null, `Prohibited emoji character found in ${filePath}: ${match?.[0]}`);
      }
    });

    it('AiSettingsModal.tsx contains test ids for provider tabs, custom provider form, and test feedback', () => {
      const modalPath = path.resolve(__dirname, '../src/components/AiSettingsModal.tsx');
      const content = fs.readFileSync(modalPath, 'utf8');

      // Verify essential data-testids exist for automated UI verification
      assert.ok(content.includes('data-testid="ai-settings-modal"'));
      assert.ok(content.includes('data-testid="add-custom-provider-btn"'));
      assert.ok(content.includes('data-testid="provider-api-key-input"'));
      assert.ok(content.includes('data-testid="toggle-api-key-mask"'));
      assert.ok(content.includes('data-testid="test-connection-btn"'));
      assert.ok(content.includes('data-testid="save-provider-config-btn"'));
      assert.ok(content.includes('data-testid="delete-custom-provider-btn"'));
      assert.ok(content.includes('data-testid="test-result-banner"'));
      assert.ok(content.includes('data-testid="validation-error-banner"'));
    });
  });

  // ==========================================================================
  // 6. Settings Modal Toggle & Navigation Invariants
  // ==========================================================================
  describe('6. Settings Modal State Invariants', () => {
    it('toggles settings modal visibility without state corruption', () => {
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

    it('persists and loads multiple custom providers across sessions', async () => {
      const cp1 = {
        displayName: 'Mistral Large',
        baseUrl: 'https://api.mistral.ai/v1',
        apiKey: 'mis-key-1',
        model: 'mistral-large-latest',
        protocol: 'openai' as const,
      };
      const cp2 = {
        displayName: 'Local vLLM',
        baseUrl: 'http://127.0.0.1:8000/v1',
        apiKey: '',
        model: 'qwen2.5-coder-32b',
        protocol: 'openai' as const,
      };

      const id1 = await addCustomProvider(cp1);
      const id2 = await addCustomProvider(cp2);

      const state = getAetherState();
      assert.equal(state.customProviders.length, 2);

      // Verify both providers exist in config
      const cfg = await loadAiProviderConfig();
      assert.ok(cfg?.providers[id1]);
      assert.ok(cfg?.providers[id2]);
      assert.equal(cfg?.providers[id1].model, 'mistral-large-latest');
      assert.equal(cfg?.providers[id2].model, 'qwen2.5-coder-32b');
    });
  });
});
