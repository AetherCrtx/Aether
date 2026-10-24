# HANDOFF REPORT — Spec Miner Survey 3
**Specification, Test Suites & 4-Tier Verification Matrix**

- **Author**: Specification Miner Agent (`teamwork_preview_spec_miner_survey_3`)
- **Recipient**: Parent Orchestrator (`b4b0fa97-873a-4908-ab8b-7c3e9bde85fa`)
- **Workspace**: `/home/rasshqa/projects/Elliot`
- **Date**: 2026-10-24T03:05:00Z
- **Integrity Mode**: Development

---

## 1. Executive Summary & Verification Baseline

| Verification Dimension | Authoritative Command | Observed Result | Status |
|---|---|---|---|
| **Rust Workspace Compilation** | `cargo check --workspace` | `Finished dev profile in 0.33s` | ✅ 100% Pass (0 errors) |
| **Rust Test Suite** | `cargo test --workspace` | `32 passed; 0 failed; 0 ignored in 0.42s` | ✅ 100% Pass (32/32 tests) |
| **Frontend TypeScript Typecheck** | `npx tsc --noEmit` (in `ui/`) | Clean exit code 0, 0 type errors | ✅ 100% Pass |
| **Frontend Production Build** | `npm run build` (in `ui/`) | Vite v5.4.21 bundle built in 9.55s | ✅ 100% Pass |
| **Knowledge Graph Synchronization** | `graphify update .` | 1185 nodes, 2625 edges, 74 communities | ✅ Synchronized |

---

## 2. Comprehensive Audit of Existing Test Suites

### 2.1 Complete Inventory of the 32 Cargo Tests

Running `cargo test --workspace` exercises 5 test execution binaries containing exactly **32 unit and integration tests**:

#### Suite A: `aether_gui` (`crates/aether-gui/src/main.rs`) — 5 Tests
Defined in `crates/aether-gui/src/tool_detector.rs` and `crates/aether-gui/src/ipc_bridge.rs`:
1. `tool_detector::tests::test_detect_available_tools_finds_shells` (`crates/aether-gui/src/tool_detector.rs:286`)
   - *Purpose*: Scans PATH and system shell registry to discover installed terminal shells (`sh`, `bash`, `fish`, `zsh`).
   - *Assertions*: Verifies detected list is non-empty, contains at least one shell (`category == "shell"`), and identifies system default.
2. `tool_detector::tests::test_validate_custom_tool_known_and_unknown` (`crates/aether-gui/src/tool_detector.rs:296`)
   - *Purpose*: Verifies tool validation logic resolves known binaries (`sh`) and returns an error for non-existent binaries (`nonexistent_binary_xyz_12345`).
   - *Assertions*: `validate_custom_tool("sh", ...).is_ok()` and `validate_custom_tool("nonexistent...", ...).is_err()`.
3. `ipc_bridge::tests::test_process_event_stream_batch_threshold` (`crates/aether-gui/src/ipc_bridge.rs:719`)
   - *Purpose*: Verifies IPC PTY event streaming batching logic. Chunks under 1KB threshold are buffered until accumulated size crosses threshold (1024 bytes), emitting a single merged `IpcEvent::PtyOutput`.
   - *Assertions*: Emitted buffer remains empty after 600 bytes, then flushes 1200 bytes total with preserved byte ordering (`[b'A'; 600]` followed by `[b'B'; 600]`).
4. `ipc_bridge::tests::test_process_event_stream_interval_flush` (`crates/aether-gui/src/ipc_bridge.rs:778`)
   - *Purpose*: Verifies temporal flush timer (20ms interval) flushes sub-threshold data (50 bytes) when idle.
   - *Assertions*: 0 events before interval timer expires; exactly 1 `PtyOutput` event containing `b"hello interval"` after 30ms.
5. `ipc_bridge::tests::test_process_event_stream_pane_exit_order` (`crates/aether-gui/src/ipc_bridge.rs:826`)
   - *Purpose*: Verifies strict sequential ordering: when `PaneExited` arrives, any un-flushed PTY buffer for that pane MUST be emitted *before* the `PaneExited` event.
   - *Assertions*: `emitted[0]` is `IpcEvent::PtyOutput`, `emitted[1]` is `IpcEvent::PaneExited` with `exit_code: Some(0)`.

#### Suite B: `aether_mcp` Integration (`crates/aether-mcp/tests/mcp_integration_test.rs`) — 1 Test
1. `test_mcp_server_tools_flow` (`crates/aether-mcp/tests/mcp_integration_test.rs:14`)
   - *Purpose*: End-to-end multi-agent MCP tool flow against an in-memory `BrainDb` daemon listener over a temporary Unix socket.
   - *Assertions*: Validates tool calls `aether_claim_module`, `aether_publish_blackboard`, and `aether_get_shared_context` execute without errors and return aggregated markdown context containing active file locks and blackboard decisions.

#### Suite C: `aether_protocol` (`crates/aether-protocol/src/lib.rs`) — 4 Tests
1. `tests::test_ipc_message_bincode_roundtrip` (`crates/aether-protocol/src/lib.rs:17`)
   - *Purpose*: Verifies bincode serialization and deserialization of `IpcMessage::Request(PtyInput)`.
   - *Assertions*: `decoded == original_msg`.
2. `tests::test_ipc_message_json_roundtrip` (`crates/aether-protocol/src/lib.rs:33`)
   - *Purpose*: Verifies JSON serialization and deserialization of `IpcMessage::Event(PaneStatusChanged)`.
   - *Assertions*: `decoded == original_msg`.
3. `tests::test_mcp_tools_catalog` (`crates/aether-protocol/src/lib.rs:45`)
   - *Purpose*: Verifies MCP tool registration catalog contains exactly 9 tools.
   - *Assertions*: Tool names include `aether_get_shared_context`, `aether_claim_module`, `aether_publish_blackboard`, `aether_delegate_task`, `obsidian_read_note`, `obsidian_update_task`, `obsidian_append_memory`, `aether_release_module`, `aether_create_snapshot`.
4. `tests::test_release_and_snapshot_args_deserialize` (`crates/aether-protocol/src/lib.rs:61`)
   - *Purpose*: Verifies deserialization of JSON arguments for `ReleaseModuleArgs` and `CreateSnapshotArgs`.
   - *Assertions*: Fields `files.len() == 2` and `summary == "Before refactor"`.

#### Suite D: `aetherd` Library & Main Binary (`crates/aetherd/src/`) — 20 Tests
##### Module `crates/aetherd/src/config.rs`:
1. `config::tests::test_parse_default_theme` (`crates/aetherd/src/config.rs:188`)
   - *Assertions*: Validates theme parsing ("Tokyo Night Dark") and keybindings (`Ctrl+Space`, `Alt+M`, `Ctrl+B`).
2. `config::tests::test_parse_default_agents` (`crates/aetherd/src/config.rs:177`)
   - *Assertions*: Validates agent registry contains keys for `claude-code`, `opencode`, `codex`, `antigravity`, `hermes`, and `shell`.

##### Module `crates/aetherd/src/brain_db.rs`:
3. `brain_db::tests::test_brain_db_lifecycle` (`crates/aetherd/src/brain_db.rs:802`)
   - *Assertions*: Comprehensive SQLite lifecycle: workspace upsert, agent instance registration, blackboard publishing, advisory file locks (`claim_file_locks` conflict detection & release), Obsidian note storage, and SQLite FTS5 search (`search_obsidian_fts`).

##### Module `crates/aetherd/src/worktree_engine.rs`:
4. `worktree_engine::tests::test_worktree_creation_and_diff` (`crates/aetherd/src/worktree_engine.rs:484`)
   - *Assertions*: Verifies git worktree creation, validates `target/` is NOT symlinked (preventing cargo race conditions), tests symlinking and isolation of `node_modules`, calculates worktree diff, and executes squash merge.

##### Module `crates/aetherd/src/snapshot_engine.rs`:
5. `snapshot_engine::tests::test_snapshot_capture_and_rollback` (`crates/aetherd/src/snapshot_engine.rs:109`)
   - *Assertions*: Captures git commit snapshot ("Checkpoint 1"), mutates `main.rs`, executes `rollback_snapshot`, and verifies restoration.

##### Module `crates/aetherd/src/pty_manager.rs`:
6. `pty_manager::tests::test_split_command_tokens_respects_quotes` (`crates/aetherd/src/pty_manager.rs:727`)
   - *Assertions*: Command tokenization preserves quoted substrings (`"hello world"`, `'x y'`).
7. `pty_manager::tests::test_resolve_exec_and_args_splits_flags` (`crates/aetherd/src/pty_manager.rs:736`)
   - *Assertions*: `echo hello world` splits executable `echo` and args `["hello", "world"]`.
8. `pty_manager::tests::test_resolve_exec_and_args_uses_shell_for_operators` (`crates/aetherd/src/pty_manager.rs:743`)
   - *Assertions*: Operator `&&` routes command via shell `-c`.
9. `pty_manager::tests::test_resolve_exec_and_args_keeps_explicit_args` (`crates/aetherd/src/pty_manager.rs:750`)
   - *Assertions*: Preserves explicit arg vectors (`cargo` + `["test", "--workspace"]`).
10. `pty_manager::tests::test_resolve_exec_and_args_bare_command` (`crates/aetherd/src/pty_manager.rs:757`)
    - *Assertions*: Bare command (`bash`) resolves without extra args.
11. `pty_manager::tests::test_pty_spawn_and_write` (`crates/aetherd/src/pty_manager.rs:764`)
    - *Assertions*: Spawns PTY running `/bin/sh -c "echo 'Hello from Aether'; sleep 0.1"`, reads broadcast `IpcEvent::PtyOutput`, verifies output string, checks scrollback ring buffer has `end_offset > 0` and non-empty buffer.
12. `pty_manager::tests::test_parse_tcp_listen_reader_dual_stack` (`crates/aetherd/src/pty_manager.rs:826`)
    - *Assertions*: Dual-stack port listener discovery parses `/proc/net/tcp` (IPv4) and `/proc/net/tcp6` (IPv6), ignores ESTABLISHED sockets, and extracts listening ports `[3000, 8080]`.

##### Module `crates/aetherd/src/obsidian_sync.rs`:
13. `obsidian_sync::tests::test_load_workflows_reads_vault_markdown` (`crates/aetherd/src/obsidian_sync.rs:542`)
    - *Assertions*: Parses markdown frontmatter (`id`, `name`, `tags`, `command_template`), supports parameter replacement `{{crate_name}}`, falls back to H1 header if no frontmatter, ignores non-markdown files.
14. `obsidian_sync::tests::test_load_workflows_missing_dir_is_empty` (`crates/aetherd/src/obsidian_sync.rs:586`)
    - *Assertions*: Gracefully returns empty vec for missing vault directories.
15. `obsidian_sync::tests::test_obsidian_frontmatter_and_checkbox_mutation` (`crates/aetherd/src/obsidian_sync.rs:598`)
    - *Assertions*: Modifies `- [ ]` task checkboxes in markdown notes, verifies self-write debounce suppression, validates duplicate content hash suppression, and tests memory note appending.

##### Module `crates/aetherd/src/main.rs` (`spawn_fallback_tests`):
16. `spawn_fallback_tests::fresh_pane_defaults_to_filesystem_root_not_home` (`crates/aetherd/src/main.rs:1159`)
    - *Assertions*: `resolve_spawn_working_dir` defaults new pane to `/` instead of `$HOME`.
17. `spawn_fallback_tests::workspace_root_wins_when_it_exists` (`crates/aetherd/src/main.rs:1166`)
    - *Assertions*: If workspace root is provided (`/tmp`), it is preferred.
18. `spawn_fallback_tests::workspace_root_equal_to_home_falls_back_to_root` (`crates/aetherd/src/main.rs:1172`)
    - *Assertions*: When workspace root is `$HOME`, falls back to `/`.
19. `spawn_fallback_tests::explicit_request_wins_over_everything` (`crates/aetherd/src/main.rs:1178`)
    - *Assertions*: Explicit path request (`/usr`) overrides all defaults.
20. `spawn_fallback_tests::missing_requested_path_falls_back_to_root` (`crates/aetherd/src/main.rs:1184`)
    - *Assertions*: Non-existent directory path safely falls back to `/`.

#### Suite E: Integration Tests (`crates/aetherd/tests/`) — 2 Tests
1. `test_daemon_unix_socket_integration` (`crates/aetherd/tests/daemon_integration_test.rs:16`)
   - *Purpose*: Integration test over real Unix domain socket. Connects client stream, sends `Ping` request, verifies `Pong`, sends `SpawnPane` (`/bin/echo AETHER_READY_SIGNAL`), and verifies `PaneSpawned` and `IpcEvent::PtyOutput`.
2. `seeded_vault_workflows_parse` (`crates/aetherd/tests/vault_workflows_test.rs:15`)
   - *Purpose*: Parses seeded runtime workflows in `~/.local/share/aether/vault/Workflows`: validates `wf_worktree_cleanup`, `wf_cargo_check`, `wf_port_kill`, `wf_broadcast_review`, and `wf_docker_logs`.

---

### 2.2 UI Test Setup and Build Pipeline Audit

- **Build Configuration**:
  - `ui/package.json` contains:
    - `"dev": "vite"`
    - `"build": "tsc && vite build"`
    - `"preview": "vite preview"`
  - TypeScript version: `^5.6.3` with `tsconfig.json` enforcing strict checking (`strict: true`, `noEmit: true`).
  - Vite version: `^5.4.9` with `@vitejs/plugin-react` producing production bundle.
- **Verification Command**:
  ```bash
  cd ui && npx tsc --noEmit && npm run build
  ```
  - Executed cleanly: 1597 modules transformed, producing `dist/index.html` (0.60 kB), `dist/assets/index-BQ8cmHtV.css` (50.75 kB), `dist/assets/index-CocetROC.js` (811.22 kB). Exit code 0, 0 errors.
- **Test Runner Gap**:
  - Currently, no automated JavaScript/TypeScript test runner (e.g. `vitest` or `playwright`) is configured in `ui/package.json`.
  - Testing UI components currently requires either:
    1) Pure function extraction and node-based headless test scripts (e.g. testing the command classifier with `node -e` or vitest).
    2) Backend integration tests in Rust exercising IPC commands.
    3) Adding `vitest` to `ui/package.json` for deterministic component testing.

---

## 3. Graphify Architecture Status & Verification

- **Status Check**: Ran `graphify check-update .` — returned exit code 0.
- **Update Verification**: Ran `graphify update .`:
  - AST extraction executed over all Rust (`crates/**/*.rs`) and TypeScript/React (`ui/src/**/*.tsx`, `ui/src/**/*.ts`) files.
  - Rebuilt: **1185 nodes**, **2625 edges**, **74 communities**.
  - Generated files updated in `graphify-out/`: `graph.json`, `graph.html`, and `GRAPH_REPORT.md`.
  - Exit code 0.

---

## 4. Features Discovered & Interface Contracts

### Features Discovered Table

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1 (Sidebar) | Aether Drive Sidebar Drawer | Collapsible sidebar drawer for file tree, workspace search, and runbooks | Key shortcut (`Cmd+\` or `Ctrl+\`) or top toolbar button | Rendered drawer component on side of viewport | Closes on `Esc` or toggle key; state retained | `ORIGINAL_REQUEST.md`, `main.tsx:413` |
| 2 | R1 (File Tree) | Workspace File Tree Navigation | Directory tree reflecting active workspace directory structure | Expand/collapse clicks, directory path | Nested tree of folders and files with file type icons | Emits error banner if path cannot be read | `ORIGINAL_REQUEST.md:25` |
| 3 | R1 (File Tree) | File Inspection View | Select file to preview or inspect contents in modal or drawer | Click file node in file tree | Syntax-highlighted text preview or file metadata | Shows warning if file is binary or inaccessible | `ORIGINAL_REQUEST.md:13` |
| 4 | R1 (Search) | Workspace Text Search Panel | Search input matching text across workspace files with preview snippets | Text query string (e.g. `test_pty`) | List of matching files, line numbers, and preview snippets | Shows "No matches found" for non-matching queries | `ORIGINAL_REQUEST.md:13,26` |
| 5 | R1 (Workflows) | Saved Markdown Workflows Access | Quick access to seeded and custom markdown runbooks from vault | Workflow selection click | Fills template parameters and dispatches to pane | Ignores invalid frontmatter, falls back to stem | `crates/aetherd/src/obsidian_sync.rs:542` |
| 6 | R1 (Persistence)| Sidebar State Persistence | Persists collapsed/expanded state across restarts and tab navigation | Toggle event, `localStorage` key `aether_sidebar_open` | Restored boolean state on app mount | Falls back to default `false` (collapsed) | `ui/src/stores/aetherStore.ts:181` |
| 7 | R2 (Classifier) | Real-Time Input Classifier | Intelligently classifies user input in `ModernInputBar` as shell command vs natural language | Input string in input textarea | Classification result (`'cmd'` vs `'ai'`) with visual indicator | Defaults to `'cmd'` for ambiguous single words | `ModernInputBar.tsx:62` |
| 8 | R2 (Classifier) | Fluid Agent Dispatch | Automatically routes natural language prompts to AI agent pipeline without `#` prefix | Enter on natural language prompt | Calls `sendPtyInput` (in agent pane) or `dispatchToPeerAgent` | Avoids shell syntax errors in generic shells | `ModernInputBar.tsx:98` |
| 9 | R3 (Resilience) | PTY Ring Buffer Retention | Daemon retains 512 KB circular buffer of PTY stdout/stderr for each active pane | Streaming bytes from PTY | Scrollback buffer `Vec<u8>` and `end_offset` | Oldest bytes overwritten on overflow | `crates/aetherd/src/pty_manager.rs:764` |
| 10 | R3 (Resilience) | Client-Side Buffer Deduplication | XTerm pane deduplicates incoming live PTY chunks against restored scrollback snapshot | Chunks with byte offsets | Merged xterm render without duplicated text | Discards overlapping chunks (`offset <= lastOffset`) | `ui/src/components/XtermWebGLPane.tsx:236` |
| 11 | R3 (Resilience) | Background Task Multiplexing | Panes and background tasks survive window navigation and tab switches without disconnection | Tab switch (`Ctrl+T`), unmount | Process stays alive in `aetherd`; output streams to ring buffer | None; process runs in background daemon | `ui/src/components/TerminalGrid.tsx:168` |
| 12 | R3 (Resilience) | Remote/SSH Session Resilience | Persistent PTY streaming and input handling for remote SSH sessions | `ssh <user>@<host>` in shell pane | Stable interactive session across tab switches | Displays reconnect banner if SSH socket drops | `ORIGINAL_REQUEST.md:19` |

### Edge Cases Table

| # | Feature | Input | Observed / Required Behavior |
|---|---------|-------|-------------------|
| 1 | Classifier | `find out why the server crashed` | First word is `find`, but followed by `out why`: MUST classify as **Natural Language (`ai`)**, NOT POSIX `find` shell command. |
| 2 | Classifier | `cat is my favorite animal` | First word is `cat`, but followed by `is my`: MUST classify as **Natural Language (`ai`)**, NOT `cat` file concatenation. |
| 3 | Classifier | `kill the process running on port 3000` | First word is `kill`, but followed by `the process`: MUST classify as **Natural Language (`ai`)**, NOT `kill -9 <PID>`. |
| 4 | Classifier | `git commit -m "how do I fix this?"` | Contains question mark inside quotes, but starts with `git` and has flags: MUST classify as **Shell Command (`cmd`)**. |
| 5 | Classifier | `echo what is going on?` | Starts with `echo`: MUST classify as **Shell Command (`cmd`)**. |
| 6 | Classifier | `how do I use | in bash?` | Contains shell pipe `|`, but starts with interrogative `how do I`: MUST classify as **Natural Language (`ai`)**. |
| 7 | Classifier | `help` / `test` / `status` | Ambiguous single word without flags or punctuation: MUST default to **Shell Command (`cmd`)** or offer dual-action hint. |
| 8 | Classifier | `# refactor auth` / `$ ls -la` | Explicit `#` prefix forces **AI mode**; explicit `$` prefix forces **Shell mode**. |
| 9 | Sidebar | Rapid `Cmd+\` toggle spam (10x in 100ms) | Sidebar animates smoothly without layout tearing; final persisted state matches terminal state. |
| 10 | File Tree | Deep nesting (>20 folders) or 10,000 files | Asynchronous directory loading (lazy expand) prevents UI main thread freeze. |
| 11 | Search | Search query with regex special characters (`[`, `*`, `+`) | Safely escapes query or handles regex syntax error with inline user warning. |
| 12 | Persistence | Terminal unmounted while 10MB burst output is streaming | `aetherd` ring buffer retains latest 512KB; upon remount, `XtermWebGLPane` retrieves scrollback and resumes live stream without UI lockup. |

---

## 5. Deterministic Natural Language vs Shell Command Classification Strategy

To guarantee deterministic and predictable behavior, the classifier should NOT rely on stochastic LLM calls for every keystroke. Instead, it must implement an ordered, deterministic heuristic evaluation pipeline:

### 5.1 The 6-Stage Heuristic Waterfall Engine

```
[Raw Input String]
        │
        ▼
[Stage 1: Explicit Overrides]
  • Starts with '#' ───────────────► AI Mode (100% confidence)
  • Starts with '$' ───────────────► CMD Mode (100% confidence)
  • Starts with './' or '../' or '/' ─► CMD Mode (100% confidence)
        │
        ▼
[Stage 2: Common CLI & Shell Syntax Validation]
  • First token is known CLI (git, cargo, npm, docker, etc.)
  • Has flags (-a, --workspace, -m)
  • Has operators (|, &&, ||, ;, >, 2>&1)
  • NOT overridden by question punctuation ──► CMD Mode (95% confidence)
        │
        ▼
[Stage 3: Natural Language Interrogatives & Punctuation]
  • Starts with (how, why, what, where, who, when, can you, could you, explain)
  • Ends with '?' ────────────────► AI Mode (95% confidence)
        │
        ▼
[Stage 4: Imperative Coding & Agent Action Verbs]
  • Starts with (fix, refactor, implement, create, add, update, delete, summarize, write)
    followed by English stopword (the, a, this, that, to, for, in) ──► AI Mode (90% confidence)
        │
        ▼
[Stage 5: Command Collision Disambiguation]
  • First token is collision candidate (find, cat, kill, date, which, man)
    - If next token is English article/preposition (out, the, a, why, is) ──► AI Mode (90% confidence)
    - If next token is path/flag (., -name, -9, -p) ───────────────────────► CMD Mode (90% confidence)
        │
        ▼
[Stage 6: Fallback Default]
  • Single words or unknown tokens default to CMD Mode (safe shell execution)
```

### 5.2 Deterministic Verification Test Suite Specification

A dedicated test module (`ui/src/utils/__tests__/commandClassifier.test.ts` or Rust equivalent) must assert deterministic results across a benchmark matrix of at least 50 representative inputs:

```typescript
describe('Deterministic Command Classifier', () => {
  const shellCases = [
    'git status',
    'cargo test --workspace',
    'npm run dev',
    'docker ps -a',
    'ls -la /tmp',
    'cd crates/aetherd',
    'echo "hello world"',
    'cat Cargo.toml | grep version',
    'find . -name "*.rs"',
    'kill -9 4521',
    'which rustc',
    'FOO=bar cargo build',
    'git commit -m "fix: how do I resolve this?"',
  ];

  const aiCases = [
    'how do I run tests in this workspace?',
    'why is the build failing with exit code 1?',
    'fix the broken test in pty_manager.rs',
    'refactor the authentication handler to use argon2',
    'find out why the server crashed',
    'cat is my favorite animal',
    'kill the process running on port 3000',
    'explain the architecture of aetherd',
    'create a new sidebar component for the file tree',
    'summarize recent git commits',
  ];

  test.each(shellCases)('classifies "%s" as shell command', (input) => {
    expect(classifyCommand(input).type).toBe('cmd');
  });

  test.each(aiCases)('classifies "%s" as natural language', (input) => {
    expect(classifyCommand(input).type).toBe('ai');
  });
});
```

---

## 6. Persistence Verification Design

### 6.1 R1 Sidebar Toggle State Persistence

- **Mechanism**:
  - Key: `aether_sidebar_open` stored in `localStorage`.
  - When user toggles via `Cmd+\` / `Ctrl+\` or header icon, update state and execute:
    ```typescript
    localStorage.setItem('aether_sidebar_open', JSON.stringify(isOpen));
    ```
  - On store initialization (`initStore`), hydrate:
    ```typescript
    const saved = localStorage.getItem('aether_sidebar_open');
    const sidebarOpen = saved !== null ? JSON.parse(saved) : false;
    ```
- **Verification Method**:
  1. Set `localStorage.setItem('aether_sidebar_open', 'true')`.
  2. Reload/remount application component tree.
  3. Assert `sidebarOpen === true` and sidebar DOM element is present and visible.
  4. Press `Cmd+\` -> assert state toggles to `false` and `localStorage.getItem('aether_sidebar_open') === 'false'`.
  5. Reload/remount -> assert sidebar remains collapsed.

### 6.2 R3 Terminal Buffers Across Remounts & Remote Resilience

- **Mechanism**:
  - In `aetherd`: `PtyManager` maintains an in-memory ring buffer (512 KB) for each pane.
  - In `aether-gui`: `cmd_get_scrollback(pane_id)` returns `(data: Vec<u8>, end_offset: u64)`.
  - In `XtermWebGLPane.tsx`:
    1. On mount: register writer with `registerTermWriter(paneId, ...)`.
    2. Any incoming live chunks while scrollback is fetching are queued in `preRestoreQueue`.
    3. `cmd_get_scrollback` resolves -> writes full scrollback to xterm instance, records `lastWrittenOffset = res.end_offset`.
    4. Queued chunks in `preRestoreQueue` are deduplicated: chunks where `offset + length <= lastWrittenOffset` are dropped.
    5. Live stream resumes seamlessly.
- **Verification Method**:
  1. Spawn a pane running a high-speed counter: `for i in $(seq 1 100); do echo "STREAM_CHUNK_$i"; sleep 0.05; done`.
  2. Switch tabs (`Ctrl+T` to new tab) while counter is at ~20.
  3. Wait 3 seconds in the new tab (allowing counter to output ~80).
  4. Switch back to original tab (`Alt+1`).
  5. Verify:
     - `XtermWebGLPane` remounts without error.
     - Scrollback shows all lines `STREAM_CHUNK_1` through `STREAM_CHUNK_80`.
     - No lines are duplicated (e.g. `STREAM_CHUNK_20` does not appear twice).
     - Live stream continues printing `STREAM_CHUNK_81` through `STREAM_CHUNK_100`.

---

## 7. Comprehensive 4-Tier E2E Testing Matrix

### Tier 1: Feature Coverage (Unit / Subsystem Happy Path)

| Test ID | Area | Target Feature | Test Specification | Verification Criteria |
|---|---|---|---|---|
| **T1-R1-01** | R1 | Sidebar Toggle Shortcut | Press `Cmd+\` (macOS) or `Ctrl+\` (Linux/Windows) in active window | Sidebar drawer toggles from collapsed to expanded |
| **T1-R1-02** | R1 | Top Toolbar Sidebar Icon | Click top toolbar sidebar icon button | Sidebar drawer toggles state; icon reflects active style |
| **T1-R1-03** | R1 | Workspace File Tree Render | Open sidebar with active workspace `/home/rasshqa/projects/Elliot` | File tree renders root directory entries with correct icons |
| **T1-R1-04** | R1 | Directory Expand/Collapse | Click folder node (e.g. `crates/`) | Folder node expands showing child crates; click again collapses |
| **T1-R1-05** | R1 | File Inspection Preview | Click a file node (e.g. `Cargo.toml`) | Opens file preview displaying file contents and line numbers |
| **T1-R1-06** | R1 | Search Query Input | Enter text query in workspace search panel | Lists matching files containing query with line previews |
| **T1-R1-07** | R1 | Saved Workflow Execution | Click a workflow in the workflows list | Loads command template or prompts parameter fill dialog |
| **T1-R2-01** | R2 | Pure Shell Detection | Type `cargo check` in ModernInputBar | Classifier sets mode to `$ CMD`; Run executes shell command |
| **T1-R2-02** | R2 | Pure Natural Language Detection | Type `how do I run tests?` in ModernInputBar | Classifier sets mode to `# AI`; Run dispatches to agent |
| **T1-R2-03** | R2 | Explicit Override `#` | Type `# ls -la` in ModernInputBar | Manual `#` prefix forces `# AI` mode |
| **T1-R2-04** | R2 | Explicit Override `$` | Type `$ help me fix this` in ModernInputBar | Manual `$` prefix forces `$ CMD` mode |
| **T1-R3-01** | R3 | PTY Pane Spawn & Stream | Spawn generic shell pane (`sh`) and send `echo HELLO` | Output `HELLO` received via `IpcEvent::PtyOutput` |
| **T1-R3-02** | R3 | Scrollback History Fetch | Call `cmd_get_scrollback` for pane with prior output | Returns non-empty byte buffer matching previous stdout |
| **T1-B-01** | Build | TypeScript Check | Run `npx tsc --noEmit` in `ui/` | Exit code 0, 0 compiler errors |
| **T1-B-02** | Build | Vite Production Bundle | Run `npm run build` in `ui/` | Production bundle emitted to `dist/`, exit code 0 |
| **T1-B-03** | Build | Cargo Test Suite | Run `cargo test --workspace` | All 32 existing unit and integration tests pass |
| **T1-B-04** | Build | Graphify Knowledge Graph | Run `graphify update .` | AST updated cleanly without errors |

---

### Tier 2: Boundary & Corner Cases (Limits, Stress, Errors)

| Test ID | Area | Scenario | Input / Condition | Expected Behavior |
|---|---|---|---|---|
| **T2-R1-01** | R1 | Rapid Toggle Spam | Press `Cmd+\` 10 times in 100ms | Animation completes cleanly; no DOM state desynchronization |
| **T2-R1-02** | R1 | Deep Directory Nesting | Workspace contains directory 20 levels deep | Tree renders hierarchy with horizontal scroll or auto-indentation |
| **T2-R1-03** | R1 | Huge File Directory | Directory containing 10,000+ files | Lazy rendering / virtual scrolling prevents UI thread lockup |
| **T2-R1-04** | R1 | Special File Characters | Filenames with spaces, unicode, emojis (`📦 my test.rs`) | File node renders correctly, selection and preview work |
| **T2-R1-05** | R1 | Inaccessible File Permissions | File with `chmod 000` | Displays clear permission denied message in preview |
| **T2-R1-06** | R1 | Search Regex Special Chars | Search query: `fn test_.*\[.*\(` | Regex special chars handled safely; no unhandled exceptions |
| **T2-R2-01** | R2 | Shell Command Collision Phrase | `find out why the server crashed` | Classified as **AI** (not POSIX `find`) |
| **T2-R2-02** | R2 | Command Collision Phrase 2 | `kill the process on port 3000` | Classified as **AI** (not `kill -9`) |
| **T2-R2-03** | R2 | Command Collision Phrase 3 | `cat is my favorite pet` | Classified as **AI** (not `cat` file concatenate) |
| **T2-R2-04** | R2 | Quoted Question in Shell | `git commit -m "why did this fail?"` | Classified as **CMD** (shell options take precedence) |
| **T2-R2-05** | R2 | Pipe in Natural Language | `how do I use | in bash?` | Classified as **AI** (question structure takes precedence) |
| **T2-R2-06** | R2 | Ambiguous Single Word | `help` or `status` | Classified as **CMD** by default (safe shell execution) |
| **T2-R2-07** | R2 | Empty / Whitespace Input | `   \t   \n` | Run button disabled; no dispatch |
| **T2-R3-01** | R3 | Massive Output Burst | PTY emits 10 MB stdout in 1 second (`head -c 10M /dev/urandom`) | PTY batching buffers chunks without dropping IPC socket |
| **T2-R3-02** | R3 | Extreme Pane Resizing | Resize terminal grid to 1x1 cols/rows | Terminal fits minimum bounds without math NaN or crash |
| **T2-R3-03** | R3 | Process Exit During Unmount | Process terminates while pane component is unmounted | `PaneExited` queued and handled cleanly upon remount |
| **T2-R3-04** | R3 | Sudden Socket Disconnect | Simulate daemon socket closure during active write | UI displays ErrorRecoveryBanner with Reconnect option |

---

### Tier 3: Cross-Feature Interactions

| Test ID | Interacting Features | Interaction Scenario | Expected Outcome |
|---|---|---|---|
| **T3-01** | R1 (Sidebar) + R3 (Multiplexer) | Open and close Aether Drive Sidebar while active PTY is streaming | Terminal grid smoothly resizes via `ResizeObserver`; no output loss, no scroll position jump |
| **T3-02** | R1 (File Tree) + R2 (ModernInputBar) | Click file in sidebar tree and drag or insert path into ModernInputBar | Path inserts into input; classifier retains correct mode based on existing text |
| **T3-03** | R1 (Workflows) + R2 (ModernInputBar) | Select saved workflow template from sidebar | Populates ModernInputBar; parameter placeholders highlighted; classifier identifies command |
| **T3-04** | R2 (Classifier) + R3 (PTY Multiplexer) | Submit natural language prompt in generic shell pane | Seamlessly routes prompt to peer agent pane or spawns agent worktree pane without polluting shell PTY |
| **T3-05** | R1 (Search) + R3 (Worktree Engine) | Search workspace files while an isolated git worktree is active | Search results correctly scope to active workspace or worktree path |
| **T3-06** | R1 (Sidebar) + Tab Navigation | Open sidebar, switch to Tab 2, toggle sidebar, switch back to Tab 1 | Sidebar open state stays synchronized across all tab views |

---

### Tier 4: Real-World Scenarios (End-to-End Developer Workflows)

#### Scenario 1: End-to-End Workspace Exploration & Workflow Execution
1. Developer opens AetherTerminal with default workspace `/home/rasshqa/projects/Elliot`.
2. Developer presses `Cmd+\` (or `Ctrl+\` on Linux).
3. Aether Drive Sidebar expands smoothly on the left/right edge.
4. File tree renders workspace directory hierarchy.
5. Developer navigates into `crates/aetherd/src/pty_manager.rs` and clicks it.
6. File preview panel displays syntax-colored code.
7. Developer switches to Search tab inside sidebar, enters `test_pty_spawn`.
8. Search lists matching files and lines with preview snippets.
9. Developer switches to Workflows tab, selects `wf_cargo_check`.
10. The workflow executes `cargo check --workspace` in the active pane.
11. Developer closes window and relaunches: sidebar expanded state is preserved.

#### Scenario 2: Frictionless Natural Language Agent Assistance
1. Developer is working in a shell pane (`@bash`).
2. Developer types `git status` -> ModernInputBar indicates `$ CMD`, executes shell command.
3. Developer notices a test failure and types: `explain why pty_spawn_and_write needs sleep`.
4. ModernInputBar automatically transitions to `# AI` (purple sparkles icon) in real time without manual `#` typing.
5. Developer presses `Enter`.
6. Prompt is automatically routed to the background agent pipeline (`claude-code` or peer agent pane).
7. The shell terminal does not receive syntax error `explain: command not found`.
8. Agent streams explanation back to developer.
9. Developer types `cargo test --package aetherd --lib pty_manager` -> ModernInputBar immediately switches back to `$ CMD` mode and executes in shell.

#### Scenario 3: Resilient Multi-Session & Remote SSH Workflow
1. Developer connects to remote server: `ssh dev-server` in Pane 1.
2. In Pane 2, developer starts a long compile: `cargo build --release`.
3. Developer creates Tab 2 (`Ctrl+T`) to review notes in Obsidian sidebar.
4. While Tab 2 is active, Panes in Tab 1 unmount from React DOM tree.
5. `aetherd` continues streaming PTY output from both SSH and cargo build into internal 512KB ring buffers.
6. Developer switches back to Tab 1 (`Alt+1`).
7. `XtermWebGLPane` components mount, query `cmd_get_scrollback`, restore complete terminal history, and deduplicate queued bytes.
8. Terminal display shows exact current state of compile and active SSH prompt with 0 dropped bytes and 0 visual corruption.

---

## 8. Handoff Protocol

### 1. Observation
- Verified Cargo workspace configuration in `/home/rasshqa/projects/Elliot/Cargo.toml` with 4 member crates: `aether-protocol`, `aetherd`, `aether-mcp`, `aether-gui`.
- Executed `cargo test --workspace`: all 32 tests passed in 0.42s (5 in `aether-gui`, 1 in `aether-mcp`, 4 in `aether-protocol`, 15 in `aetherd` lib, 5 in `aetherd` main, 1 in `daemon_integration_test.rs`, 1 in `vault_workflows_test.rs`).
- Executed `npx tsc --noEmit && npm run build` in `/home/rasshqa/projects/Elliot/ui`: TypeScript typecheck completed with 0 errors; Vite bundle built in 9.55s producing `dist/index.html` (0.60 kB), `dist/assets/index-BQ8cmHtV.css` (50.75 kB), `dist/assets/index-CocetROC.js` (811.22 kB).
- Executed `graphify check-update .` and `graphify update .`: AST updated with 1185 nodes, 2625 edges, and 74 communities with exit code 0.
- Inspected `ModernInputBar.tsx:62`: currently hardcoded to `const mode: InputMode = value.startsWith('#') ? 'ai' : 'cmd';`, requiring manual `#` prefixing.
- Inspected `aetherStore.ts:181`: `localStorage` is used for `aether_default_shell`, `aether_theme`, and `aether_opacity`, but sidebar open state is not yet persisted.
- Inspected `crates/aether-gui/src/ipc_bridge.rs`: 21 Tauri commands exist, but no commands currently exist for workspace directory tree listing or workspace text search.

### 2. Logic Chain
1. *From* `ORIGINAL_REQUEST.md` requirement R1 *and* the observed missing file tree/search IPC commands in `ipc_bridge.rs`, *we deduce* that backend support (or Tauri FS integration) for directory expansion and text search must be connected to the UI sidebar drawer.
2. *From* `ModernInputBar.tsx` requiring manual `#` prefixing *and* requirement R2, *we deduce* that real-time heuristic classification is required to automatically switch modes and route prompts without shell syntax errors.
3. *From* `aetherd`'s 512KB PTY ring buffer implementation *and* `XtermWebGLPane.tsx` deduplication logic, *we deduce* that session resilience across tab unmounts is already architecturally supported in the daemon and needs end-to-end verification and remote SSH testing.
4. *From* the 100% green status of all 32 Cargo tests and UI build verification, *we deduce* that the baseline system is stable and clean for Phase 2 implementation.

### 3. Caveats
- No browser-based automated testing harness (e.g. Playwright / Vitest) is currently installed in `ui/package.json`. Testing UI components in automated CI currently requires node test scripts or adding a lightweight test runner like Vitest.
- Remote SSH resilience tests assume standard POSIX terminal behavior and may require mock PTY testing for simulated network disconnects.

### 4. Conclusion
- The project baseline is in exceptional health: all 32 Cargo unit and integration tests pass, TypeScript compiles with 0 errors, Vite bundles cleanly, and graphify knowledge graph is fully up to date.
- The 4-Tier verification matrix and deterministic classification rules formulated above provide the exact blueprint required to verify R1, R2, R3, and build pipelines without ambiguity.

### 5. Verification Method
To independently verify all findings:
1. Run Rust workspace check and tests:
   ```bash
   cd /home/rasshqa/projects/Elliot
   cargo check --workspace
   cargo test --workspace
   ```
   *Expected output*: `32 passed; 0 failed; 0 ignored`.
2. Run UI build verification:
   ```bash
   cd /home/rasshqa/projects/Elliot/ui
   npx tsc --noEmit && npm run build
   ```
   *Expected output*: Exit code 0, Vite output in `dist/`.
3. Run Knowledge Graph update:
   ```bash
   cd /home/rasshqa/projects/Elliot
   graphify update .
   ```
   *Expected output*: Clean exit code 0, graph.json / graph.html / GRAPH_REPORT.md updated.
