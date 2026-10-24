## 2026-10-24T10:34:40Z

You are Worker for Milestone 2 (M2: AI Provider Store & Provider Management).
Your Working Directory: /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m2_cortex
Authoritative Request: /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md
Project Root: /home/rasshqa/projects/Elliot
Scope & Architecture: /home/rasshqa/projects/Elliot/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Input Context & Specifications:
- Read /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md (Requirements R4 & R5)
- Read /home/rasshqa/projects/Elliot/PROJECT.md (§ Interface Contracts #1)
- Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_ai/survey_report.md
- Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_ai/handoff.md

Milestone 2 Objectives:
1. Store Extensions in `ui/src/stores/aetherStore.ts`:
   - Support the full AI provider matrix:
     - OpenAI (default model: `gpt-4o`)
     - Anthropic (default model: `claude-3-5-sonnet-20241022`)
     - Google Gemini (default model: `gemini-1.5-pro`)
     - Groq (default model: `llama-3.3-70b-versatile`)
     - Custom Provider (with configurable display name, endpoint/base URL, API key, model identifier, and protocol adapter)
     - Retain OpenRouter and Ollama
   - Establish `selectedAiProvider` and `selectedAiModel` as the single source of truth in the store.
   - Add state: `customProviders: CustomProviderConfig[]`.
   - Export actions:
     - `setSelectedAiProvider(providerId: string): void`
     - `setSelectedAiModel(model: string): void`
     - `addCustomProvider(config: Omit<CustomProviderConfig, 'id'>): Promise<string>`
     - `updateCustomProvider(id: string, config: Partial<CustomProviderConfig>): Promise<void>`
     - `deleteCustomProvider(id: string): Promise<void>`
     - `testProviderConnection(provider: string, config?: Partial<ProviderSettings>): Promise<{ success: boolean; message: string }>`
   - Persist selections and custom providers in `localStorage` ('aether_selected_ai_provider', 'aether_selected_ai_model', 'aether_custom_providers') and synchronize with backend Tauri IPC when available.
   - Ensure web/browser mock fallbacks allow tests and non-Tauri preview to run without errors.
2. Refactor `ui/src/components/AiSettingsModal.tsx`:
   - Render provider selector covering OpenAI, Anthropic, Gemini, Groq, OpenRouter, Ollama, and Custom Providers.
   - For standard providers: input for API Key (masked by default, with toggle visibility icon), model selector, status/connection test button.
   - For Custom Providers:
     - Form to add/edit: Display Name, Base URL / Endpoint, API Key (masked), Model Identifier, Protocol Adapter (`openai`, `anthropic`, `gemini`, `groq`, `ollama`, `openrouter`).
     - Validation of required fields before saving.
     - Live connection testing with meaningful feedback banner (success / latency or error details).
     - Add, edit, select, and delete custom provider configurations without data loss.
   - Strict UI copy restriction: NEVER display the term "BYOK" anywhere in the application UI (use "API Key", "Provider Settings", or "Connection Settings").
   - Neo-brutalist styling: sharp borders, flat surfaces, zero gradients, zero glassmorphism, zero emojis.
3. Testing:
   - Create comprehensive unit/integration test suite in `ui/tests/aiProvidersM2.test.ts` verifying all provider configurations, custom provider CRUD, masked keys, connection test feedback, zero BYOK, zero emojis.
4. Verification & Hand-off:
   - Run `npm run build` in `ui/`
   - Run `node --test tests/*.test.ts` in `ui/`
   - Run `cargo check --workspace` and `cargo test --workspace`
   - Run `graphify update .`
   - Write `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m2_cortex/handoff.md` with Observation, Logic Chain, Caveats, Conclusion, Verification Method.
   - Send completion message to orchestrator.
