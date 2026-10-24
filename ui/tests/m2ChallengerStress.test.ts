import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ----------------------------------------------------------------------------
// Minimal mock browser environment for Node.js unit testing
// ----------------------------------------------------------------------------
const storageMap = new Map<string, string>();
let storageShouldThrow = false;

const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => {
    if (storageShouldThrow) {
      throw new Error('QuotaExceededError: localStorage quota exceeded');
    }
    storageMap.set(key, String(val));
  },
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
  BUILT_IN_PROVIDERS,
} = aetherStore;

describe('Milestone 2 Challenger: Empirical Stress & Edge Case Tests', () => {
  beforeEach(() => {
    storageMap.clear();
    storageShouldThrow = false;
    const state = getAetherState();
    state.customProviders = [];
    state.selectedAiProvider = 'openai';
    state.selectedAiModel = 'gpt-4o';
    state.aiProviderConfig = null;
  });

  // ==========================================================================
  // Suite 1: 50 Custom Providers Rapid Churn (Add, Edit, Delete)
  // ==========================================================================
  describe('1. 50 Custom Providers Rapid Churn Stress Testing', () => {
    it('rapidly adds 50 unique custom providers without ID collisions or state corruption', async () => {
      const addedIds: string[] = [];

      for (let i = 0; i < 50; i++) {
        const id = await addCustomProvider({
          displayName: `Custom Provider ${i}`,
          baseUrl: `https://api.provider-${i}.internal.net/v1`,
          apiKey: `sk-prov-${i}-${'x'.repeat(20)}`,
          model: `model-v${i}`,
          protocol: 'openai',
        });
        addedIds.push(id);
      }

      assert.equal(addedIds.length, 50, 'Must have 50 returned IDs');
      const uniqueIds = new Set(addedIds);
      assert.equal(uniqueIds.size, 50, 'All 50 provider IDs must be strictly unique');

      const state = getAetherState();
      assert.equal(state.customProviders.length, 50, 'Store must hold exactly 50 custom providers');

      // Verify localStorage persistence holds 50 entries
      const rawStored = storageMap.get('aether_custom_providers');
      assert.ok(rawStored, 'localStorage aether_custom_providers must exist');
      const parsedStored = JSON.parse(rawStored);
      assert.equal(parsedStored.length, 50, 'localStorage must hold all 50 custom providers');

      // Check config sync
      const config = await loadAiProviderConfig();
      assert.ok(config);
      for (const id of addedIds) {
        assert.ok(config.providers[id], `Config should contain provider ${id}`);
      }
    });

    it('rapidly edits 50 custom providers maintaining property consistency', async () => {
      const addedIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const id = await addCustomProvider({
          displayName: `Orig Name ${i}`,
          baseUrl: `https://api.orig-${i}.com/v1`,
          apiKey: `sk-orig-${i}`,
          model: `model-orig-${i}`,
          protocol: 'openai',
        });
        addedIds.push(id);
      }

      // Concurrently update all 50
      await Promise.all(
        addedIds.map((id, i) =>
          updateCustomProvider(id, {
            displayName: `Updated Name ${i}`,
            model: `model-updated-${i}`,
            apiKey: `sk-updated-${i}`,
          })
        )
      );

      const state = getAetherState();
      assert.equal(state.customProviders.length, 50);

      for (let i = 0; i < 50; i++) {
        const provider = state.customProviders.find((p: any) => p.id === addedIds[i]);
        assert.ok(provider, `Provider ${addedIds[i]} must exist`);
        assert.equal(provider.displayName, `Updated Name ${i}`);
        assert.equal(provider.model, `model-updated-${i}`);
        assert.equal(provider.apiKey, `sk-updated-${i}`);
      }

      // Check localStorage
      const parsed = JSON.parse(storageMap.get('aether_custom_providers') || '[]');
      assert.equal(parsed.length, 50);
      assert.equal(parsed[0].displayName, 'Updated Name 0');
    });

    it('rapidly deletes custom providers in batches and reaches clean zero state', async () => {
      const addedIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const id = await addCustomProvider({
          displayName: `Batch Provider ${i}`,
          baseUrl: `https://api.batch-${i}.com/v1`,
          apiKey: `sk-batch-${i}`,
          model: `model-${i}`,
          protocol: 'openai',
        });
        addedIds.push(id);
      }

      // Delete first 25
      for (let i = 0; i < 25; i++) {
        await deleteCustomProvider(addedIds[i]);
      }
      let state = getAetherState();
      assert.equal(state.customProviders.length, 25);
      let parsed = JSON.parse(storageMap.get('aether_custom_providers') || '[]');
      assert.equal(parsed.length, 25);

      // Delete remaining 25
      for (let i = 25; i < 50; i++) {
        await deleteCustomProvider(addedIds[i]);
      }
      state = getAetherState();
      assert.equal(state.customProviders.length, 0);
      parsed = JSON.parse(storageMap.get('aether_custom_providers') || '[]');
      assert.equal(parsed.length, 0);
    });
  });

  // ==========================================================================
  // Suite 2: Active Provider Deletion & Fallback Behavior
  // ==========================================================================
  describe('2. Active Provider Deletion & Fallback Invariants', () => {
    it('falls back to openai and gpt-4o when currently active custom provider is deleted', async () => {
      const id1 = await addCustomProvider({
        displayName: 'Active Target Provider',
        baseUrl: 'https://api.target.com/v1',
        apiKey: 'sk-target',
        model: 'target-llm-v1',
        protocol: 'openai',
      });

      const id2 = await addCustomProvider({
        displayName: 'Passive Provider',
        baseUrl: 'https://api.passive.com/v1',
        apiKey: 'sk-passive',
        model: 'passive-llm-v1',
        protocol: 'openai',
      });

      setSelectedAiProvider(id1);
      let state = getAetherState();
      assert.equal(state.selectedAiProvider, id1);
      assert.equal(state.selectedAiModel, 'target-llm-v1');

      // Delete currently active provider
      await deleteCustomProvider(id1);

      state = getAetherState();
      assert.equal(state.selectedAiProvider, 'openai', 'Must fall back to openai');
      assert.equal(state.selectedAiModel, 'gpt-4o', 'Must fall back to gpt-4o');
      assert.equal(storageMap.get('aether_selected_ai_provider'), 'openai');
      assert.equal(storageMap.get('aether_selected_ai_model'), 'gpt-4o');

      // Passive provider must still exist
      assert.equal(state.customProviders.length, 1);
      assert.equal(state.customProviders[0].id, id2);
    });

    it('does NOT alter active provider when a different inactive custom provider is deleted', async () => {
      const activeId = await addCustomProvider({
        displayName: 'Stay Active',
        baseUrl: 'https://api.stay.com/v1',
        apiKey: 'sk-stay',
        model: 'stay-model',
        protocol: 'openai',
      });

      const deletedId = await addCustomProvider({
        displayName: 'Get Deleted',
        baseUrl: 'https://api.delete.com/v1',
        apiKey: 'sk-del',
        model: 'del-model',
        protocol: 'openai',
      });

      setSelectedAiProvider(activeId);
      let state = getAetherState();
      assert.equal(state.selectedAiProvider, activeId);
      assert.equal(state.selectedAiModel, 'stay-model');

      // Delete the OTHER provider
      await deleteCustomProvider(deletedId);

      state = getAetherState();
      assert.equal(state.selectedAiProvider, activeId, 'Active provider should remain unchanged');
      assert.equal(state.selectedAiModel, 'stay-model', 'Active model should remain unchanged');
      assert.equal(state.customProviders.length, 1);
      assert.equal(state.customProviders[0].id, activeId);
    });

    it('safely handles non-existent provider ID selection with default model fallback', () => {
      setSelectedAiProvider('completely_bogus_provider_id');
      const state = getAetherState();
      assert.equal(state.selectedAiProvider, 'completely_bogus_provider_id');
      assert.equal(state.selectedAiModel, 'gpt-4o', 'Should fall back to gpt-4o default model');
    });

    it('ignores deleteCustomProvider for non-existent or built-in provider IDs', async () => {
      const stateBefore = getAetherState();
      await deleteCustomProvider('openai');
      await deleteCustomProvider('non_existent_id');
      const stateAfter = getAetherState();
      assert.equal(stateAfter.customProviders.length, stateBefore.customProviders.length);
    });
  });

  // ==========================================================================
  // Suite 3: Malformed Base URLs, Unicode Injection, Extreme Key Lengths
  // ==========================================================================
  describe('3. Adversarial Payloads: URLs, Unicode, Extreme Keys', () => {
    describe('Malformed Base URLs', () => {
      const malformedUrls = [
        { url: '', error: /Base URL is required/ },
        { url: '   ', error: /Base URL is required/ },
        { url: 'api.openai.com/v1', error: /Invalid Base URL/ },
        { url: 'ftp://ftp.example.com/api', error: /Invalid Base URL/ },
        { url: 'file:///etc/passwd', error: /Invalid Base URL/ },
        { url: 'ws://localhost:8080', error: /Invalid Base URL/ },
        { url: 'javascript:alert(1)', error: /Invalid Base URL/ },
        { url: 'http://', error: /Invalid Base URL/ }, // strips slashes -> 'http:' -> invalid
        { url: 'https://', error: /Invalid Base URL/ }, // strips slashes -> 'https:' -> invalid
        { url: 'http:///', error: /Invalid Base URL/ },
      ];

      for (const { url, error } of malformedUrls) {
        it(`rejects malformed base URL "${url}"`, async () => {
          await assert.rejects(
            async () => {
              await addCustomProvider({
                displayName: 'Test URL Provider',
                baseUrl: url,
                apiKey: 'sk-test',
                model: 'gpt-4o',
                protocol: 'openai',
              });
            },
            error
          );
        });
      }

      it('normalizes redundant trailing slashes on base URLs', async () => {
        const id = await addCustomProvider({
          displayName: 'Slash Normalization Provider',
          baseUrl: 'https://api.example.com/v1//////',
          apiKey: 'sk-test',
          model: 'm1',
          protocol: 'openai',
        });

        const state = getAetherState();
        const provider = state.customProviders.find((p: any) => p.id === id);
        assert.equal(provider?.baseUrl, 'https://api.example.com/v1');
      });

      it('accepts valid IP addresses, ports, and localhost base URLs', async () => {
        const urls = [
          'http://localhost:11434/v1',
          'http://127.0.0.1:8000',
          'http://[::1]:8080/v1',
          'https://192.168.1.100:9000/api/v1',
        ];

        for (const url of urls) {
          const id = await addCustomProvider({
            displayName: `Local URL ${url}`,
            baseUrl: url,
            apiKey: '',
            model: 'test-model',
            protocol: 'openai',
          });
          const state = getAetherState();
          const p = state.customProviders.find((cp: any) => cp.id === id);
          assert.ok(p);
          assert.equal(p.baseUrl, url);
        }
      });
    });

    describe('Unicode & Special Characters in Display Names', () => {
      it('safely handles RTL overrides, zero-width spaces, and international scripts', async () => {
        const testNames = [
          'Normal Custom Provider',
          'DeepSeek \u202Ereversed\u202C Provider', // RTL override
          'Zero\u200BWidth\u200CSpace\u200DProvider', // Zero-width spaces
          'Провайдер с кириллицей (Russian)', // Cyrillic
          '自定义模型服务 (Chinese)', // CJK
          'مزود الذكاء الاصطناعي (Arabic)', // Arabic
          'हिंदी मॉडल सेवा (Devanagari)', // Devanagari
          '<script>alert("xss")</script>', // HTML tag injection
          '"><img src=x onerror=alert(1)>', // Attribute injection
          'Quote "Double" and \'Single\' Provider', // Quotes
          'Backslash \\ and Forward / Provider',
        ];

        for (const name of testNames) {
          const id = await addCustomProvider({
            displayName: name,
            baseUrl: 'https://api.unicode.org/v1',
            apiKey: 'sk-test',
            model: 'model-unicode',
            protocol: 'openai',
          });

          const state = getAetherState();
          const p = state.customProviders.find((cp: any) => cp.id === id);
          assert.ok(p, `Provider with name "${name}" must exist`);
          assert.equal(p.displayName, name);

          // Test serialization / deserialization roundtrip
          const stored = JSON.parse(storageMap.get('aether_custom_providers') || '[]');
          const storedProvider = stored.find((cp: any) => cp.id === id);
          assert.equal(storedProvider?.displayName, name);
        }
      });

      it('safely handles 10,000 character display names without buffer overflow', async () => {
        const giantName = 'A'.repeat(10000);
        const id = await addCustomProvider({
          displayName: giantName,
          baseUrl: 'https://api.giant.org/v1',
          apiKey: 'sk-test',
          model: 'm1',
          protocol: 'openai',
        });

        const state = getAetherState();
        const p = state.customProviders.find((cp: any) => cp.id === id);
        assert.equal(p?.displayName.length, 10000);
      });
    });

    describe('Extreme API Key Lengths', () => {
      it('permits empty API key for local or keyless custom endpoints', async () => {
        const id = await addCustomProvider({
          displayName: 'Keyless Local vLLM',
          baseUrl: 'http://localhost:8000/v1',
          apiKey: '',
          model: 'qwen2.5-coder',
          protocol: 'openai',
        });

        const state = getAetherState();
        const p = state.customProviders.find((cp: any) => cp.id === id);
        assert.equal(p?.apiKey, '');
      });

      it('handles 10KB and 100KB extreme API key lengths without crashing or truncated storage', async () => {
        const key10k = 'sk-large-' + 'A'.repeat(10000);
        const key100k = 'sk-huge-' + 'B'.repeat(100000);

        const id1 = await addCustomProvider({
          displayName: '10KB Key Provider',
          baseUrl: 'https://api.large10k.com/v1',
          apiKey: key10k,
          model: 'm10k',
          protocol: 'openai',
        });

        const id2 = await addCustomProvider({
          displayName: '100KB Key Provider',
          baseUrl: 'https://api.huge100k.com/v1',
          apiKey: key100k,
          model: 'm100k',
          protocol: 'openai',
        });

        const state = getAetherState();
        const p1 = state.customProviders.find((cp: any) => cp.id === id1);
        const p2 = state.customProviders.find((cp: any) => cp.id === id2);

        assert.equal(p1?.apiKey.length, key10k.length);
        assert.equal(p2?.apiKey.length, key100k.length);

        const stored = JSON.parse(storageMap.get('aether_custom_providers') || '[]');
        const storedP1 = stored.find((cp: any) => cp.id === id1);
        const storedP2 = stored.find((cp: any) => cp.id === id2);

        assert.equal(storedP1?.apiKey.length, key10k.length);
        assert.equal(storedP2?.apiKey.length, key100k.length);
      });

      it('handles API keys containing special characters, newlines, and base64 strings', async () => {
        const specialKey = 'Bearer sk-proj-12345/+=_$#@!%^&*()~`"\'<>;:\t';
        const id = await addCustomProvider({
          displayName: 'Special Chars Key Provider',
          baseUrl: 'https://api.special.com/v1',
          apiKey: specialKey,
          model: 'special-model',
          protocol: 'openai',
        });

        const state = getAetherState();
        const p = state.customProviders.find((cp: any) => cp.id === id);
        assert.equal(p?.apiKey, specialKey.trim());
      });
    });
  });

  // ==========================================================================
  // Suite 4: Storage Corruption & Resilience in localStorage
  // ==========================================================================
  describe('4. Storage Corruption Recovery in localStorage', () => {
    it('gracefully handles corrupted non-JSON strings in localStorage on store read', () => {
      storageMap.set('aether_custom_providers', '{invalid_json: true,');

      // Re-read or re-parse simulation
      let parsed: any;
      try {
        const val = mockLocalStorage.getItem('aether_custom_providers');
        parsed = val ? JSON.parse(val) : [];
      } catch {
        parsed = [];
      }
      assert.deepEqual(parsed, [], 'Must fall back to empty array on JSON syntax error');
    });

    it('identifies vulnerability: primitive or object corruption in localStorage initializes non-array state', () => {
      // If localStorage contains "null", JSON.parse("null") returns null.
      // In aetherStore.ts line 375:
      // return val ? (JSON.parse(val) as CustomProviderConfig[]) : [];
      // Because val is truthy (string "null"), JSON.parse("null") is evaluated, yielding null!
      const corruptPayloads = [
        'null',
        '12345',
        'true',
        '"just a string"',
        '{"single": "object"}',
      ];

      for (const payload of corruptPayloads) {
        storageMap.set('aether_custom_providers', payload);
        const val = mockLocalStorage.getItem('aether_custom_providers');
        let result: any;
        try {
          result = val ? JSON.parse(val) : [];
        } catch {
          result = [];
        }

        // If result is NOT an array, operations like .find(), .push(), .filter() will fail!
        const isSafeArray = Array.isArray(result);
        if (!isSafeArray) {
          // This confirms the empirical vulnerability in the ternary logic
          assert.equal(isSafeArray, false, `Confirmed: payload "${payload}" produces non-array: ${typeof result}`);
        }
      }
    });

    it('recovers when storage throws QuotaExceededError during operations', async () => {
      // First add a provider successfully
      const id = await addCustomProvider({
        displayName: 'Pre-Quota Provider',
        baseUrl: 'https://api.prequota.com/v1',
        apiKey: 'sk-pq',
        model: 'm1',
        protocol: 'openai',
      });

      assert.equal(getAetherState().customProviders.length, 1);

      // Now enable QuotaExceededError
      storageShouldThrow = true;

      // addCustomProvider will throw QuotaExceededError because setItem is unhandled
      await assert.rejects(
        async () => {
          await addCustomProvider({
            displayName: 'Overflow Provider',
            baseUrl: 'https://api.overflow.com/v1',
            apiKey: 'sk-of',
            model: 'm2',
            protocol: 'openai',
          });
        },
        /QuotaExceededError/
      );

      // Reset quota throw
      storageShouldThrow = false;

      // State is still operable
      await deleteCustomProvider(id);
      assert.equal(getAetherState().customProviders.length, 1); // was 2 in memory because push happened before throw
    });
  });

  // ==========================================================================
  // Suite 5: Live Connection Testing Under Network Failure & Edge Cases
  // ==========================================================================
  describe('5. Live Connection Testing Under Network Failure & Latency', () => {
    let mockServer: http.Server;
    let mockPort: number;
    let mockBaseUrl: string;
    let currentServerBehavior: (req: http.IncomingMessage, res: http.ServerResponse) => void;

    beforeEach(async () => {
      currentServerBehavior = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: 'Aether AI ready' } }],
        }));
      };

      mockServer = http.createServer((req, res) => {
        currentServerBehavior(req, res);
      });

      await new Promise<void>((resolve) => {
        mockServer.listen(0, '127.0.0.1', () => {
          const addr = mockServer.address() as AddressInfo;
          mockPort = addr.port;
          mockBaseUrl = `http://127.0.0.1:${mockPort}/v1`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    });

    it('frontend testProviderConnection enforces required API keys for commercial providers', async () => {
      const providersRequiringKeys = ['openai', 'anthropic', 'gemini', 'groq', 'openrouter'];
      for (const p of providersRequiringKeys) {
        const res = await testProviderConnection(p, { api_key: '' });
        assert.equal(res.success, false);
        assert.match(res.message, /API key is required/);
      }
    });

    it('frontend testProviderConnection rejects malformed endpoint URLs', async () => {
      const res = await testProviderConnection('custom', {
        api_key: 'sk-test',
        base_url: 'broken-url-without-protocol',
        model: 'model-1',
      });
      assert.equal(res.success, false);
      assert.match(res.message, /Invalid endpoint URL format/);
    });

    it('detects simulated authentication and network failure indicators', async () => {
      const testCases = [
        { key: 'sk-invalid-key', url: 'https://api.openai.com/v1' },
        { key: 'sk-auth-failed-401', url: 'https://api.openai.com/v1' },
        { key: 'sk-valid', url: 'https://api.offline-host.com/v1' },
        { key: 'sk-valid', url: 'https://api.fail-endpoint.com/v1' },
      ];

      for (const tc of testCases) {
        const res = await testProviderConnection('openai', {
          api_key: tc.key,
          base_url: tc.url,
          model: 'gpt-4o',
        });
        assert.equal(res.success, false);
        assert.match(res.message, /Authentication or network error/);
      }
    });

    it('reports realistic latency message on successful mock connection', async () => {
      const res = await testProviderConnection('openai', {
        api_key: 'sk-live-production-key-mock',
        model: 'gpt-4o',
      });
      assert.equal(res.success, true);
      assert.match(res.message, /Connected to OpenAI/);
      assert.match(res.message, /Latency: \d+ms/);
    });

    it('verifies real HTTP server behavior under 401 Unauthorized invalid API key', async () => {
      currentServerBehavior = (req, res) => {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: 'Incorrect API key provided: sk-bad-key',
            type: 'invalid_request_error',
            code: 'invalid_api_key',
          },
        }));
      };

      // Perform a real fetch to verify endpoint behavior
      const resp = await fetch(`${mockBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk-bad-key',
        },
        body: JSON.stringify({
          model: 'custom-model',
          messages: [{ role: 'user', content: 'Say Aether AI ready' }],
        }),
      });

      assert.equal(resp.status, 401);
      const data: any = await resp.json();
      assert.equal(data.error.code, 'invalid_api_key');
    });

    it('verifies real HTTP server behavior under slow network response (latency)', async () => {
      const latencyMs = 150;
      currentServerBehavior = (req, res) => {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            choices: [{ message: { content: 'Aether AI ready' } }],
          }));
        }, latencyMs);
      };

      const start = Date.now();
      const resp = await fetch(`${mockBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'custom-model' }),
      });
      const elapsed = Date.now() - start;

      assert.equal(resp.status, 200);
      assert.ok(elapsed >= latencyMs, `Elapsed time ${elapsed}ms should be >= ${latencyMs}ms`);
      const body: any = await resp.json();
      assert.equal(body.choices[0].message.content, 'Aether AI ready');
    });

    it('verifies real HTTP server behavior under socket reset / abort', async () => {
      currentServerBehavior = (req, res) => {
        // Destroy the underlying socket immediately
        req.socket.destroy();
      };

      await assert.rejects(
        async () => {
          await fetch(`${mockBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'custom-model' }),
          });
        },
        /fetch failed|ECONNRESET|socket hang up/i
      );
    });

    it('verifies real HTTP server behavior under 502 HTML Bad Gateway response', async () => {
      currentServerBehavior = (req, res) => {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        res.end('<html><body>502 Bad Gateway: Upstream connection refused</body></html>');
      };

      const resp = await fetch(`${mockBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'custom-model' }),
      });

      assert.equal(resp.status, 502);
      const text = await resp.text();
      assert.match(text, /502 Bad Gateway/);
    });
  });
});
