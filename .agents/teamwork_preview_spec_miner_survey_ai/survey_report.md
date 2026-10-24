# AI Assistant Panel & Provider Management Survey Report

**Date**: 2026-10-24  
**Author**: AI Provider and Settings Spec Miner  
**Working Directory**: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_ai`  
**Authoritative Reference**: `/home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md` (AetherCortex UI/UX Refactor & AI Integration)

---

## 1. Executive Summary

This specification survey investigates the architecture, data contracts, UI components, backend IPC, and strict constraints required to implement:
- **R3: AI Assistant Panel Alongside Terminal**
- **R5: Provider Management & Custom Provider Configuration** (with synchronization to **R4: Input Bar**)
- **Strict Constraint Audits**:
  - Prohibited UI copy "BYOK" audit across the entire codebase.
  - Zero-emoji character audit across all files in the repository.
  - Test suite and workspace health verification (`cargo check`, `cargo test`, `node --test tests/*.test.ts`, `npm run build`).

All workspace test suites and builds currently pass with 100% green status. The backend Rust infrastructure (`crates/aether-protocol`, `crates/aether-gui`, and `crates/aetherd`) already has foundational support for multi-provider configurations and IPC commands (`cmd_save_ai_provider_config`, `cmd_delete_ai_provider_config`, `cmd_test_ai_provider`, `cmd_ai_chat`), but the frontend store (`ui/src/stores/aetherStore.ts`) and UI components (`AiSettingsModal.tsx`, `ModernInputBar.tsx`) require updates to expose custom provider flows, eliminate "BYOK" copy, synchronize selectors, and introduce the collapsible AI Assistant panel.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R3 AI Panel | Collapsible Side-by-Side Panel | Resizable/collapsible panel mounted alongside TerminalGrid in `<main>` | `aiAssistantOpen: boolean`, toggle triggers (Cmd+J, top bar, sidebar) | Rendered conversation drawer beside terminal panes | Preserves pane dimensions when toggled, falls back to closed if collapsed | `ORIGINAL_REQUEST.md` lines 65-70; `main.tsx` layout |
| 2 | R3 AI Panel | Conversation History & Threading | Chronological list of user and assistant messages with markdown & syntax highlighting | `userPrompt: string`, active pane context | List of `AiMessage` records persisted in memory/localStorage | Shows empty state guide when history is cleared | `ORIGINAL_REQUEST.md` line 67; `aetherStore.ts` |
| 3 | R3 AI Panel | Code Block Copy & Run in Terminal | Rendered code blocks with syntax highlighting, language badge, copy button, and pipe-to-terminal button | Formatted markdown text in assistant response | Formatted DOM elements with clipboard copy and PTY injection | Copies raw code without formatting artifacts | `ORIGINAL_REQUEST.md` line 67 |
| 4 | R3 AI Panel | Technical Key-Value Info Cards | Structured cards rendering execution metrics (model, provider, latency, tokens, exit code) | `keyValues: Record<string, string>` | Neo-brutalist key-value grid component | Gracefully hides empty or undefined card entries | `ORIGINAL_REQUEST.md` line 67 |
| 5 | R3 AI Panel | Streaming & Actionable Error States | Dynamic token streaming with typing indicator and actionable recovery buttons (e.g., "Configure API Key", "Retry") | Stream chunks / error codes (`NO_KEY`, `RATE_LIMIT`, `TIMEOUT`) | Real-time token updates and contextual resolution actions | Never leaves the user stranded; opens settings modal or provides retry | `ORIGINAL_REQUEST.md` line 68 |
| 6 | R3 AI Panel | Contextual Terminal Assistance | Captures current terminal state (CWD, git branch, last command, error exit code, screen output) into prompt context | `activePaneId`, terminal scrollback / screen inspect | Contextual prompt augmentation injected into system prompt | Omits sensitive terminal data if pane is unreadable or empty | `ORIGINAL_REQUEST.md` line 69; `pty_manager.rs` |
| 7 | R5 Providers | Multi-Provider Support | Out-of-the-box support for OpenAI, Anthropic, Gemini, Groq, OpenRouter, and Ollama | Provider identifier, API key, model identifier | Stored `ProviderConfig` with default model and endpoint | Validates credentials during test connection | `ORIGINAL_REQUEST.md` lines 79-85; `ipc.rs` line 381 |
| 8 | R5 Providers | Custom Provider Configuration | Configurable custom provider with display name, base URL, API key, model identifier, and protocol adapter (`openai` vs `anthropic`) | `CustomProviderDraft` object | Registered custom entry in `ProviderConfig.providers` | Rejects missing name, invalid URL, or empty model | `ORIGINAL_REQUEST.md` line 84; `ipc_bridge.rs` line 1270 |
| 9 | R5 Providers | Masked API Key Management | Password input masking (`••••••••`) with reveal toggle and secure local storage permissions (0600) | User key input, reveal toggle state | Masked display; unmasked payload sent over local IPC | Does not leak API keys in error dialogs or tooltips | `ORIGINAL_REQUEST.md` line 86; `provider.rs` line 71 |
| 10 | R5 Providers | Live Connection Testing | Asynchronous connection verification ping to endpoint before saving configuration | Provider ID, API key, model, base URL | Test result banner: `{ success: true, message: string }` | Displays actionable error message from backend client | `ORIGINAL_REQUEST.md` line 86; `client.rs` line 154 |
| 11 | R5 Providers | Unsaved Changes Protection | Draft preservation and confirmation guards when switching between providers or closing settings | Active draft changes in modal form | Warning dialog or tab draft preservation | Prevents accidental loss of entered endpoints or keys | `ORIGINAL_REQUEST.md` line 86; `AiSettingsModal.tsx` |
| 12 | R4 & R5 Sync | Synchronized Provider & Model Selectors | Single source of truth in store synchronizing provider and model selectors between Input Bar and AI Assistant panel | `selectedAiProvider`, `selectedAiModel` in store | Real-time synchronized dropdowns in both UI components | Defaults to `default_provider` if selected provider is deleted | `ORIGINAL_REQUEST.md` lines 75, 101; `ModernInputBar.tsx` |
| 13 | Backend IPC | AI Chat Execution | IPC command dispatching prompt to active provider and returning completion text | `provider`, `model`, `prompt`, `system_prompt` | `AiChatResult { content }` string | Returns structured error string on failure | `ipc_bridge.rs` line 1359; `client.rs` line 104 |
| 14 | Backend IPC | Provider Settings Deletion | IPC command removing a custom or saved provider from `providers.toml` | `provider: string` | Updated `ProviderConfig` without deleted key | Resets `default_provider` to `openrouter` or `openai` if deleted | `ipc_bridge.rs` line 1294; `provider.rs` line 130 |

---

## 3. Edge Cases

| # | Feature | Input | Observed Behavior | Required Behavior / Handling |
|---|---------|-------|-------------------|------------------------------|
| 1 | Custom Provider | Base URL with trailing slash or whitespace (e.g. ` https://api.together.xyz/v1/ `) | If unnormalized, can result in malformed double-slash URLs (e.g. `https://api.together.xyz/v1//chat/completions`) | Trim whitespace and strip trailing slashes in UI validation before IPC dispatch |
| 2 | Custom Provider | Missing protocol adapter selection | Rust backend defaults to `openai` protocol adapter if None | Explicitly default UI selector to `'openai'` and pass `'openai'` in payload |
| 3 | Provider Deletion | Deleting the currently active default provider | `delete_provider_setting` in Rust resets `default_provider` to `"openrouter"` (line 135) | Store must synchronize `selectedAiProvider` to the new default so Input Bar and AI Panel update immediately |
| 4 | Input Bar Synchronization | User changes provider in Input Bar while AI Assistant Panel is open | If separate component states exist, panel shows stale model | Centralized in `aetherStore.ts`: `setSelectedAiProvider` updates both components via listener `notify()` |
| 5 | Connection Testing | Testing a local Ollama endpoint when Ollama daemon is offline (`http://localhost:11434/v1`) | Returns connection refused error | Display clear connection error banner: "Connection failed: Connection refused (os error 111). Check that Ollama is running." |
| 6 | API Key Masking | Editing an existing provider whose key is already saved on disk | Plaintext key loaded from TOML is exposed in input value | Display masked placeholder `••••••••••••` and only replace if user explicitly enters a new value or clicks reveal |
| 7 | Contextual Terminal Help | Active terminal pane has empty scrollback or exited process | Scrollback query returns empty buffer | Assistant prompts with workspace context without crashing or generating empty context blocks |
| 8 | Markdown Rendering | Assistant returns unclosed markdown code fence (e.g. in streaming mode) | Markdown parser can break or leak styling to container | Use resilient parser (or streaming code block handler) that auto-closes open backtick fences |
| 9 | Long Output / Large Prompt | User requests terminal error analysis on 10,000-line compiler dump | Token overflow or request timeout | Truncate terminal scrollback context to last 150-200 lines (~4000 tokens) before sending to LLM |
| 10 | Rapid Model Switching | User rapidly switches models while previous request is streaming/loading | State race condition where response from model A updates UI for model B | Tag each request with request ID / timestamp; ignore responses if selected model changed |

---

## 4. BYOK Terminology Scan & Remediation

Per the strict requirement:
> **STRICT UI COPY RESTRICTION**: Never display 'BYOK' anywhere in the application UI (use 'API Key', 'Provider Settings', or 'Connection Settings'). Scan entire repo for any existing occurrences of 'BYOK'.

### Existing Occurrences (8 instances in project code & tests):

| # | File Path | Line | Existing Line Content | Prohibited Token | Required Replacement |
|---|-----------|------|-----------------------|------------------|----------------------|
| 1 | `crates/aetherd/src/ai_pilot/supervisor.rs` | 293 | `"No API key configured for provider '{provider}'. Please configure your BYOK API key in AI Pilot Settings."` | `BYOK API key in AI Pilot Settings` | `"No API key configured for provider '{provider}'. Please configure your API Key in Provider Settings."` |
| 2 | `ui/src/main.tsx` | 455 | `{/* AI Pilot BYOK Settings Button */}` | `BYOK` | `{/* AI Pilot Provider Settings Button */}` |
| 3 | `ui/src/main.tsx` | 463 | `title="Aether Native AI Pilot & Multi-Provider BYOK Settings"` | `BYOK Settings` | `title="Aether Native AI Pilot & Multi-Provider Settings"` |
| 4 | `ui/src/components/OrchestratorBar.tsx` | 185 | `title="Configure BYOK Provider and API Keys"` | `BYOK Provider` | `title="Configure AI Provider and API Keys"` |
| 5 | `ui/src/components/OrchestratorBar.tsx` | 188 | `<span>BYOK Settings</span>` | `BYOK Settings` | `<span>Provider Settings</span>` |
| 6 | `ui/src/components/AiSettingsModal.tsx` | 192 | `<span>Native AI Pilot & Multi-Provider BYOK</span>` | `BYOK` | `<span>Native AI Pilot & Multi-Provider Settings</span>` |
| 7 | `ui/src/components/AiSettingsModal.tsx` | 289 | `<span>API Key (BYOK)</span>` | `(BYOK)` | `<span>API Key</span>` |
| 8 | `ui/tests/aiPilot.test.ts` | 63 | `describe('AI Pilot & BYOK Provider Engine Unit Tests', () => {` | `BYOK` | `describe('AI Pilot & Provider Engine Unit Tests', () => {` |

*Note: In `ui/src/components/AiSettingsModal.tsx:198`, the phrase `Configure your Bring Your Own Key credentials...` should also be replaced with `Configure your provider credentials to pilot interactive CLI agents`.*

---

## 5. Emoji Character Scan & Remediation

Per the strict requirement:
> **Zero emoji characters in code, comments, or documentation. Scan repo for any existing emojis.**

### Findings:
1. **Source Code (`ui/src/`, `crates/`, `ui/tests/`)**:
   - **ZERO emoji characters found!** The codebase is 100% clean of emojis. Only standard typographic symbols (arrows `→`, `↑`, `↓`, `↵`, bullet `•`, ellipsis `…`) and non-ASCII localization strings exist in test fixtures.
2. **Documentation Files**:
   - Emojis exist in 5 top-level markdown files and 1 text file:
     - `README.md` (7 occurrences: `⚡`, `🌟`, `⌨️`, `🛠️`, `🚀`, `📂`, `📄`)
     - `CONTRIBUTING.md` (4 occurrences: `🏗️`, `🛠️`, `🚀`, `📜`)
     - `SECURITY.md` (2 occurrences: `🔒`, `🛡️`)
     - `HANDOFF.md` (34 occurrences: `✅`, `✓`, `🏆`, `🦀`, `✨`, `📊`, `➔`, `🔧`, `🚀`, `📦`)
     - `TEST_READY.md` (9 occurrences: `✅`)
     - `project_bundle_clean.txt` (4 occurrences)
   - Worktrees under `.aether/worktrees/` also contain legacy checkout markdown notes.

### Exact Documentation Emoji Locations:

| File Path | Line | Emoji Found | Unicode Code Point | Line Snippet |
|-----------|------|-------------|--------------------|--------------|
| `README.md` | 1 | ⚡ | U+26A1 | `# ⚡ AetherTerminal` |
| `README.md` | 9 | 🌟 | U+1F31F | `## 🌟 Key Architectural Pillars` |
| `README.md` | 88 | ⌨️ | U+2328, U+FE0F | `## ⌨️ Global Keybindings` |
| `README.md` | 112 | 🛠️ | U+1F6E0, U+FE0F | `## 🛠️ Built-in MCP Tools (aether-mcp)` |
| `README.md` | 128 | 🚀 | U+1F680 | `## 🚀 Quick Start` |
| `README.md` | 169 | 📂 | U+1F4C2 | `## 📂 Repository Layout` |
| `README.md` | 208 | 📄 | U+1F4C4 | `## 📄 License` |
| `CONTRIBUTING.md` | 7 | 🏗️ | U+1F3D7, U+FE0F | `## 🏗️ Architecture Overview` |
| `CONTRIBUTING.md` | 20 | 🛠️ | U+1F6E0, U+FE0F | `## 🛠️ Prerequisites` |
| `CONTRIBUTING.md` | 53 | 🚀 | U+1F680 | `## 🚀 Development Workflow` |
| `CONTRIBUTING.md` | 85 | 📜 | U+1F4DC | `## 📜 Pull Request Guidelines` |
| `SECURITY.md` | 11 | 🔒 | U+1F512 | `## 🔒 Security Architecture` |
| `SECURITY.md` | 31 | 🛡️ | U+1F6E1, U+FE0F | `## 🛡️ Reporting a Vulnerability` |
| `TEST_READY.md` | 3, 14-21 | ✅ | U+2705 | Status checkmarks in verification table |

---

## 6. Data Contracts & Store Methods

### 6.1 TypeScript Provider Interfaces (`ui/src/stores/aetherStore.ts`)

```typescript
export type ProviderProtocol = 'openai' | 'anthropic';

export interface ProviderSettings {
  api_key: string;
  model: string;
  base_url?: string;
  display_name?: string;
  protocol?: ProviderProtocol | string;
}

export interface ProviderConfig {
  default_provider: string;
  providers: Record<string, ProviderSettings>;
}

export interface CustomProviderDraft {
  id?: string; // empty string or undefined for new provider, existing key for edit
  display_name: string;
  base_url: string;
  api_key: string;
  model: string;
  protocol: ProviderProtocol;
}

export interface ProviderMeta {
  id: string;
  name: string;
  tagline: string;
  defaultModel: string;
  defaultBaseUrl: string;
  docsUrl: string;
  requiresKey: boolean;
  isCustom?: boolean;
}
```

### 6.2 Standard Built-In Providers Map

```typescript
export const BUILT_IN_PROVIDERS: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'Industry-standard frontier models (GPT-4o, GPT-4o-mini).',
    defaultModel: 'gpt-4o',
    defaultBaseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    requiresKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    tagline: 'Direct native Messages API for Claude 3.5 Sonnet and Haiku.',
    defaultModel: 'claude-3-5-sonnet-20241022',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    requiresKey: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'Fast multimodal models with large context windows via OpenAI-compat API.',
    defaultModel: 'gemini-1.5-pro',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    requiresKey: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    tagline: 'Ultra-low latency inference for open weights models (Llama 3.3 70B).',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    docsUrl: 'https://console.groq.com/keys',
    requiresKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: 'Universal gateway for frontier models (Claude, GPT, Llama).',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    docsUrl: 'https://openrouter.ai/keys',
    requiresKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    tagline: 'Self-hosted local models without cloud dependencies or API costs.',
    defaultModel: 'llama3:latest',
    defaultBaseUrl: 'http://localhost:11434/v1',
    docsUrl: 'https://ollama.com',
    requiresKey: false,
  },
];
```

### 6.3 AI Assistant Panel Message Contract (`ui/src/stores/aetherStore.ts`)

```typescript
export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  provider?: string;
  model?: string;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  error?: string;
  keyValues?: Record<string, string>;
  terminalContext?: {
    paneId?: string;
    cwd?: string;
    gitBranch?: string;
    lastCommand?: string;
    lastExitCode?: number | null;
  };
}
```

### 6.4 Store State Additions (`globalState` in `aetherStore.ts`)

```typescript
// AI Assistant Panel State
aiAssistantOpen: typeof localStorage !== 'undefined'
  ? localStorage.getItem('aether_ai_assistant_open') === 'true'
  : false,
aiMessages: [] as AiMessage[],
aiIsStreaming: false,
aiIsLoading: false,

// Synchronized Provider & Model Single Source of Truth
selectedAiProvider: typeof localStorage !== 'undefined'
  ? (localStorage.getItem('aether_selected_ai_provider') || 'openai')
  : 'openai',
selectedAiModel: typeof localStorage !== 'undefined'
  ? (localStorage.getItem('aether_selected_ai_model') || 'gpt-4o')
  : 'gpt-4o',
```

### 6.5 Store Methods for Synchronization & Custom Providers

```typescript
/** Toggle AI Assistant Panel */
export function toggleAiAssistant(open?: boolean): void {
  globalState.aiAssistantOpen = typeof open === 'boolean' ? open : !globalState.aiAssistantOpen;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('aether_ai_assistant_open', String(globalState.aiAssistantOpen));
  }
  notify();
}

/** Synchronized Provider Selection */
export function setSelectedAiProvider(providerId: string): void {
  globalState.selectedAiProvider = providerId;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('aether_selected_ai_provider', providerId);
  }
  // Synchronize model default if available
  const pSettings = globalState.aiProviderConfig?.providers[providerId];
  const meta = BUILT_IN_PROVIDERS.find((p) => p.id === providerId);
  const targetModel = pSettings?.model || meta?.defaultModel || 'gpt-4o';
  globalState.selectedAiModel = targetModel;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('aether_selected_ai_model', targetModel);
  }
  notify();
}

/** Synchronized Model Selection */
export function setSelectedAiModel(model: string): void {
  globalState.selectedAiModel = model;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('aether_selected_ai_model', model);
  }
  notify();
}

/** Save Provider Settings (supports custom display_name and protocol) */
export async function saveAiProviderConfig(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string,
  displayName?: string,
  protocol?: string
): Promise<ProviderConfig | null> {
  if (!isRunningInTauri()) {
    return null;
  }
  try {
    const config: ProviderConfig = await invoke('cmd_save_ai_provider_config', {
      provider,
      apiKey,
      api_key: apiKey,
      model,
      baseUrl: baseUrl || null,
      base_url: baseUrl || null,
      displayName: displayName || null,
      display_name: displayName || null,
      protocol: protocol || null,
    });
    globalState.aiProviderConfig = config;
    notify();
    return config;
  } catch (err) {
    console.error('Failed to save AI provider config:', err);
    throw err;
  }
}

/** Delete Provider Configuration */
export async function deleteAiProviderConfig(providerId: string): Promise<ProviderConfig | null> {
  if (!isRunningInTauri()) {
    return null;
  }
  try {
    const config: ProviderConfig = await invoke('cmd_delete_ai_provider_config', {
      provider: providerId,
    });
    globalState.aiProviderConfig = config;
    if (globalState.selectedAiProvider === providerId) {
      setSelectedAiProvider(config.default_provider || 'openai');
    } else {
      notify();
    }
    return config;
  } catch (err) {
    console.error('Failed to delete AI provider config:', err);
    throw err;
  }
}

/** Dispatch AI Assistant Chat Message with Contextual Terminal Assistance */
export async function sendAiAssistantMessage(
  userPrompt: string,
  paneId?: string
): Promise<void> {
  const prompt = userPrompt.trim();
  if (!prompt) return;

  const activePane = globalState.panes.find((p) => p.id === (paneId || globalState.activePaneId));
  const userMsgId = `msg_${Date.now()}_u`;
  const asstMsgId = `msg_${Date.now()}_a`;

  // 1. Add User Message
  globalState.aiMessages.push({
    id: userMsgId,
    role: 'user',
    content: prompt,
    timestamp: Date.now(),
    terminalContext: activePane ? {
      paneId: activePane.id,
      cwd: activePane.worktreePath,
      gitBranch: activePane.gitBranch,
      lastExitCode: activePane.lastExitCode,
    } : undefined,
  });

  // 2. Add Assistant Placeholder
  globalState.aiMessages.push({
    id: asstMsgId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    provider: globalState.selectedAiProvider,
    model: globalState.selectedAiModel,
    status: 'sending',
  });

  globalState.aiIsLoading = true;
  notify();

  const startTime = Date.now();
  try {
    const systemPrompt = `You are AetherCortex AI Assistant, an expert developer companion integrated side-by-side with the terminal. Active pane: ${activePane?.id || 'none'}, CWD: ${activePane?.worktreePath || 'workspace'}. Answer concisely with markdown code blocks and key-value insights.`;

    const responseContent: string = await invoke('cmd_ai_chat', {
      provider: globalState.selectedAiProvider,
      model: globalState.selectedAiModel,
      prompt,
      systemPrompt,
      system_prompt: systemPrompt,
    });

    const elapsedMs = Date.now() - startTime;
    const target = globalState.aiMessages.find((m) => m.id === asstMsgId);
    if (target) {
      target.content = responseContent;
      target.status = 'complete';
      target.keyValues = {
        'Provider': globalState.selectedAiProvider.toUpperCase(),
        'Model': globalState.selectedAiModel,
        'Latency': `${elapsedMs}ms`,
      };
    }
  } catch (err: any) {
    const target = globalState.aiMessages.find((m) => m.id === asstMsgId);
    if (target) {
      target.status = 'error';
      target.error = String(err?.message || err);
      target.content = `Error connecting to ${globalState.selectedAiProvider}: ${String(err?.message || err)}`;
    }
  } finally {
    globalState.aiIsLoading = false;
    notify();
  }
}
```

---

## 7. UI Component Specifications

### 7.1 AI Assistant Panel (`AiAssistantPanel.tsx`)
- **Placement**: Mounted inside `<main>` right beside the terminal area:
  ```tsx
  <main className="flex-1 w-full relative overflow-hidden bg-slate-950 flex flex-row">
    <AetherDriveSidebar />
    <div className="flex-1 h-full relative overflow-hidden min-w-0">
      <TerminalGrid registerTermWriter={registerTermWriter} />
    </div>
    <AiAssistantPanel />
  </main>
  ```
- **Collapsible Drawer**: Toggled via shortcut (`Cmd+J` or `Ctrl+J`), top bar button, or left navigation item `✦ AI Assistant`. Smooth flex transition or width collapse (`w-0` to `w-96` or `w-[420px]`).
- **Header**:
  - Brand title: `✦ AI Assistant`
  - Synchronized Provider Selector dropdown & Model Selector dropdown.
  - "Clear History" button and "Close" button (`X`).
- **Body**:
  - Scrollable message stream with autoscroll to bottom.
  - User messages: Neo-brutalist dark card (`#121A1F`), crisp border (`#1F2E36`), timestamp.
  - Assistant messages: Cosmic cyan indicator `#00F0FF`, markdown rendering:
    - Headings, bold, italics, lists.
    - Code blocks with language tag, syntax highlighting, "Copy" button, and "Run in Terminal" action button.
    - Technical key-value information card (monospace table/grid).
  - Streaming / Loading state: Pulsing animated cursor (`_`) or typing indicator.
  - Actionable Error state:
    - If error mentions "API key", display a prominent `[Open Provider Settings]` button that triggers `toggleAiSettings(true)`.
    - If error is timeout or rate limit, display `[Retry Request]`.
- **Bottom Prompt Area**:
  - Contextual quick-prompt chips: `Explain last error`, `Summarize changes`, `Suggest command`.
  - Multiline prompt textarea with auto-height adjustment.
  - Send button (`Run / Ask`).

### 7.2 Provider Settings Modal (`AiSettingsModal.tsx`)
- **Title**: `Native AI Pilot & Multi-Provider Settings` (Clean of "BYOK").
- **Subtitle**: `Configure your API Key credentials to pilot interactive CLI agents`.
- **Sidebar List**:
  - Built-in providers: OpenAI (`gpt-4o`), Anthropic (`claude-3-5-sonnet-20241022`), Google Gemini (`gemini-1.5-pro`), Groq (`llama-3.3-70b-versatile`), OpenRouter, Ollama.
  - Custom Providers section with list of user-created custom endpoints.
  - `+ Add Custom Provider` button.
- **Custom Provider Form**:
  - Display Name input (e.g. `Local vLLM`, `Together AI`).
  - Endpoint Base URL input (e.g. `http://localhost:8000/v1`).
  - Protocol Adapter dropdown: `OpenAI Compatible` vs `Anthropic Compatible`.
  - Model Identifier input (e.g. `meta-llama/Llama-3-70b-instruct`).
  - API Key input (masked with Eye toggle; optional for local endpoints).
  - Validation:
    - Validates required fields before allowing save or connection test.
  - Connection Testing:
    - `Test Connection` button invoking backend test ping with live status feedback.
  - Deletion:
    - `Delete Provider` button with confirmation prompt for custom providers.
- **Unsaved Changes Guard**:
  - If user edits fields and switches provider without clicking save, show warning or retain draft state per provider ID to avoid accidental data loss.

### 7.3 Input Bar (`InputBar.tsx`)
- Rename component and references from `ModernInputBar` to `InputBar`.
- Provide inline synchronized Provider & Model selectors:
  - Mini provider pill / dropdown reflecting `store.selectedAiProvider`.
  - Mini model pill / dropdown reflecting `store.selectedAiModel`.
  - Changing either selector in Input Bar updates `aetherStore`, instantly synchronizing with the AI Assistant panel.
- Update placeholder text to concise standard: `"Ask AetherCortex or enter a command..."`.
- Auto-height adjustment for multiline input.
- Clear mode distinction: `$ CMD` vs `# AI` / natural language auto-detection.

---

## 8. Verification Results

All current workspace verification commands pass:
1. `cargo check --workspace`:
   - 0 errors, 0 warnings.
2. `cargo test --workspace`:
   - 86 passed, 0 failed across all 4 crates (`aether_core`, `aether_mcp`, `aether_protocol`, `aetherd`).
3. `cd ui && node --test tests/*.test.ts`:
   - 74 passed, 0 failed across 26 test suites.
4. `cd ui && npm run build`:
   - Succeeded with exit code 0, 1600 modules transformed.

---

## 9. Recommendations for Implementation Phase

1. **Strict Copy & Emoji Cleansing First**:
   - Replace the 8 instances of "BYOK" in `supervisor.rs`, `main.tsx`, `OrchestratorBar.tsx`, `AiSettingsModal.tsx`, and `aiPilot.test.ts`.
   - Remove emojis from `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `TEST_READY.md`, and `HANDOFF.md`.
2. **Store & IPC Expansion**:
   - Update `ProviderSettings` in `aetherStore.ts` with `display_name` and `protocol`.
   - Add `aiAssistantOpen`, `aiMessages`, `selectedAiProvider`, `selectedAiModel` to `aetherStore.ts`.
   - Implement `setSelectedAiProvider`, `setSelectedAiModel`, `toggleAiAssistant`, `deleteAiProviderConfig`, and `sendAiAssistantMessage`.
3. **Settings Modal Refactor**:
   - Support OpenAI, Groq, Anthropic, Gemini, OpenRouter, Ollama, and Custom Providers.
   - Implement custom provider add/edit/delete flow, protocol adapter toggle, live test feedback, and unsaved changes safety.
4. **AI Assistant Panel Component**:
   - Create `AiAssistantPanel.tsx` and dock side-by-side with `TerminalGrid`.
   - Implement markdown parsing, syntax highlighting code blocks with copy & insert-to-terminal buttons, and technical key-value cards.
5. **Input Bar Harmonization**:
   - Update `ModernInputBar.tsx` to `InputBar.tsx` with synchronized provider/model selectors and standard placeholder.
