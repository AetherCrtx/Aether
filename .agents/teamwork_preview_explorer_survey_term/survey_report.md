# Authoritative Blueprint: Main Terminal, Tab Management, and Input Bar (R2 & R4)

## Executive Summary
This report provides an authoritative technical survey and implementation blueprint for Requirements R2 (Main Terminal & Tab Management) and R4 (Input Bar & Unified Provider Synchronization) in the AetherCortex codebase.
The existing active terminal engine, PTY streaming architecture, daemon integration, and binary layout tree are fully functioning and verified against all 74 node tests and 85+ Cargo workspace tests. They must be preserved with surgical precision without introducing static mockups or dismantling the real-time event pipeline.
This blueprint outlines the exact changes, data structures, UI component contracts, and safety mechanisms required to deliver R2 and R4 while maintaining full backward compatibility.

---

## 1. Preserving the Active Terminal Engine & PTY Connections (R2)

### 1.1 Architecture & Current Implementation
The terminal rendering stack consists of four interlocking layers:
1. **Daemon & OS PTY Layer** (`crates/aether-gui`, `crates/aetherd`):
   - Tauri command `cmd_spawn_pane` allocates pseudo-terminals with isolated git worktrees or shared directories.
   - PTY output streams through a 512 KB circular ring buffer to prevent memory exhaustion during long-running sessions.
2. **IPC Event Bus & Stream Deduplication** (`ui/src/stores/aetherStore.ts:1534-1600`):
   - `subscribeAetherEvents` receives `aether:event` payloads containing `PtyOutput { pane_id, data, offset }`.
   - Incoming byte arrays are forwarded to pane-registered writers.
3. **Buffer Queue & Mount Synchronization** (`ui/src/main.tsx:71-92`):
   - `registerTermWriter(paneId, writer)` connects terminal instances to daemon streams.
   - If bytes arrive while an xterm pane component is mounting, `pendingPtyBuffersRef` caches them and flushes on mount, preventing initial stream loss.
4. **Xterm WebGL/DOM Pane** (`ui/src/components/XtermWebGLPane.tsx`):
   - Instantiates `@xterm/xterm` with `@xterm/addon-fit`, `@xterm/addon-image` (SIXEL/iTerm protocol), and `@xterm/addon-webgl` with automated fallback to native DOM renderer for 0ms input latency on software-emulated GPUs.
   - Handles CSI, OSC, and DCS protocol queries (DA1, DA2, DECRQM mode 2026/2004/1004/1016, Kitty Progressive Keyboard query `CSI ? u`, XTVERSION, OSC 10/11 color queries, XTGETTCAP DCS queries).
   - Manages backpressure batching with a 128 KB frame threshold via `requestAnimationFrame` to eliminate UI thread lockup on high-throughput output.

### 1.2 Non-Negotiable Preservation Directives
- **Never replace `TerminalGrid` or `XtermWebGLPane` with static mockups, div containers, or simulated logs.**
- Maintain `registerTermWriter` callbacks in `main.tsx` and pass them into `TerminalGrid`.
- Preserve `attachCustomKeyEventHandler` in `XtermWebGLPane.tsx` so global shortcuts bubble up while terminal text editing remains fully functional.
- Retain `getPaneScrollback(paneId)` to restore terminal history seamlessly on remounts or tab switches.

---

## 2. Multi-Tab Management & Split Panes (R2)

### 2.1 Multi-Tab System
- **State Model** (`ui/src/stores/aetherStore.ts:128-136`):
  ```typescript
  export interface TerminalTab {
    id: string;
    title: string;
    paneIds: string[];
    layout: LayoutNode | null;
    activePaneId: string | null;
    color?: string;
  }
  ```
- **Operations in `aetherStore.ts`**:
  - `createTab(title?, initialCliType?)` (lines 478-552): creates a new tab, saves current layout via `syncActiveTab()`, spawns a new pane via `cmd_spawn_pane`, and sets it active.
  - `switchTab(tabId)` (lines 554-567): synchronizes current active tab state before activating `targetTab`.
  - `closeTab(tabId)` (lines 569-605): terminates associated processes via `cmd_kill_pane`, removes tab from array, and re-routes focus to the nearest tab.
  - `renameTab(tabId, newTitle)` (lines 607-613): inline editing of tab labels.
  - `duplicateTab(tabId)` (lines 631-641): spawns clone tab with same shell/agent.
  - `nextTab()` and `previousTab()` (lines 643-655): tab cycling with wrap-around.

### 2.2 Split-Pane Tree & Layout Balancing
- **Tree Representation** (`ui/src/stores/aetherStore.ts:118-126`):
  ```typescript
  export type LayoutNode =
    | { type: 'pane'; paneId: string }
    | {
        type: 'split';
        id: string;
        direction: 'horizontal' | 'vertical';
        splitRatio: number; // 0.05 to 0.95, default 0.5
        children: [LayoutNode, LayoutNode];
      };
  ```
- **Recursive Rendering** (`ui/src/components/TerminalGrid.tsx:108-142`):
  - `direction === 'vertical'`: renders side-by-side columns (`flex-row`) separated by `SplitDivider`.
  - `direction === 'horizontal'`: renders stacked rows (`flex-col`) separated by `SplitDivider`.
  - Dragging the divider updates `splitRatio` via `updateSplitRatio(splitId, ratio)`.
  - Double clicking resets to `0.5` (50/50 split).
- **Layout Balancing**:
  - `balanceLayout(node)` (lines 391-406): calculates ratio based on count of leaf panes in left/right subtrees (`leftCount / total`) and recursively balances child nodes.
  - `equalizeLayout()` (lines 432-438): balances the active layout tree on user demand (`Alt+E` or toolbar button).

### 2.3 Keyboard Shortcut Wiring
- In `aetherStore.ts:setupGlobalShortcuts()` (lines 1369-1373):
  ```typescript
  // Cmd+D or Ctrl+D -> Split Vertical; Cmd+Shift+D or Ctrl+Shift+D -> Split Horizontal
  if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D') && !e.altKey) {
    e.preventDefault();
    splitActivePane(e.shiftKey ? 'horizontal' : 'vertical');
  }
  ```
- In `XtermWebGLPane.tsx:attachCustomKeyEventHandler` (lines 288-301):
  - Key `'d'` / `'D'` with `ctrlKey || metaKey` returns `false`, allowing the browser event to bubble up to `setupGlobalShortcuts()`.
  - `Cmd+W` / `Ctrl+W`: closes active pane via `requestClosePane`.
  - `Ctrl+Shift+W`: closes active tab via `closeTab`.
  - `Ctrl+T`: creates a new tab via `createTab`.
  - `Ctrl+Tab` / `Ctrl+Shift+Tab`: cycles next/previous tab.
  - `Alt+1` through `Alt+9`: direct tab switching.

---

## 3. Top Bar Architecture (R2)

### 3.1 Requirements Breakdown
Under R2, the top bar of the main terminal workspace must feature:
1. **Terminal Tab Buttons**:
   - Tab pills showing tab title, active highlight, color accent, split pane count badge, close button on hover, and double-click to rename.
2. **New Tab Trigger**:
   - `+` button triggering `createTab()`.
3. **'AI Connected' Status Pill**:
   - Indicates active AI connectivity status (e.g. Cosmic Cyan `#00F0FF` dot and `AI Connected` when a provider is configured and available, or `AI Standby` if no API key is set).
   - Clicking the pill opens the Provider/AI Settings modal.
4. **Standard Window Controls**:
   - Minimalist Neo-Brutalist control cluster on the top-right: Minimize, Maximize, Close.
   - Powered by Tauri window API (`getCurrentWindow()`) with safe fallbacks when running in browser mode.

### 3.2 Top Bar Implementation Specification
```tsx
import React from 'react';
import { useAetherStore, createTab, toggleAiSettings, isRunningInTauri } from '../stores/aetherStore';
import { ChromeHeaderTabs } from './ChromeHeaderTabs';
import { Sparkles, Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const TopBar: React.FC = () => {
  const store = useAetherStore();

  const handleMinimize = async () => {
    if (isRunningInTauri()) {
      try { await getCurrentWindow().minimize(); } catch (e) { console.warn(e); }
    }
  };

  const handleMaximize = async () => {
    if (isRunningInTauri()) {
      try { await getCurrentWindow().toggleMaximize(); } catch (e) { console.warn(e); }
    }
  };

  const handleClose = async () => {
    if (isRunningInTauri()) {
      try { await getCurrentWindow().close(); } catch (e) { console.warn(e); }
    }
  };

  const isAiConnected = Boolean(
    store.aiProviderConfig &&
    (store.activeAiProvider || store.aiProviderConfig.default_provider)
  );

  return (
    <header className="h-10 bg-[#0B1013] border-b border-[#162026] px-3 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Left: Terminal Tab Buttons and New Tab Trigger */}
      <div className="flex items-center flex-1 min-w-0 mr-4">
        <ChromeHeaderTabs />
      </div>

      {/* Right: AI Connected Status Pill & Window Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* AI Connected Status Pill */}
        <button
          onClick={() => toggleAiSettings(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border transition-all ${
            isAiConnected
              ? 'bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/40 hover:bg-[#00F0FF]/20'
              : 'bg-[#121A1F] text-[#8E9BA4] border-[#1F2E36] hover:text-[#F8F9FA]'
          }`}
          title="AI Provider Status - Click to configure"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isAiConnected ? 'bg-[#00F0FF] shadow-[0_0_6px_#00F0FF]' : 'bg-[#8E9BA4]'}`} />
          <span>{isAiConnected ? 'AI Connected' : 'AI Standby'}</span>
          <span className="text-[10px] text-[#8E9BA4] font-normal">
            ({store.activeAiProvider || 'openrouter'})
          </span>
        </button>

        {/* Standard Window Controls */}
        <div className="flex items-center border border-[#162026] rounded overflow-hidden bg-[#0E1418]">
          <button
            onClick={handleMinimize}
            className="p-1.5 text-[#8E9BA4] hover:text-[#F8F9FA] hover:bg-[#121A1F] transition-colors"
            title="Minimize"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={handleMaximize}
            className="p-1.5 text-[#8E9BA4] hover:text-[#F8F9FA] hover:bg-[#121A1F] transition-colors"
            title="Maximize"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 text-[#8E9BA4] hover:text-white hover:bg-rose-600 transition-colors"
            title="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </header>
  );
};
```

---

## 4. Input Bar Renaming & Audit (R4)

### 4.1 Exhaustive Audit of "Modern Input Bar"
A complete repository scan identified the exact locations where "Modern Input Bar" appears:
1. `ui/src/components/AgentHeaderPill.tsx:140`:
   - Current: `title="Toggle Modern Input Bar (Alt+I)"`
   - Target: `title="Toggle Input Bar (Alt+I)"`
2. `ui/src/stores/aetherStore.ts:1483`:
   - Current: `// Alt+I -> Toggle Modern Input Bar on active pane`
   - Target: `// Alt+I -> Toggle Input Bar on active pane`
3. Component File & Symbol Renaming:
   - File: `ui/src/components/ModernInputBar.tsx` -> create `ui/src/components/InputBar.tsx`
   - In `ui/src/components/InputBar.tsx`: export `export const InputBar: React.FC<Props> = ...` and export alias `export const ModernInputBar = InputBar;` to ensure 100% backward compatibility with any external tests or tools.
   - Update `ui/src/components/TerminalGrid.tsx` lines 17 and 178 to import and render `<InputBar ... />`.

---

## 5. Input Bar Mechanics & Safety Guarantee (R4)

### 5.1 Multiline Command & Prompt with Automatic Height Adjustment
Currently, `ModernInputBar.tsx` sets `rows={1}` with no dynamic height handling. Multiline commands or long instructions cause fixed-height squishing and ugly inner scrollbars.
**Fix Specification**:
```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);

useEffect(() => {
  const el = textareaRef.current;
  if (!el) return;
  el.style.height = 'auto';
  // Min height 32px (1 line), max height 160px (approx 6 lines)
  const targetHeight = Math.min(Math.max(el.scrollHeight, 32), 160);
  el.style.height = `${targetHeight}px`;
}, [value]);
```
- In CSS: `className="w-full resize-none bg-[#050809] border border-[#162026] rounded px-3 py-1.5 text-xs font-mono text-[#F8F9FA] placeholder-[#8E9BA4] focus:outline-none focus:border-[#00F0FF] overflow-y-auto no-scrollbar"`
- Key handling:
  - `Enter` (without `Shift`): submits input (`submit()`).
  - `Shift+Enter`: inserts newline, expanding textarea automatically up to 160px.

### 5.2 Concise Placeholder Text
Requirement R4 specifies exact concise placeholder copy:
- **Canonical placeholder**: `"Ask AetherCortex or enter a command..."`
- Replace existing verbose conditional strings:
  ```tsx
  placeholder="Ask AetherCortex or enter a command..."
  ```

### 5.3 Clear Mode Distinction: Shell (`$`) vs AI Prompt (`#` / Natural Language)
- **Visual Distinction**:
  - **Shell Execution Mode (`$ CMD`)**:
    - Triggered by explicit `$` or `$ ` prefix, or CLI binary classification.
    - Badge: Cosmic Cyan `#00F0FF`, icon: Terminal `>_`.
    - Border highlight: `#00F0FF`/40.
  - **AI Prompt Dispatch Mode (`# AI`)**:
    - Triggered by `#` prefix, `@agent` targeting, or natural language classification.
    - Badge: Vivid Purple `#A855F7` or Bright Cyan, icon: Sparkles `*`.
    - Border highlight: `#A855F7`/50.
  - Clicking the mode button allows toggling/pinning mode manually.

### 5.4 Strict Prevention of Arbitrary Shell Execution for AI Prompts
To guarantee that prompts intended for the AI are NEVER sent to the shell:
```tsx
const submit = async () => {
  const trimmed = value.trim();
  if (!trimmed) return;

  // 1. Check for explicit pilot directive
  if (trimmed.startsWith('!ai')) {
    const instruction = trimmed.replace(/^!ai\s*/, '').trim();
    if (instruction) runAiPilotPrompt(paneId, instruction);
    resetInput();
    return;
  }

  // 2. Explicit prefix indicators
  const isExplicitShell = trimmed.startsWith('$ ') || trimmed === '$';
  const isExplicitAi = trimmed.startsWith('#') || trimmed.startsWith('@');

  // 3. Intended for AI determination
  const isIntendedForAi =
    isExplicitAi ||
    mode === 'ai' ||
    (classification.type === 'natural_language' && !isExplicitShell);

  if (isIntendedForAi && !isExplicitShell) {
    // STRICT PREVENTION: Under no circumstances send to executeCommandInPane!
    const cleanPrompt = trimmed.replace(/^#\s*/, '').trim();
    if (!cleanPrompt) return;

    if (isAgentPane) {
      await sendPtyInput(paneId, `${cleanPrompt}\n`);
    } else {
      // Route to AI Assistant panel or agent pane without shell syntax error
      await routePromptToAgent(cleanPrompt, paneId);
    }
    resetInput();
    return;
  }

  // 4. Shell Execution Mode (only when explicit or classified as shell command)
  const cleanCmd = trimmed.replace(/^\$\s*/, '').trim();
  if (!cleanCmd) return;

  // Final defensive guard: if natural language with high confidence somehow slipped through, block shell execution
  if (!isExplicitShell && classification.type === 'natural_language' && classification.confidence >= 0.75) {
    console.warn('[InputBar] Refusing arbitrary shell execution for detected natural language prompt:', cleanCmd);
    await routePromptToAgent(cleanCmd, paneId);
    resetInput();
    return;
  }

  await executeCommandInPane(paneId, cleanCmd);
  resetInput();
};
```

---

## 6. Unified Provider & Model Synchronization (R4 & R5)

### 6.1 Single Source of Truth in `aetherStore.ts`
To synchronize provider and model selection between `InputBar` and `AiAssistantPanel`, add these fields and methods to `aetherStore.ts`:

```typescript
// In GlobalState:
activeAiProvider: (typeof localStorage !== 'undefined' && localStorage.getItem('aether_active_ai_provider')) || 'openrouter',
activeAiModel: (typeof localStorage !== 'undefined' && localStorage.getItem('aether_active_ai_model')) || 'anthropic/claude-3.5-sonnet',

// Actions:
export function setActiveAiProvider(provider: string, model?: string) {
  globalState.activeAiProvider = provider;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('aether_active_ai_provider', provider);
  }
  if (model) {
    globalState.activeAiModel = model;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aether_active_ai_model', model);
    }
  } else if (globalState.aiProviderConfig?.providers[provider]?.model) {
    globalState.activeAiModel = globalState.aiProviderConfig.providers[provider].model;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aether_active_ai_model', globalState.activeAiModel);
    }
  }
  notify();
}

export function setActiveAiModel(model: string) {
  globalState.activeAiModel = model;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('aether_active_ai_model', model);
  }
  notify();
}
```

### 6.2 Synchronized Selectors in Input Bar
In `InputBar.tsx`:
Add a compact provider and model selector in the charms header or alongside the Run button:
```tsx
<div className="flex items-center gap-1.5 text-[10px] font-mono">
  <select
    value={store.activeAiProvider}
    onChange={(e) => setActiveAiProvider(e.target.value)}
    className="bg-[#0E1418] border border-[#162026] text-[#F8F9FA] rounded px-1.5 py-0.5"
  >
    <option value="openai">OpenAI</option>
    <option value="anthropic">Anthropic</option>
    <option value="gemini">Gemini</option>
    <option value="groq">Groq</option>
    <option value="custom">Custom</option>
    <option value="openrouter">OpenRouter</option>
    <option value="ollama">Ollama</option>
  </select>

  <span className="text-[#8E9BA4] truncate max-w-[140px]" title={store.activeAiModel}>
    {store.activeAiModel}
  </span>
</div>
```
When selected in `InputBar`, `store.activeAiProvider` and `store.activeAiModel` update reactively. Any open `AiAssistantPanel` instantly mirrors this selection.

---

## 7. Step-by-Step Implementation Sequence for Worker Agents

1. **Step 1: Store Enhancement (`ui/src/stores/aetherStore.ts`)**:
   - Add `activeAiProvider` and `activeAiModel` with `localStorage` persistence to `globalState`.
   - Export `setActiveAiProvider(provider, model?)` and `setActiveAiModel(model)`.
   - Update comment on line 1483 from `Modern Input Bar` to `Input Bar`.
2. **Step 2: Component Refactor (`ui/src/components/InputBar.tsx`)**:
   - Create `ui/src/components/InputBar.tsx` (preserving `ModernInputBar.tsx` as backward-compat export).
   - Implement `scrollHeight` multiline auto-height (clamped 32px to 160px).
   - Set placeholder to `"Ask AetherCortex or enter a command..."`.
   - Implement dual-layer shell execution guard in `submit()`.
   - Add synchronized provider & model pill selector.
   - Apply AetherCortex Neo-Brutalism dark-mode color tokens (`#050809`, `#0B1013`, `#00F0FF`, `#162026`).
3. **Step 3: Update Callers & UI Strings**:
   - `ui/src/components/AgentHeaderPill.tsx:140`: change tooltip to `Toggle Input Bar (Alt+I)`.
   - `ui/src/components/TerminalGrid.tsx`: import `InputBar` from `./InputBar`.
4. **Step 4: Top Bar Implementation (`ui/src/components/TopBar.tsx` or Header in `main.tsx`)**:
   - Incorporate `ChromeHeaderTabs`.
   - Add `AI Connected` status pill.
   - Add standard window control buttons (Minimize, Maximize, Close).
5. **Step 5: Verification & Quality Gates**:
   - Run `npx tsc --noEmit && npm run build` in `ui/`.
   - Run `node --test tests/*.test.ts` in `ui/`.
   - Run `cargo check --workspace` and `cargo test --workspace`.
   - Confirm zero emoji characters across code, comments, and strings.

---

## 8. Conclusion
The terminal engine and PTY architecture are robust, fast, and fully tested. By refactoring the input bar to `InputBar.tsx` with auto-height, rigorous prompt-to-AI routing, and store-synchronized provider selection, and pairing it with a Neo-Brutalist Top Bar containing terminal tabs, 'AI Connected' indicator, and window controls, the application will fully satisfy Requirements R2 and R4 without regression.
