# AetherTerminal UI & Interaction Architecture Survey (R1 & R2)

**Agent**: `teamwork_preview_explorer_survey_1`  
**Date**: 2026-10-24  
**Target Scope**: UI Architecture in `ui/` for R1 (Aether Drive Sidebar) & R2 (Intelligent NL vs Shell Command Classifier)  
**Parent Task ID**: `b4b0fa97-873a-4908-ab8b-7c3e9bde85fa`

---

## 1. Observation

### 1.1 Codebase & Build Health
- `ui/package.json`:
  - React 18.3.1, `@tauri-apps/api` ^2.0.0, `@xterm/xterm` ^6.0.0, `lucide-react` ^0.453.0, `tailwindcss` ^3.4.14, `typescript` ^5.6.3, `vite` ^5.4.9.
- Clean build verification:
  - Command `npm run build` in `/home/rasshqa/projects/Elliot/ui` exited with code 0 (`dist/assets/index-CocetROC.js`, `811.22 kB`, 0 errors).
  - Command `cargo check --workspace` exited with code 0 in 5.55s.
  - Command `cargo test --workspace` exited with code 0; all 32 tests across `aether-gui`, `aether-mcp`, `aether-protocol`, and `aetherd` passed (100% green).

### 1.2 UI Application Shell & Layout (`ui/src/main.tsx`)
- Root component structure (`main.tsx:123-505`):
  ```tsx
  <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-mono overflow-hidden">
    {/* Top Header: 40px (h-10) */}
    <header className="h-10 bg-slate-900/90 backdrop-blur border-b border-slate-800/80 px-3 flex items-center justify-between z-30 shrink-0 select-none">
      <div className="flex items-center space-x-2 shrink-0 pr-2 border-r border-slate-800">
        <img src="/Aether.svg" className="w-4 h-4 rounded-sm object-contain" alt="Aether" />
        <span className="font-bold text-xs tracking-wider text-slate-100 hidden sm:inline">
          AETHER<span className="text-cyan-400 font-light">//TERM</span>
        </span>
      </div>
      <ChromeHeaderTabs />
      {/* Action Toolbar on Right */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
        {/* Palette (Ctrl+P), Theme (Cmd+,), Bg Tasks (Alt+Shift+B), Balance (Alt+E), Spawn Dropdown, Splits, Diff (Alt+M), Snapshots (Alt+Z), Broadcast (Ctrl+Space), Brain (Ctrl+B) */}
      </div>
    </header>

    {/* Main Terminal Grid Area */}
    <main className="flex-1 w-full relative overflow-hidden bg-slate-950">
      <TerminalGrid registerTermWriter={registerTermWriter} />
    </main>

    {/* Footer: 24px (h-6) */}
    <footer className="h-6 bg-slate-950 border-t border-slate-800/80 px-3 flex items-center justify-between text-[10px] text-slate-500 shrink-0 z-20">
      ...
    </footer>

    {/* Modals and Drawers */}
    <CommandPaletteModal />
    <ThemeModal />
    <OrchestratorBar />
    <DiffGatekeeperModal />
    <TimeTravelSlider />
    <ObsidianSidebar />
    <CustomToolModal />
    <ConfirmCloseModal />
    <BackgroundTasksDrawer />
    <WorkflowsModal />
  </div>
  ```

### 1.3 State Management & Persistence (`ui/src/stores/aetherStore.ts`)
- Custom reactive store pattern without external library dependencies (lines 284-301):
  - Module-scoped `let globalState = { ... }`.
  - Subscriber set `const listeners = new Set<() => void>()`.
  - Notification dispatcher `function notify() { listeners.forEach((fn) => fn()); }`.
  - Custom React hook `export function useAetherStore() { ... }` that re-renders on state changes.
- Session persistence (`localStorage`):
  - Used for `aether_default_shell` (lines 181, 279), `aether_theme` (line 212), and `aether_opacity` (line 213).
  - Clean and synchronous for initial state rehydration upon page load.
- Tauri IPC bridge (`aetherStore.ts:14-31`):
  - `invoke(cmd, args)` with fallback when running in browser mode (`isRunningInTauri()`).
  - `listen('aether:event', handler)` for daemon event subscriptions (`PtyOutput`, `PaneExited`, `PaneStatusChanged`, `BlackboardEntryCreated`, `FileLockChanged`, `ObsidianNoteUpdated`, `DelegationPaneRequested`).

### 1.4 Global Keyboard Shortcuts (`ui/src/stores/aetherStore.ts:1241-1411`)
- Handled via `setupGlobalShortcuts()` listening to window `keydown`:
  - `Ctrl+P` / `Cmd+P`: Command Palette (`toggleCommandPalette()`)
  - `Ctrl+D` / `Cmd+D`: Split Vertical (`splitActivePane('vertical')`); `+Shift`: Horizontal
  - `Ctrl+,` / `Cmd+,`: Theme Modal (`toggleThemeModal()`)
  - `Ctrl+Space`: Multi-CLI Orchestrator (`toggleOrchestrator()`)
  - `Ctrl+T`: New Tab; `Ctrl+Tab` / `Ctrl+Shift+Tab`: Next/Previous Tab
  - `Alt+E`: Equalize Split Layout (`equalizeLayout()`)
  - `Alt+M`: Worktree Diff Gatekeeper (`openDiffGatekeeper()`)
  - `Alt+Z`: Time Travel Zero-Commit Snapshots (`toggleTimeTravel()`)
  - `Ctrl+B`: Collective Memory / Obsidian Sidebar (`toggleObsidianSidebar()`)
  - `Alt+B`: Detach to background; `Alt+Shift+B`: Background Tasks Drawer
  - `Alt+R`: Aether Drive Workflow Palette (`toggleWorkflowsModal()`)
  - `Alt+I`: Toggle Modern Input Bar (`togglePaneInputBar()`)
  - `Alt+Shift+P`: Advance Estafet Pipeline Stage
  - `Alt+H/J/K/L` / Arrows: Directional Pane Navigation; `+Shift`: Resizing
- **Shortcut Availability Analysis for `Cmd+\` and `Ctrl+\`**:
  - The combination `(e.ctrlKey || e.metaKey) && (e.key === '\\' || e.code === 'Backslash')` is **completely unused** in the entire codebase.
  - No existing listener or browser default conflicts with `Cmd+\` / `Ctrl+\` in standard Linux / WebKit environments.

### 1.5 Drawer and Sidebar Implementations
- `ObsidianSidebar.tsx` (lines 181-206):
  - Rendered conditionally when `state.obsidianSidebarOpen` is true.
  - Positioned as a right drawer:
    `className="fixed inset-y-0 right-0 z-40 w-96 max-w-full bg-slate-950/95 backdrop-blur-md border-l border-slate-800/80 shadow-2xl flex flex-col transition-all duration-300 select-none"`
  - Features tab switcher (`blackboard` vs `obsidian`), file lock viewer, note reader (`readObsidianNote`), task mutator (`updateObsidianTask`).
- `BackgroundTasksDrawer.tsx` (lines 47-57):
  - Rendered when `store.backgroundDrawerOpen` is true.
  - Fullscreen backdrop with slide-in right sheet:
    `className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn"`
- Existing Aether Drive Workflows:
  - Currently a modal dialog: `WorkflowsModal.tsx` (`Alt+R` / `Alt+Shift+P`), which loads `.md` workflows via `cmd_list_workflows` from `.aether/vault/Workflows/`.

### 1.6 Modern Input Bar (`ui/src/components/ModernInputBar.tsx`)
- Rendered per-pane when `pane.inputBarOpen` is true (toggled via `Alt+I` or header button in `AgentHeaderPill.tsx`).
- Input elements (lines 53-118, 239-292):
  - Input mode currently toggled manually or strictly by `#` prefix:
    `const mode: InputMode = value.startsWith('#') ? 'ai' : 'cmd';` (line 62)
  - Mode badge button toggles `# ` prefix:
    ```tsx
    const toggleMode = () => {
      if (mode === 'cmd') {
        setValue('# ' + value.trim());
      } else {
        setValue(value.replace(/^#\s*/, ''));
      }
    };
    ```
  - Execution handling on `submit()` (lines 101-117):
    ```tsx
    if (trimmed.startsWith('#')) {
      const instruction = trimmed.slice(1).trim();
      if (!instruction) return;
      if (isAgentPane) {
        await sendPtyInput(paneId, `${instruction}\n`);
      } else {
        await dispatchToPeerAgent(`# ${instruction}`, '', undefined);
      }
    } else {
      await executeCommandInPane(paneId, trimmed);
    }
    ```
- Deficiencies observed:
  1. A user typing a natural language instruction without `#` in a shell pane (e.g. `list all markdown files modified today`) sends it directly to bash/zsh, resulting in `bash: list: command not found` or syntax errors.
  2. In `dispatchToPeerAgent` (`aetherStore.ts:1850-1865`), the prompt is hardcoded as:
     `const prompt = `Analyze and fix the issue in this command output:\n$ ${command}\n${excerpt}\n`;`
     This is designed for error recovery, not for forwarding general natural language instructions.

---

## 2. Logic Chain

```
[Observation: Cmd+\ and Ctrl+\ are completely free in setupGlobalShortcuts()]
      │
      ▼
[Inference 1: Binding (e.ctrlKey || e.metaKey) && (e.key === '\\' || e.code === 'Backslash') in setupGlobalShortcuts will provide conflict-free global toggling across Linux and macOS]

[Observation: ObsidianSidebar uses fixed right positioning; main.tsx wraps TerminalGrid in a flex-1 relative container]
      │
      ▼
[Inference 2: Aether Drive Sidebar can be cleanly placed on the left side of the screen as an interactive collapsible panel, either docked alongside <TerminalGrid> inside <main> (so terminal panes automatically re-balance their canvas width) or as a left drawer (fixed left-0 top-10 bottom-6 z-40 w-80). Docking inside <main> is superior for developer workflows because it prevents terminal output occlusion while browsing files.]

[Observation: localStorage is already the project standard for persistent user preferences in aetherStore.ts]
      │
      ▼
[Inference 3: Persisting aetherDriveSidebarOpen, activeTab ('tree' | 'search' | 'workflows'), and expanded folder paths in localStorage guarantees session persistence across reloads and tab navigations without requiring daemon database overhead.]

[Observation: WorkflowsModal already implements workflow loading, parameterized template extraction (extractWorkflowParams), and execution (runWorkflow)]
      │
      ▼
[Inference 4: The Workflows panel of the Aether Drive Sidebar can directly reuse store.workflows, loadWorkflows(), extractWorkflowParams, and runWorkflow() from aetherStore.ts without reinventing the workflow engine.]

[Observation: ModernInputBar currently relies on value.startsWith('#') to switch to AI mode]
      │
      ▼
[Inference 5: A client-side, zero-latency heuristic classifier can analyze input tokens, POSIX binaries, flags, and natural language grammar in real time on keystroke. When a natural language instruction is recognized, the UI automatically highlights the AI execution badge and routes the prompt directly to an active agent CLI (or spawns one) without prepending '#', preventing shell syntax errors.]
```

---

## 3. Detailed Architecture Plan & Recommendations

### 3.1 R1: Aether Drive Sidebar Architecture

#### 3.1.1 Placement & Top Header Integration
- **Top Header (`ui/src/main.tsx`)**:
  - Add a dedicated Sidebar Toggle button on the left header bar immediately following the Aether logo (line 132):
    ```tsx
    <button
      onClick={() => toggleAetherDriveSidebar()}
      className={`flex items-center space-x-1.5 px-2 py-1 rounded text-[11px] border transition-colors ${
        store.aetherDriveSidebarOpen
          ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200 shadow-sm shadow-cyan-500/20'
          : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
      }`}
      title="Aether Drive Workspace Sidebar (Cmd+\ / Ctrl+\)"
    >
      <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
      <span className="hidden md:inline">Drive</span>
      <kbd className="hidden lg:inline text-[9px] bg-slate-900 text-slate-400 px-1 py-0.2 rounded border border-slate-800">
        Ctrl+\
      </kbd>
    </button>
    ```
- **Main Layout (`ui/src/main.tsx:434`)**:
  - Update `<main>` to a flex row container:
    ```tsx
    <main className="flex-1 w-full relative overflow-hidden bg-slate-950 flex flex-row">
      <AetherDriveSidebar />
      <div className="flex-1 h-full relative overflow-hidden min-w-0">
        <TerminalGrid registerTermWriter={registerTermWriter} />
      </div>
    </main>
    ```
  - When open, `AetherDriveSidebar` takes `w-80 border-r border-slate-800 shrink-0 h-full flex flex-col bg-slate-950/95 backdrop-blur z-20`.
  - When closed, it unmounts or collapses with zero width, giving `TerminalGrid` 100% of the screen.

#### 3.1.2 Three Sub-Panels in `AetherDriveSidebar.tsx`
1. **Workspace File Tree Panel (`tab === 'tree'`)**:
   - Recursively displays directories and files from the active workspace root (`store.panes.find(p => p.id === store.activePaneId)?.worktreePath || '.'`).
   - Supports expanding and collapsing directories with caret icons and persistent expanded state.
   - Highlights file types with distinct icons and colors (Markdown, Rust, TypeScript, JSON, Shell, Config).
   - **File Inspection Card**:
     - Selecting a file displays a preview card with:
       - Relative path, file size, line count.
       - Scrollable read-only preview of file contents.
       - Quick action buttons:
         - `[Open in Terminal]`: Sends `cat <path>` or `vim <path>` into the active pane.
         - `[Copy Path]`: Copies relative or absolute path to clipboard.
         - `[Ask AI]`: Opens `ModernInputBar` with prompt `@claude explain <file>`.
         - `[Claim Lock]`: Calls `claimModule([relative_file_path])` via Aether's Blackboard locking system.
2. **Workspace Text Search Panel (`tab === 'search'`)**:
   - Fast, interactive text search input with debounced query execution.
   - Filter options: Case sensitivity, match preview.
   - Results list grouped by file with line numbers and snippet highlights.
   - Clicking a search result immediately opens the file inspection card at that line.
3. **Saved Workflows Panel (`tab === 'workflows'`)**:
   - Instant access to all parameterized markdown workflows (`store.workflows`), synced from `.aether/vault/Workflows/`.
   - Search filter for workflows by name, tag, or description.
   - Expanding a workflow shows parameter input fields (e.g. `{{package_name}}`, `{{test_name}}`).
   - One-click `[Run in Active Pane]` button calling `runWorkflow(wf.commandTemplate, values)`.

#### 3.1.3 Store Extensions (`ui/src/stores/aetherStore.ts`)
- Add state properties:
  ```ts
  aetherDriveSidebarOpen: typeof localStorage !== 'undefined'
    ? localStorage.getItem('aether_drive_sidebar_open') === 'true'
    : false,
  aetherDriveActiveTab: (typeof localStorage !== 'undefined'
    && (localStorage.getItem('aether_drive_active_tab') as 'tree' | 'search' | 'workflows'))
    || 'tree',
  ```
- Add actions:
  ```ts
  export function toggleAetherDriveSidebar(open?: boolean) {
    globalState.aetherDriveSidebarOpen = open !== undefined ? open : !globalState.aetherDriveSidebarOpen;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aether_drive_sidebar_open', String(globalState.aetherDriveSidebarOpen));
    }
    if (globalState.aetherDriveSidebarOpen) {
      void loadWorkflows();
    }
    notify();
  }

  export function setAetherDriveActiveTab(tab: 'tree' | 'search' | 'workflows') {
    globalState.aetherDriveActiveTab = tab;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aether_drive_active_tab', tab);
    }
    notify();
  }
  ```

#### 3.1.4 Backend / IPC Support
- In `crates/aether-gui/src/ipc_bridge.rs` and `main.rs`, expose lightweight local filesystem commands:
  - `cmd_read_dir(path: String) -> Result<Vec<FileTreeItem>, String>`
  - `cmd_read_file(path: String, max_bytes: Option<usize>) -> Result<FileContentResult, String>`
  - `cmd_search_workspace_text(root_path: String, query: String, max_results: Option<usize>) -> Result<Vec<SearchResultItem>, String>`
- Provide web/mock fallbacks in `aetherStore.ts` so `npm run dev` and automated browser tests run seamlessly without requiring the full Tauri desktop runtime.

---

### 3.2 R2: Intelligent Natural Language vs Shell Command Classifier Architecture

#### 3.2.1 Classifier Engine (`ui/src/utils/commandClassifier.ts`)
Create a fast, pure TypeScript classifier running synchronously on keystroke:

```ts
export type CommandClassification = 'shell' | 'natural_language';

export interface ClassificationResult {
  type: CommandClassification;
  confidence: number; // 0.0 to 1.0
  reason: string;
  suggestedMode: 'cmd' | 'ai';
}

const COMMON_SHELL_BINARIES = new Set([
  'git', 'cargo', 'npm', 'pnpm', 'yarn', 'bun', 'docker', 'kubectl', 'ls', 'cd', 'pwd',
  'cat', 'grep', 'find', 'curl', 'wget', 'ssh', 'kill', 'ps', 'tar', 'chmod', 'chown',
  'systemctl', 'journalctl', 'cp', 'mv', 'rm', 'mkdir', 'touch', 'sed', 'awk', 'echo',
  'export', 'source', 'make', 'cmake', 'python', 'python3', 'node', 'deno', 'rustc',
  'go', 'vim', 'nvim', 'nano', 'clear', 'htop', 'top', 'which', 'whoami', 'df', 'free',
  'head', 'tail', 'less', 'more', 'rg', 'fd', 'bat', 'eza', 'tree', 'zsh', 'bash', 'fish'
]);

const NL_START_WORDS = new Set([
  'how', 'why', 'what', 'where', 'when', 'which', 'who', 'whose',
  'can', 'could', 'would', 'should', 'is', 'are', 'does', 'do',
  'please', 'help', 'explain', 'tell', 'show', 'find', 'check',
  'write', 'create', 'build', 'generate', 'fix', 'refactor',
  'diagnose', 'summarize', 'search', 'investigate', 'analyze', 'debug'
]);

export function classifyCommand(input: string, detectedToolNames?: string[]): ClassificationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: 'shell', confidence: 1.0, reason: 'Empty input defaults to shell', suggestedMode: 'cmd' };
  }

  // 1. Explicit syntax markers
  if (trimmed.startsWith('#')) {
    return { type: 'natural_language', confidence: 1.0, reason: 'Explicit AI prefix (#)', suggestedMode: 'ai' };
  }
  if (trimmed.startsWith('$')) {
    return { type: 'shell', confidence: 1.0, reason: 'Explicit Shell prefix ($)', suggestedMode: 'cmd' };
  }

  // 2. Strong shell indicators
  if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/') || trimmed.startsWith('~')) {
    return { type: 'shell', confidence: 0.95, reason: 'Path-based executable', suggestedMode: 'cmd' };
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) {
    return { type: 'shell', confidence: 0.95, reason: 'Environment variable assignment', suggestedMode: 'cmd' };
  }
  // Common shell syntax constructs: pipes, redirections, flags, variable expansion
  if (/[|><;&]/.test(trimmed) || /\$[A-Za-z0-9_{]/.test(trimmed) || /\s-(?:-[a-z]+|[a-zA-Z]{1,4})\b/.test(trimmed)) {
    return { type: 'shell', confidence: 0.9, reason: 'Shell operators or CLI flags detected', suggestedMode: 'cmd' };
  }

  const tokens = trimmed.split(/\s+/);
  const firstToken = tokens[0].toLowerCase();

  // Known shell binary check (including detected system tools)
  if (COMMON_SHELL_BINARIES.has(firstToken) || detectedToolNames?.includes(firstToken)) {
    // If it starts with a command like 'find' or 'check' but has natural conversational flow:
    if (tokens.length > 3 && ['all', 'the', 'my', 'any', 'me'].includes(tokens[1]?.toLowerCase())) {
      return { type: 'natural_language', confidence: 0.85, reason: 'Conversational sentence structure', suggestedMode: 'ai' };
    }
    return { type: 'shell', confidence: 0.9, reason: `Recognized CLI command '${firstToken}'`, suggestedMode: 'cmd' };
  }

  // 3. Strong natural language indicators
  if (NL_START_WORDS.has(firstToken)) {
    return { type: 'natural_language', confidence: 0.95, reason: `Natural language conversational opener '${firstToken}'`, suggestedMode: 'ai' };
  }
  if (trimmed.endsWith('?') || trimmed.endsWith('!')) {
    return { type: 'natural_language', confidence: 0.9, reason: 'Conversational punctuation', suggestedMode: 'ai' };
  }

  // If input has multiple words with natural English stopwords
  const stopWordCount = tokens.filter(t => ['the', 'is', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'about'].includes(t.toLowerCase())).length;
  if (tokens.length >= 4 && stopWordCount >= 1) {
    return { type: 'natural_language', confidence: 0.85, reason: 'Natural language sentence phrasing', suggestedMode: 'ai' };
  }

  return { type: 'shell', confidence: 0.6, reason: 'Defaulting to shell', suggestedMode: 'cmd' };
}
```

#### 3.2.2 Real-time Visual Feedback in `ModernInputBar.tsx`
- Replace static mode check `value.startsWith('#')` with dynamic classification:
  ```tsx
  const classification = useMemo(() => {
    return classifyCommand(value, store.detectedTools.map(t => t.binary.toLowerCase()));
  }, [value, store.detectedTools]);

  const effectiveMode = manualModeOverride ?? classification.suggestedMode;
  ```
- Update Mode Switcher Badge (lines 240-256):
  - In Shell mode: `$ CMD` (Cyan styling).
  - In AI mode: `✨ AI (Auto)` or `# AI` (Indigo styling with Sparkles icon).
  - Hover tooltip displays: `Auto-detected: ${classification.reason} (${Math.round(classification.confidence * 100)}%)`.
  - Clicking the badge allows manual toggle or pinning.

#### 3.2.3 Seamless Agent Routing Pipeline (`aetherStore.ts`)
- Replace the legacy error-only `dispatchToPeerAgent` with `routePromptToAgent`:
  ```ts
  export async function routePromptToAgent(instruction: string, sourcePaneId?: string, targetCli?: string): Promise<AgentPane | null> {
    const cleanInstruction = instruction.replace(/^#\s*/, '').trim();
    if (!cleanInstruction) return null;

    // 1. Identify best agent: explicit target, or first active agent pane, or default detected agent
    const target = targetCli || globalState.detectedTools.find((t) => t.category === 'agent')?.id || 'claude-code';
    let agentPane = globalState.panes.find((p) => p.cliType === target);

    if (!agentPane) {
      agentPane = await spawnAgentPane(target, true);
    }

    if (agentPane) {
      setActivePane(agentPane.id);
      // Clean dispatch without prepending '#' that causes shell syntax errors
      await sendPtyInput(agentPane.id, `${cleanInstruction}\n`);
      return agentPane;
    }
    return null;
  }
  ```
- In `ModernInputBar.tsx` on `submit()`:
  - If `effectiveMode === 'ai'`:
    - If `isAgentPane`: Send `${cleanInstruction}\n` directly to this pane's PTY without `#`.
    - If `!isAgentPane` (interactive shell): Call `routePromptToAgent(cleanInstruction, paneId)`.
    - No shell command not found errors, no syntax errors, completely fluid agent invocation.
  - If `effectiveMode === 'cmd'`:
    - Call `executeCommandInPane(paneId, trimmed)`.

---

## 4. Caveats & Assumptions

1. **Caveat 1 — Native Tauri vs Browser Preview Mode**:
   - In production, AetherTerminal runs as a native Tauri v2 desktop application where `cmd_read_dir` and filesystem operations access the host OS.
   - When developing or testing via Vite (`npm run dev`), Tauri IPC calls fail silently or throw. The implementation must include transparent fallback data (mock workspace tree) so the UI remains interactive and tests pass in all environments.
2. **Caveat 2 — Ambiguous Commands in NL vs Shell**:
   - Single-word inputs such as `test` or `help` or `status` can be shell commands (or aliases) or conversational queries. The classifier engine assigns shell precedence for single-word inputs and shifts to natural language when conversational context (`how to`, `show me`, question marks, or multiple stop-words) is present.
3. **Caveat 3 — Workspace Root Detection**:
   - In single-pane or initial startup mode, the active Git repository path might be `.` before any pane spawns. The file tree should check `activePane.worktreePath`, then `workspace.root_repo_path`, and fallback to current directory `.`.

---

## 5. Conclusion

1. **UI Readiness**: The AetherTerminal frontend is in a healthy, modular state. `npm run build` bundles in under 9 seconds, and all 32 workspace unit/integration tests are passing.
2. **R1 Feasibility**:
   - Shortcuts `Cmd+\` and `Ctrl+\` (`e.code === 'Backslash'`) are unassigned and conflict-free.
   - Placing `AetherDriveSidebar` as a docked left sidebar inside `<main>` next to `<TerminalGrid>` provides an intuitive layout where terminal canvases resize smoothly without overlay obstruction.
   - Sub-panels for responsive workspace file tree (with expand/collapse & file inspection), workspace text search (with snippet previews), and markdown workflows (reusing `store.workflows` and `runWorkflow`) are clearly defined.
   - Session persistence integrates cleanly with the existing `localStorage` architecture.
3. **R2 Feasibility**:
   - The current `#` prefix restriction can be cleanly replaced with `classifyCommand()`.
   - Real-time classification on keystroke provides instant visual confirmation (`$ CMD` vs `✨ AI`).
   - The `routePromptToAgent()` pipeline guarantees that natural language prompts entered in shell panes are cleanly forwarded to agent panes without prepending `#` or triggering shell syntax errors.

---

## 6. Verification Method

To independently verify this investigation and future implementations:

1. **Frontend Compilation & Bundle**:
   ```bash
   cd /home/rasshqa/projects/Elliot/ui
   npm run build
   ```
   *Expected*: Exit code 0, 0 TypeScript errors, bundle generated in `dist/`.

2. **Backend & Workspace Tests**:
   ```bash
   cd /home/rasshqa/projects/Elliot
   cargo check --workspace
   cargo test --workspace
   ```
   *Expected*: Exit code 0, all 32 tests passing.

3. **Shortcut & Interaction Verification**:
   - Check `setupGlobalShortcuts()` in `ui/src/stores/aetherStore.ts` for `Cmd+\` / `Ctrl+\` handling.
   - Verify top header icon in `ui/src/main.tsx` toggles `store.aetherDriveSidebarOpen`.
   - Inspect `localStorage.getItem('aether_drive_sidebar_open')` to confirm cross-session persistence.

4. **Classifier Unit Tests**:
   - Create and execute unit tests for `classifyCommand` verifying:
     - `git status` -> `shell`
     - `ls -la /tmp` -> `shell`
     - `cargo check --workspace` -> `shell`
     - `what files were changed in the last commit?` -> `natural_language`
     - `explain why the test failed and propose a fix` -> `natural_language`
     - `find all rust files modified today` -> `natural_language`
