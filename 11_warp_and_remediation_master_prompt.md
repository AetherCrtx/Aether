# AETHER TERMINAL: MASTER REMEDIATION & WARP-STYLE FEATURE UPGRADE PROMPT

You are a Principal Systems Architect and Senior Rust/React Engineer. Your objective is to resolve 9 critical functional issues identified in the current `AetherTerminal` codebase (`crates/aether-protocol`, `crates/aetherd`, `crates/aether-mcp`, `crates/aether-gui`, and `ui/src`) AND upgrade the terminal user experience with modern Warp-inspired features (Command Blocks, Modern IDE Input Box, Parameterized Workflows, and One-Click Block Error Resolution).

Strict Rules:
1. Do not use any emojis in source code, comments, UI labels, or commit messages. Use clean typographic badges or Lucide icons in React components.
2. Preserve all existing passing tests and add unit/integration tests for every new capability.
3. Ensure zero compiler warnings across the Rust workspace and TypeScript frontend.

---

## PART 1: REMEDIATION OF THE 9 CRITICAL CORE ISSUES

### Issue 1: Command String with Arguments Fails in PTY Spawn
- Target Files: `crates/aetherd/src/pty_manager.rs`, `crates/aetherd/src/main.rs`
- Problem: When `BackgroundTasksDrawer.tsx` or `CustomToolModal.tsx` invokes `cmd_spawn_pane` with a multi-word command string such as `"npm run dev"` or `"aider --model deepseek"` and `args: []`, `CommandBuilder::new(&exec_cmd)` treats the entire string as a single binary filename, causing `No such file or directory`.
- Fix:
  1. In `pty_manager.rs` inside `spawn_pane`, inspect `command` and `args`.
  2. If `command` contains whitespace (or shell operators like `|`, `&&`, `;`, `>`) and `args` is empty:
     - Check if it is a simple command with flags (e.g., `"aider --model deepseek"` without shell operators). Split tokens safely respecting quotes, use token `[0]` as the executable (resolved via `resolve_shell_command`), and append tokens `[1..]` to `final_args`.
     - If it contains shell operators (`&&`, `|`, `;`, `>`), execute it via the user's login shell: `CommandBuilder::new(&user_shell)` with args `["-c", &raw_command_string]`.

### Issue 2: Orphan Child Processes When Closing a Pane
- Target File: `crates/aetherd/src/pty_manager.rs`
- Problem: `kill_pane()` currently sends `libc::kill(pid as i32, sig)` only to the root shell PID. Child processes spawned inside that shell (such as Vite, Next.js, or Cargo watch) survive as orphans and keep local TCP ports locked.
- Fix:
  1. In `kill_pane()`, collect all descendant PIDs using `get_process_tree_pids(pid)` BEFORE killing the root PID.
  2. Send the signal (`SIGTERM` or custom signal) to all descendant PIDs in reverse topological order (children first, root shell last), and also send `libc::kill(-(pid as i32), sig)` to signal the process group.

### Issue 3: Default Workspace Root Path Hardcoded to `$HOME` Instead of Project Repo
- Target Files: `crates/aetherd/src/main.rs`, `crates/aether-gui/src/ipc_bridge.rs`
- Problem: `aetherd` initializes the `"default"` workspace with `root_repo_path = $HOME`. When the user opens AetherTerminal inside a project repository (e.g., `/home/rasshqa/projects/Elliot`) and presses `Alt+M` (Diff Gatekeeper) or `MergeWorktree`, `main.rs` queries `ws.root_repo_path` from SQLite, which points to `$HOME` instead of the active Git repository, resulting in `RepoNotFound`.
- Fix:
  1. In `crates/aetherd/src/main.rs` inside `IpcRequestPayload::SpawnPane`: when `target_dir` is resolved (and especially if `git2::Repository::discover(&target_dir)` succeeds), update the workspace record's `root_repo_path` in `ctx.db` to the discovered repository's workdir so `WorktreeDiff` and `MergeWorktree` always operate on the actual active Git repository.
  2. In `WorktreeDiff` and `MergeWorktree` handlers in `crates/aetherd/src/main.rs`: if `agent.worktree_path` is `Some(wt_path)`, derive the root repository path directly from the worktree's parent repository (or via `Repository::discover`) as a primary source before falling back to `ws.root_repo_path`.

### Issue 4: Missing MCP Tools (`aether_release_module` and `aether_create_snapshot`)
- Target Files: `crates/aether-protocol/src/mcp.rs`, `crates/aether-mcp/src/tools.rs`, `crates/aether-protocol/src/lib.rs`
- Problem: AI agents can lock files via `aether_claim_module`, but there is no MCP tool exposed to release those locks (`aether_release_module`) or create safety checkpoints (`aether_create_snapshot`).
- Fix:
  1. In `crates/aether-protocol/src/mcp.rs`, add `ReleaseModuleArgs { pub files: Vec<String> }` and `CreateSnapshotArgs { pub summary: String }`.
  2. Register `"aether_release_module"` and `"aether_create_snapshot"` in `all_aether_mcp_tools()` (bringing total tools to 9).
  3. In `crates/aether-mcp/src/tools.rs`, implement handlers for `"aether_release_module"` (sending `IpcRequestPayload::ReleaseModule`) and `"aether_create_snapshot"` (sending `IpcRequestPayload::CreateSnapshot`).
  4. Update `test_mcp_tools_catalog` in `crates/aether-protocol/src/lib.rs` to assert `tools.len() == 9`.

### Issue 5: Interactive Pane Delegation (`mode = "pane"`) Does Not Spawn a Pane
- Target Files: `crates/aether-protocol/src/ipc.rs`, `crates/aetherd/src/main.rs`, `ui/src/stores/aetherStore.ts`
- Problem: When an agent calls `aether_delegate_task` with `mode: "pane"`, `aetherd` only writes a Blackboard entry without spawning a pane in the GUI.
- Fix:
  1. Add a new variant to `IpcEvent` in `crates/aether-protocol/src/ipc.rs`:
     ```rust
     DelegationPaneRequested {
         workspace_id: String,
         caller_agent_id: String,
         target_cli: String,
         prompt: String,
     }
     ```
  2. In `crates/aetherd/src/main.rs` under `IpcRequestPayload::DelegateTask`, when `del_req.mode != "headless"`, broadcast `IpcEvent::DelegationPaneRequested` via `ctx.event_tx`.
  3. In `ui/src/stores/aetherStore.ts` inside `subscribeAetherEvents`, handle `payload.DelegationPaneRequested` by calling `spawnAgentPane(target_cli, true)` and, once spawned, writing the delegated `prompt` + `\n` to the new pane's PTY.

### Issue 6: Terminal Output Disappears When Switching Tabs or Attaching from Background
- Target Files: `crates/aether-protocol/src/ipc.rs`, `crates/aetherd/src/main.rs`, `crates/aether-gui/src/ipc_bridge.rs`, `crates/aether-gui/src/main.rs`, `ui/src/components/XtermWebGLPane.tsx`, `ui/src/stores/aetherStore.ts`
- Problem: Switching tabs or detaching/attaching a background pane unmounts `<XtermWebGLPane>`. When remounted, a fresh Xterm instance is created with a blank screen because the 512KB `ring_buffer` in `pty_manager.rs` (`get_scrollback`) is never fetched.
- Fix:
  1. Add `GetScrollback { pane_id: String }` to `IpcRequestPayload` and `ScrollbackData { pane_id: String, data: Vec<u8> }` to `IpcResponsePayload` in `crates/aether-protocol/src/ipc.rs`.
  2. Handle `IpcRequestPayload::GetScrollback` in `crates/aetherd/src/main.rs` by calling `ctx.pty_manager.get_scrollback(&pane_id).await`.
  3. Expose `#[tauri::command] pub async fn cmd_get_scrollback(state: State<'_, GuiBridgeState>, pane_id: String) -> Result<Vec<u8>, String>` in `crates/aether-gui/src/ipc_bridge.rs` and register it in `crates/aether-gui/src/main.rs`.
  4. In `ui/src/components/XtermWebGLPane.tsx` on mount (inside `useEffect`), call `getPaneScrollback(paneId)` and write any existing bytes into `term.write(new Uint8Array(bytes))` before streaming live output.

### Issue 7: `PaneExited` Event Ignored by Frontend UI
- Target File: `ui/src/stores/aetherStore.ts`
- Problem: `subscribeAetherEvents` does not handle `payload.PaneExited`. Exited background tasks stay in `RUNNING` state forever, and exited interactive shells freeze instead of updating their status.
- Fix:
  1. In `subscribeAetherEvents` (`ui/src/stores/aetherStore.ts`), add a handler for `payload.PaneExited`:
     - Extract `{ pane_id, exit_code } = payload.PaneExited`.
     - If `pane_id` is in `globalState.backgroundTasks`, update its `status` to `exit_code === 0 ? 'EXITED' : 'ERROR'`.
     - If `pane_id` is in `globalState.panes`, update its `status` to `exit_code === 0 ? 'IDLE' : 'ERROR'` and record `lastExitCode: exit_code`.

### Issue 8: Sequential Estafet Pipeline in `OrchestratorBar.tsx` Fires Simultaneously
- Target Files: `ui/src/stores/aetherStore.ts`, `ui/src/components/OrchestratorBar.tsx`
- Problem: Typing `@claude design schema -> @codex write tests` in `OrchestratorBar.tsx` loops over both stages and sends both prompts at the exact same millisecond.
- Fix:
  1. Add a `pipelineQueue: { targetCli: string; prompt: string }[]` state in `aetherStore.ts`.
  2. When executing a multi-stage pipeline (`stages.length > 1`), execute Stage 1 immediately and push Stages `2..N` into `globalState.pipelineQueue`.
  3. Trigger the next stage in `pipelineQueue` automatically when the active stage's agent publishes a `HANDOFF` or `API_CONTRACT` to the Blackboard (`BlackboardEntryCreated`), OR provide a visible "Advance Pipeline Stage (1 pending)" banner in the top header so the user or agent signal can advance it cleanly.

### Issue 9: Live Obsidian External File Edits Do Not Notify Open GUI Sidebar
- Target Files: `crates/aether-protocol/src/ipc.rs`, `crates/aetherd/src/obsidian_sync.rs`, `crates/aetherd/src/main.rs`, `ui/src/stores/aetherStore.ts`
- Problem: `ObsidianSyncEngine::process_debounced_note` indexes modified `.md` files into SQLite FTS5 when edited externally in Obsidian, but does not emit an `IpcEvent`. The GUI sidebar does not auto-reload the note.
- Fix:
  1. Add `ObsidianNoteUpdated { workspace_id: String, relative_path: String }` to `IpcEvent` in `crates/aether-protocol/src/ipc.rs`.
  2. Pass `event_tx: Option<broadcast::Sender<IpcEvent>>` into `ObsidianSyncEngine` and emit `IpcEvent::ObsidianNoteUpdated` whenever `process_debounced_note` returns `Ok(true)`.
  3. Listen for `payload.ObsidianNoteUpdated` in `aetherStore.ts` and trigger a note refresh in `ObsidianSidebar.tsx`.

---

## PART 2: WARP-INSPIRED NEXT-GEN TERMINAL FEATURES

To elevate AetherTerminal into the ultimate Linux agentic terminal, implement the following 4 Warp-inspired architectural features:

### Feature A: Warp-Style Command Blocks & Block Inspector (`CommandBlocksOverlay.tsx`)
Instead of treating terminal output as an unstructured stream, track every command execution as a structured **Command Block**:
1. **Data Model (`ui/src/stores/aetherStore.ts`):**
   ```ts
   export interface CommandBlock {
     id: string;
     paneId: string;
     command: string;
     cwd: string;
     startedAt: number;
     finishedAt?: number;
     exitCode?: number | null;
     outputText: string;
     isBookmarked?: boolean;
     isCollapsed?: boolean;
   }
   ```
2. **Capture Mechanism:**
   - Whenever a command is submitted via the Modern Input Editor (or `Enter` key in the pane), create a new `CommandBlock` for that `paneId`.
   - Append incoming decoded UTF-8 `PtyOutput` (stripped of raw ANSI control sequences via a lightweight regex helper) to the active `CommandBlock.outputText` for that pane.
3. **Block Actions in UI (`AgentHeaderPill.tsx` & Pane Overlay):**
   - Add a toggle button in `AgentHeaderPill.tsx` to switch between **Raw Terminal View** and **Warp Block View** (or show a collapsible Block Timeline drawer on the right of each pane).
   - Each Block card displays:
     - Command string, execution timestamp, duration, and exit status badge.
     - Action buttons: `[Copy Command]`, `[Copy Output]`, `[Bookmark Block]`, `[Collapse/Expand]`, and **`[Send Block to Agent]`** (which opens a one-click menu to send the command + output directly to `@claude-code`, `@opencode`, or `@codex` with prompt: `"Analyze and fix the issue in this command output:\n..."`).

### Feature B: Modern IDE Bottom Input Bar per Pane (`ModernInputBar.tsx`)
Give every terminal pane a toggleable, Warp-style bottom-pinned **Modern Command & Prompt Editor**:
1. **Capabilities:**
   - Multi-line input support (`Shift+Enter` for newline, `Enter` to execute).
   - Mode switcher badge on the left of the input box:
     - **`$ CMD` Mode:** Sends shell commands directly to the pane's PTY.
     - **`# AI` Mode (Triggered when input starts with `#`):** Translates natural language (e.g., `# find all processes listening on port 8080`) into a suggested shell command or dispatches it to the active AI agent.
   - **History & Autosuggestions:** Pressing `Up/Down` cycles through previously executed commands from `CommandBlock` history; typing shows inline ghost-text completion from recent command history.

### Feature C: Aether Drive — Parameterized Workflows synced with Obsidian (`WorkflowsModal.tsx`)
Inspired by **Warp Drive**, allow users and AI agents to save, search, and execute parameterized command templates stored as Markdown files inside `.aether/vault/Workflows/`:
1. **Workflow Format:**
   ```ts
   export interface AetherWorkflow {
     id: string;
     name: string;
     description: string;
     commandTemplate: string; // e.g. "cargo test --package {{crate_name}} -- {{test_filter}}"
     tags: string[];
   }
   ```
2. **Parameterized Execution UI (`Ctrl+Shift+P` or `Alt+R`):**
   - Opens the **Aether Drive Workflow Palette**.
   - Automatically parses `{{variable_name}}` placeholders from `commandTemplate` and renders dedicated input fields for each parameter so the user can fill them in with `Tab` navigation and press `Enter` to run in the active pane.
   - Pre-seed 5 built-in developer & agentic workflows (e.g., Git Worktree Cleanup, Cargo Workspace Check, Port Kill by Number, Broadcast Architecture Review, Docker Container Logs).

### Feature D: Smart Command Completion & Error Recovery Banner
1. If a command or process in a pane exits with a non-zero status or outputs compiler/runtime errors (`error[E...]`, `ERR!`, `Traceback`, `panic`), display a subtle non-intrusive bar at the bottom of the pane:
   `[Error Detected in Last Command] -> [Fix with Peer Agent] [Snapshot Rollback (Alt+Z)]`
2. Clicking `[Fix with Peer Agent]` extracts the last 50 lines of the pane's scrollback/block output and dispatches it to an available coding agent pane.

---

## PART 3: STEP-BY-STEP VERIFICATION & QUALITY GATE

After implementing all fixes in Part 1 and features in Part 2, execute the following verification steps in order:

1. **Rust Workspace Compilation & Tests:**
   ```bash
   cargo check --workspace
   cargo test --workspace
   cargo test --test daemon_integration_test
   cargo test --test mcp_integration_test
   ```
   Verify that all unit tests and integration tests pass with 0 errors.

2. **Frontend TypeScript & Vite Bundle Verification:**
   ```bash
   cd ui
   npm run build
   ```
   Verify that TypeScript (`tsc`) and `vite build` succeed with 0 type or bundling errors.

3. **End-to-End Sanity Checklist:**
   - Spawning `"npm run dev"` or `"echo hello && uname -a"` in `BackgroundTasksDrawer` executes properly via shell without `No such file or directory`.
   - Switching between tabs (`Ctrl+T`, `Alt+1`, `Alt+2`) preserves terminal scrollback history via `cmd_get_scrollback`.
   - Each pane includes the Warp-style `ModernInputBar` and `CommandBlock` view toggle with `[Copy Output]` and `[Send Block to Agent]` actions.
   - Pressing `Alt+R` opens the Parameterized Workflows palette (`WorkflowsModal.tsx`).