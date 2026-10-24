# Project: AetherCortex UI/UX Refactor & AI Integration

## Architecture
AetherCortex is a polished, modern AI-powered terminal interface combining Minimalism and Neo-Brutalism.
The application operates on a desktop-daemon architecture:
1. **Backend Daemon (`aetherd`) & GUI IPC Bridge (`aether-gui`)**:
   - `aetherd`: Unix domain socket server (`/run/user/<uid>/aether.sock`), SQLite (`brain_db.rs`), PTY session manager (`portable_pty`), 512KB ring buffers, monotonic byte offset tracking, AI Pilot supervisor (`supervisor.rs`), and AI client engine (`client.rs`).
   - `aether-gui`: Tauri v2 application bridging UI frontend to `aetherd` over Unix domain socket with batched keystrokes, event streaming, workspace file APIs, and AI provider IPC commands (`cmd_save_ai_provider_config`, `cmd_test_ai_provider`, `cmd_ai_chat`, etc.).
2. **Frontend UI (`ui/`)**:
   - React 18 + TypeScript + Vite + TailwindCSS.
   - Layout:
     - **Persistent Left Sidebar (`w-56`)**: AetherCortex SVG logo, brand title "AetherCortex", 4 navigation items (`>_ Terminal`, `✦ AI Assistant`, `Workspace`, `Settings`), active/hover indicator lines, and bottom branding (`| BETTER TOOLS. BIGGER POSSIBILITIES.` and `///`).
     - **Collapsible Workspace Drawer (`AetherDriveSidebar.tsx`)**: File tree, text search, workflows (toggled via `Workspace` nav or `Cmd+\` / `Ctrl+\`).
     - **Main Workspace**:
       - **Top Bar**: Terminal tab buttons, new tab trigger (`+`), "AI Connected" status pill, and window controls.
       - **Central Terminal Grid**: Real-time canvas/WebGL terminal panes (`XtermWebGLPane.tsx`, `TerminalGrid.tsx`), multi-tab and split-pane (`Cmd+D` / `Cmd+Shift+D`) management.
       - **Input Bar (`InputBar.tsx`)**: Multiline auto-height input, shell vs AI mode distinction with safety routing guards, synchronized provider/model selector.
       - **AI Assistant Panel (`AiAssistantPanel.tsx`)**: Collapsible side-by-side chat panel with markdown parsing, syntax-highlighted code blocks with copy buttons, technical key-value cards, streaming/error states, and synchronized provider selector.
     - **Modals**: Provider / AI Settings modal (`AiSettingsModal.tsx`) with OpenAI, Anthropic, Gemini, Groq, Custom Provider (with connection test and masked keys), OpenRouter, Ollama. Zero "BYOK" copy.
   - Styling:
     - Design tokens: Dark Mode (`#050809` / `#0B1013` / `#00F0FF`) and Light Mode (`#F8F9FA` / `#FFFFFF` / `#00A3AD`). Flat colors only: no gradients, no glassmorphism, no excessive glow.
     - Typography: sans-serif for UI labels, monospace for terminal and code.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Neo-Brutalist Design Tokens & Palette | Semantic CSS variables for Dark Mode (#050809/#0B1013/#00F0FF) & Light Mode (#F8F9FA/#FFFFFF/#00A3AD) with flat colors only | M1 | R1, R6 |
| F2 | Typography Scoping | Sans-serif for all UI chrome/labels and monospace strictly for terminal, code, and input commands | M1 | R1 |
| F3 | Persistent Left Sidebar | Fixed w-56 sidebar with AetherCortex logo, title, 4 nav items, active/hover indicators, bottom branding | M1 | R1 |
| F4 | Workspace Drawer Integration | Keep AetherDriveSidebar intact as collapsible drawer adjacent to persistent sidebar | M1 | R1 |
| F5 | Zero-Emoji Repository Compliance | Clean all documentation emojis across README, CONTRIBUTING, SECURITY, TEST_READY, HANDOFF | M1 | Constraints |
| F6 | Prohibited Copy Removal ("BYOK" Ban) | Eliminate all 8 occurrences of "BYOK" in UI strings, tooltips, comments, and tests | M1 | R5 |
| F7 | Reactive Terminal Theme Synchronization | Sync active theme dynamically to xterm canvas options on theme toggle | M1 | R6 |
| F8 | Unified AI Provider Store State | Single source of truth for selectedAiProvider, selectedAiModel, customProviders, aiAssistantOpen | M2 | R4, R5 |
| F9 | Full Provider Matrix Support | Support OpenAI (gpt-4o), Anthropic (claude-3-5-sonnet-20241022), Gemini (gemini-1.5-pro), Groq (llama-3.3-70b-versatile), OpenRouter, Ollama | M2 | R5 |
| F10 | Custom Provider Configuration CRUD | Add, edit, select, delete custom providers with display name, base URL, API key, model ID, protocol adapter | M2 | R5 |
| F11 | Live Connection Testing & Key Masking | Validate required fields, run connection tests with feedback, mask API keys safely | M2 | R5 |
| F12 | Settings Modal Provider Management | Complete UI in AiSettingsModal with zero "BYOK" copy, provider selection, and custom provider CRUD | M2 | R5 |
| F13 | Main Terminal Engine & PTY Preservation | Preserve active xterm, PTY streaming, buffer deduplication, DA1/DA2/Kitty keyboard handlers | M3 | R2 |
| F14 | Terminal Tab & Split-Pane Controls | Multi-tab switching, new tab trigger, Cmd+D / Cmd+Shift+D split panes, layout balancing | M3 | R2 |
| F15 | Top Bar with AI Connected Pill | Tabs, new tab trigger, 'AI Connected' status pill, window controls | M3 | R2 |
| F16 | Input Bar Renaming & Auto-Height | Rename every instance of 'Modern Input Bar' to 'Input Bar', dynamic multiline height (32px-160px) | M3 | R4 |
| F17 | Mode Detection & Shell Protection Guard | Shell ($) vs AI (#/natural language), prevent arbitrary shell execution of natural language prompts | M3 | R4 |
| F18 | Input Bar Synchronized Provider Selector | Provider and model selector embedded in Input Bar bound to store single source of truth | M3 | R4 |
| F19 | Concise Input Bar Placeholder | "Ask AetherCortex or enter a command..." | M3 | R4 |
| F20 | Side-by-Side AI Assistant Panel | Collapsible panel docked alongside main terminal with smooth layout resizing | M4 | R3 |
| F21 | Message Rendering & Markdown | Distinct user and assistant message styling, markdown formatting, syntax highlighting, copy buttons | M4 | R3 |
| F22 | Technical Key-Value Info Cards | Formatted key-value cards for execution metadata, tokens, models, status | M4 | R3 |
| F23 | Streaming, Loading & Actionable Error States | Dynamic loading spinner/pulse, token streaming display, actionable error messages with retry | M4 | R3 |
| F24 | Synchronized Assistant Provider Selector | Provider and model selector in AI Assistant panel bound to the same store state as Input Bar | M4 | R3, R4 |
| F25 | Conversation History & Contextual Assistance | Conversation history list, terminal context inclusion action | M4 | R3 |
| F26 | Comprehensive 4-Tier E2E Test Suite | Automated test suite in ui/tests/ covering Tiers 1-4 | M5 | Acceptance |
| F27 | Full Workspace Verification & Knowledge Graph | cargo check, cargo test, npm run build, node --test, graphify update . | M5 | Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Brand Identity, Design Tokens & Persistent Sidebar | Implement F1-F7: CSS tokens (dark/light), font scoping, PersistentLeftSidebar component, BYOK removal, emoji cleanup, terminal theme reactivity | None | DONE |
| M2 | AI Provider Store & Provider Management | Implement F8-F12: store provider synchronization, full provider matrix, custom provider CRUD, connectivity test feedback, masked keys, AiSettingsModal refactor | None | DONE |
| M3 | Terminal Top Bar, Tab/Split Controls & Input Bar | Implement F13-F19: TopBar with tabs & 'AI Connected' pill, Input Bar renaming, auto-height, shell protection guard, synchronized selector, concise placeholder | M1 | DONE |
| M4 | Collapsible AI Assistant Panel | Implement F20-F25: AiAssistantPanel side-by-side with terminal, markdown/code copy, info cards, streaming/loading/error states, synchronized selector, history | M2, M3 | DONE |
| M5 | 4-Tier E2E Test Suite & Final Verification | Implement F26-F27: Tiers 1-4 E2E tests, cargo check/test, npm run build, zero-emoji audit, graphify update | M1, M2, M3, M4 | PLANNED |

---

## Interface Contracts

### 1. Unified Provider State (`ui/src/stores/aetherStore.ts`)
```typescript
export interface CustomProviderConfig {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol: 'openai' | 'anthropic' | 'gemini' | 'groq' | 'ollama' | 'openrouter';
}

export interface ProviderSettings {
  api_key: string;
  model: string;
  base_url?: string;
  display_name?: string;
  protocol?: string;
}

// In GlobalState:
// selectedAiProvider: string; // 'openai' | 'anthropic' | 'gemini' | 'groq' | 'openrouter' | 'ollama' | string (custom id)
// selectedAiModel: string;
// customProviders: CustomProviderConfig[];
// aiAssistantOpen: boolean;
// aiMessages: AiMessage[];

// Actions:
// setSelectedAiProvider: (provider: string) => void;
// setSelectedAiModel: (model: string) => void;
// setAiAssistantOpen: (open: boolean) => void;
// toggleAiAssistant: () => void;
// addCustomProvider: (config: Omit<CustomProviderConfig, 'id'>) => Promise<string>;
// updateCustomProvider: (id: string, config: Partial<CustomProviderConfig>) => Promise<void>;
// deleteCustomProvider: (id: string) => Promise<void>;
// testProviderConnection: (provider: string, config?: Partial<ProviderSettings>) => Promise<{ success: boolean; message: string }>;
```

### 2. Input Bar Routing Contract (`ui/src/components/InputBar.tsx`)
```typescript
export interface InputBarProps {
  onExecuteCommand: (command: string) => void;
  onSendAiPrompt: (prompt: string, provider: string, model: string) => void;
  activePaneId?: string;
}
// Guard:
// If input starts with '$', force shell execution.
// If input starts with '#' or '@', force AI prompt dispatch.
// If classified as natural_language with confidence >= 0.75, route to AI dispatch and block shell execution.
```

### 3. AI Assistant Message Contract (`ui/src/components/AiAssistantPanel.tsx`)
```typescript
export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    provider?: string;
    model?: string;
    tokens?: number;
    latencyMs?: number;
    cards?: Array<{ key: string; value: string }>;
  };
  isStreaming?: boolean;
  error?: string;
}
```

---

## Code Layout
- `ui/src/`:
  - `components/`:
    - `PersistentLeftSidebar.tsx`: The fixed left neo-brutalist navigation sidebar.
    - `TopBar.tsx`: Header top bar with tabs, new tab button, "AI Connected" pill, window controls.
    - `InputBar.tsx`: Renamed and enhanced multiline input bar with synchronized provider selector.
    - `AiAssistantPanel.tsx`: Side-by-side collapsible AI assistant conversation panel.
    - `AiSettingsModal.tsx`: Complete provider management and custom provider configuration modal.
    - `AetherDriveSidebar.tsx`: Collapsible workspace drawer (files, search, workflows).
    - `TerminalGrid.tsx`: Terminal split panes and grid layout.
    - `XtermWebGLPane.tsx`: Reactive xterm canvas rendering.
  - `stores/`:
    - `aetherStore.ts`: Global state, provider single source of truth, theme defaults, shortcuts.
  - `utils/`:
    - `commandClassifier.ts`: Shell vs natural language classifier.
    - `themes.ts`: Neo-brutalist theme token definitions.
  - `index.css`: Semantic CSS variables for dark and light modes.
  - `main.tsx`: Root layout anchoring persistent sidebar, top bar, terminal, and AI assistant panel.
- `crates/`:
  - `aether-protocol/src/ipc.rs`: ProviderSettings and AI IPC message schemas.
  - `aether-gui/src/ipc_bridge.rs`: Tauri IPC commands for providers and AI chat.
  - `aetherd/src/ai_pilot/`: Supervisor and client engines.
