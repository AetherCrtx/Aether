# HANDOFF REPORT — Explorer 2: Rust Backend, PTY, Session Management & Remote Resilience

## Summary
The AetherTerminal backend is split into a standalone background daemon (`aetherd`), a Tauri v2 IPC bridge (`aether-gui`), and a React WebGL2 frontend (`ui/`). PTY streams and session states reside in `aetherd` and survive UI component unmounting, tab switching, and window closing. Stream deduplication uses monotonic byte offsets (`total_bytes: AtomicU64`) to prevent double rendering on remount. Background tasks remain running in `aetherd` when detached from the visible UI layout. However, remote SSH sessions currently run as unmanaged subprocesses that terminate on network drop, and backend APIs for workspace file trees, workspace text search, and file inspection required by R1 are completely absent and must be implemented.

---

## 1. Observation

### 1.1 Backend Daemon & Socket Architecture
- **Daemon Binary & Socket**: `crates/aetherd/src/main.rs:81-83, 151-163` binds a Unix Domain Socket at `/run/user/<uid>/aether.sock` (fallback: `$XDG_RUNTIME_DIR/aether.sock` or `$AETHER_SOCK`) with permissions set to `0600` (`libc::set_mode(0o600)`).
- **Socket Security**: `crates/aetherd/src/main.rs:217-227` verifies incoming peer credentials via `stream.peer_cred()`, rejecting connections whose UID does not match `libc::getuid()`.
- **Database Schema**: `crates/aetherd/src/brain_db.rs:97-190` initializes SQLite with WAL mode (`journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`) containing 6 core tables:
  1. `workspaces` (id, name, root_repo_path, obsidian_vault_path, timestamps)
  2. `agent_instances` (id, workspace_id, cli_type, pty_pid, worktree_path, git_branch, status, estimated_tokens)
  3. `shared_blackboard` (id, workspace_id, author_agent_id, entry_type, title, content_markdown, target_agent_id, is_resolved)
  4. `file_locks` (workspace_id, relative_file_path, locked_by_agent_id, intent)
  5. `obsidian_notes` and virtual table `obsidian_fts` (FTS5 search with insert/update/delete triggers)
  6. `git_snapshots` (id, agent_id, git_tree_oid, summary, files_changed_count)
- **Daemon Startup Cleanup**: `crates/aetherd/src/main.rs:107` executes `db.clear_all_agent_instances()`, clearing stale agent records from previous daemon executions while preserving persistent workspace and notes tables.

### 1.2 PTY Management, Buffer Retention & Stream Deduplication
- **PTY System**: `crates/aetherd/src/pty_manager.rs:262-272` initializes `portable_pty::native_pty_system().openpty(...)` with dimensions defaulting to minimum 1x1.
- **PTY Session State**: `crates/aetherd/src/pty_manager.rs:151-160` defines `PaneSession`:
  ```rust
  pub struct PaneSession {
      pub pane_id: String,
      pub pid: Option<u32>,
      master: Arc<std::sync::Mutex<Box<dyn MasterPty + Send>>>,
      writer: Arc<std::sync::Mutex<Box<dyn Write + Send>>>,
      ring_buffer: Arc<std::sync::Mutex<VecDeque<u8>>>,
      line_buffer: Arc<std::sync::Mutex<String>>,
      active: Arc<AtomicBool>,
      total_bytes: Arc<std::sync::atomic::AtomicU64>,
  }
  ```
- **In-Memory Ring Buffer**: `crates/aetherd/src/pty_manager.rs:34` configures `DEFAULT_RING_BUFFER_CAPACITY = 512 * 1024` (512 KB per pane). In `pty_manager.rs:401-410`, the reader thread drains older bytes from index `0..to_drain` when incoming bytes exceed capacity.
- **Monotonic Offset Tracking**:
  - `crates/aetherd/src/pty_manager.rs:398`: `let offset = reader_total_bytes.fetch_add(n as u64, Ordering::SeqCst);`
  - Broadcast event: `IpcEvent::PtyOutput { pane_id, data: bytes.to_vec(), offset }` (`pty_manager.rs:413-418`).
- **Scrollback Retrieval**: `crates/aetherd/src/pty_manager.rs:218-228` returns `(Vec<u8>, u64)` where the second element is `self.total_bytes.load(Ordering::SeqCst)`.
- **UI Stream Deduplication on Remount**:
  - `ui/src/components/XtermWebGLPane.tsx:220-284`:
    - `getPaneScrollback(paneId)` writes scrollback data into Xterm and assigns `lastWrittenOffset = res.endOffset`.
    - Live chunks arriving during mount are queued in `preRestoreQueue`.
    - When `scrollbackRestored` is true, chunks with `offset + data.length <= lastWrittenOffset` are discarded. If `offset < lastWrittenOffset`, only the slice `data.subarray(lastWrittenOffset - offset)` is written.
- **Process Hierarchy Cleanup**: `crates/aetherd/src/pty_manager.rs:524-543` collects descendant PIDs via `/proc/<pid>/task/<pid>/children`, sorts by `proc_depth` (deepest children first), signals the process group `libc::kill(-(pid as i32), sig)`, and signals each descendant PID to eliminate orphaned processes.
- **Port Radar**: `crates/aetherd/src/pty_manager.rs:629-720` scans `/proc/<pid>/net/tcp` and `/proc/<pid>/net/tcp6` for state `0A` (TCP_LISTEN) matching socket inodes from `/proc/<pid>/fd/*`.

### 1.3 GUI IPC Bridge & Event Streaming
- **GUI Bridge**: `crates/aether-gui/src/ipc_bridge.rs:24-86` maintains a dedicated `mpsc` queue (`input_tx`) for batching keystrokes to `aetherd` over a persistent `OwnedWriteHalf` Unix socket.
- **Backpressure & Frame Rate Batching**: `crates/aether-gui/src/ipc_bridge.rs:187-305` (`process_event_stream`) batches PTY output up to `chunk_threshold = 32 * 1024` (32 KB) or flushes on a `flush_interval_ms = 16` (~60 FPS) timer, emitting `aether:event` into Tauri. If `PaneExited` is received, pending buffered bytes for that pane are flushed immediately prior to emitting the exit event.
- **Auto-Daemon Spawn**: `crates/aether-gui/src/ipc_bridge.rs:669-698` checks for an existing socket, and if disconnected, searches `current_exe().parent()`, `~/.local/bin/aetherd`, `/usr/local/bin/aetherd`, and `/usr/bin/aetherd` to spawn `aetherd` automatically.

### 1.4 Background Tasks & Session Multiplexing
- **Background Tasks UI Store**: `ui/src/stores/aetherStore.ts:874-885` registers background tasks in both `globalState.panes` and `globalState.backgroundTasks`.
- **Detaching to Background**: `ui/src/stores/aetherStore.ts:894-938` (`sendPaneToBackground`):
  - Traverses binary layout tree and removes the pane (`removeFromTree(globalState.layout)`).
  - Pushes pane metadata to `globalState.backgroundTasks`.
  - Does NOT call `cmd_kill_pane`; the process in `aetherd` continues executing uninterrupted.
  - Streaming output continues accumulating in `aetherd`'s ring buffer and firing `PtyOutput` events.
- **Foreground Restoration**: `ui/src/stores/aetherStore.ts:940-976` (`bringBackgroundToForeground`):
  - Splices task out of `globalState.backgroundTasks`.
  - Re-inserts into `globalState.layout` as a vertical split or a new tab.
  - `<XtermWebGLPane>` mounts, invokes `cmd_get_scrollback`, and replays complete scrollback history.
- **Multiplexer State Persistence Across Window Restarts**:
  - `ui/src/stores/aetherStore.ts:1493-1564` (`restoreActivePanes`):
    - Invokes `cmd_list_panes`.
    - `crates/aetherd/src/main.rs:532-560` queries `ctx.db.list_agent_instances()`, checks `ctx.pty_manager.is_pane_active(&a.id)`, and returns running panes.
    - `restoreActivePanes()` reconstructs layout tree and tabs automatically.

### 1.5 Remote / SSH Sessions
- **Current SSH Footprint**: Zero dedicated SSH crates or protocol handlers in `crates/` (confirmed via `crates/Cargo.toml` and recursive grep).
- **Behavior of `ssh` command**: When a user runs `ssh user@host`, it executes as an ordinary child process inside `PtyManager`.
- **Disconnect Vulnerability**: If the remote connection drops or network partitions, the child `ssh` process receives EOF or SIGHUP, exits with status 255, and triggers `IpcEvent::PaneExited`. The pane transitions to `IDLE` or `ERROR`, terminating the session and requiring manual reconnect from scratch.

### 1.6 Backend APIs for Workspace File Tree and Search (R1 Audit)
- **Workflows API**:
  - `IpcRequestPayload::ListWorkflows { workspace_id }` (`crates/aether-protocol/src/ipc.rs:128`) returns `WorkflowList(Vec<WorkflowDefinition>)` parsed from `.aether/vault/Workflows/*.md`.
  - `crates/aether-gui/src/ipc_bridge.rs:611-620` exposes `cmd_list_workflows`.
- **Workspace File Tree API**: **MISSING**. No IPC request in `aether-protocol` or Tauri command in `aether-gui` exists to list workspace directories or files.
- **Workspace File Text Search API**: **MISSING**. `ObsidianSearch` (`crates/aether-protocol/src/ipc.rs:127`) searches SQLite FTS5 table `obsidian_fts`, which only indexes markdown files within `.aether/vault/`. No command searches general workspace code files (`*.rs`, `*.ts`, `*.json`, etc.).
- **Workspace File Inspection API**: **MISSING**. `ObsidianReadNote` only reads notes from the vault. No general file read command exists in `aether-gui` or `aetherd`.
- **Tauri Plugin Audit**: `crates/aether-gui/tauri.conf.json` does not configure `@tauri-apps/plugin-fs`. All filesystem access must be exposed through Tauri commands.

---

## 2. Logic Chain

```
[Observation 1.1, 1.2]: PTY child processes and 512 KB VecDeque ring buffers live inside aetherd daemon
       │
       ▼
[Deduction 1]: React component unmounting (tab switch, window resize, navigation) disposes only the local Xterm instance; the daemon PTY and running process remain completely untouched.
       │
       ▼
[Observation 1.2]: On remount, XtermWebGLPane invokes cmd_get_scrollback(paneId) returning (data, end_offset), and drops incoming live chunks whose offset <= lastWrittenOffset.
       │
       ▼
[Deduction 2]: Scrollback restoration across unmount/remount cycles is guaranteed to be gap-free and duplicate-free (R3 functional).
       │
       ▼
[Observation 1.4]: sendPaneToBackground removes node from layout tree without sending KillPane to daemon.
       │
       ▼
[Deduction 3]: Background tasks continue executing in aetherd during window navigation and tab switching without disconnection (R3 functional).
       │
       ▼
[Observation 1.5]: ssh runs as an unmanaged local child process. When remote connection drops, ssh exits (code 255) and PaneExited reaps the session.
       │
       ▼
[Deduction 4]: Remote/SSH resilience (R3) requires session persistence mechanics: auto-wrapping remote sessions in tmux/zellij, detecting SSH disconnection, preserving scrollback, and providing 1-click reconnect without state loss.
       │
       ▼
[Observation 1.6]: No IPC requests or Tauri commands exist for directory listings, general file search, or file inspection outside the vault.
       │
       ▼
[Deduction 5]: R1 (Aether Drive Sidebar) cannot be implemented purely in frontend; backend APIs for workspace directory tree, workspace text search (ripgrep), and file inspection must be added to aether-gui / aetherd.
```

---

## 3. Caveats

1. **Daemon Restart Boundary**: If `aetherd` itself is restarted (`bin/aether restart` or SIGTERM), `db.clear_all_agent_instances()` clears active panes, and running PTYs are terminated. Process persistence across daemon restarts would require a freeze/thaw mechanism (e.g. CRIU) or persistent session multiplexers (tmux/zellij).
2. **Ring Buffer Upper Bound**: The scrollback buffer in `pty_manager.rs:34` is capped at 512 KB. For extremely verbose processes outputting megabytes of text, scrollback restoration will contain the last 512 KB of output.
3. **Remote SSH Scope**: While AetherTerminal is designed for Linux desktop (Tauri v2 on Wayland/X11), SSH session resilience can be addressed through client-side connection supervision (auto-reconnect, tmux session reuse, and keepalive flags) rather than rewriting a full custom SSH protocol stack.

---

## 4. Conclusion & Concrete Recommendations

### 4.1 R3: Terminal Pane States, Streaming Buffers & Background Tasks
- **Current Health**: EXCELLENT. The daemon-centric architecture already ensures that panes, PTYs, and background tasks survive:
  1. Component unmounting and remounting.
  2. Tab switching and pane navigation.
  3. Window closing and reopening (via `cmd_list_panes` and `restoreActivePanes`).
- **Stream Deduplication**: The monotonic byte-offset stream deduplication in `XtermWebGLPane.tsx` and `pty_manager.rs` is fully operational and verified.

### 4.2 R3: Remote / SSH Session Resilience Architecture
To fulfill R3 remote resilience requirements without bloated dependencies:
1. **Intelligent SSH Invocation Wrapper**:
   - In `pty_manager.rs` or frontend dispatch, when spawning an SSH command (`ssh user@host`), automatically inject resilience flags:
     `-o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o TCPKeepAlive=yes`
   - For interactive sessions, support remote multiplexer auto-attach:
     `ssh -t user@host "tmux new-session -A -s aether || $SHELL"`
2. **Connection Drop Detection & Recovery UI**:
   - In `aetherStore.ts` inside `subscribeAetherEvents` for `PaneExited`:
     - If `pane.cliType === 'ssh'` or `cmd_check_pane_process` returns `ssh`, and `exitCode !== 0` (e.g., exit code 255 for network drop):
     - Keep the pane in an `INTERRUPTED` state instead of closing or resetting.
     - Display an inline recovery banner: `[SSH Connection Lost] -> [Reconnect Session] [Keep Scrollback]`.
     - Clicking `[Reconnect Session]` re-spawns the SSH command in the same pane and seamlessly appends new output.

### 4.3 R1: Backend APIs Needed for Aether Drive Sidebar
Implement the following 3 commands in `crates/aether-gui/src/ipc_bridge.rs` (and register in `main.rs`):

#### 1. Directory Tree API (`cmd_read_workspace_directory`)
```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkspaceFileEntry {
    pub name: String,
    pub path: String,          // Relative to workspace root
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size_bytes: u64,
    pub extension: Option<String>,
}

#[tauri::command]
pub async fn cmd_read_workspace_directory(
    workspace_id: Option<String>,
    relative_path: Option<String>,
) -> Result<Vec<WorkspaceFileEntry>, String>
```
- **Rationale**: Reads directory entries on demand (lazy loading). Respects hidden directories and `.git` filtering to ensure sub-millisecond responsiveness on large repositories.

#### 2. Workspace Text Search API (`cmd_search_workspace_files`)
```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkspaceSearchMatch {
    pub file_path: String,
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[tauri::command]
pub async fn cmd_search_workspace_files(
    workspace_id: Option<String>,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<WorkspaceSearchMatch>, String>
```
- **Rationale**: Spawns system `rg --json` (ripgrep) if available in PATH (with automatic fallback to a multi-threaded Rust file walker) to match user queries across project source files, returning preview snippets and line numbers.

#### 3. File Content Inspection API (`cmd_read_workspace_file`)
```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkspaceFileContent {
    pub relative_path: String,
    pub content: String,
    pub total_bytes: u64,
    pub is_truncated: bool,
}

#[tauri::command]
pub async fn cmd_read_workspace_file(
    workspace_id: Option<String>,
    relative_path: String,
    max_bytes: Option<usize>,
) -> Result<WorkspaceFileContent, String>
```
- **Rationale**: Reads the selected file up to `max_bytes` (default 256 KB) for instant inspection inside the Aether Drive Drawer without locking the UI thread.

---

## 5. Verification Method

To verify current state and any subsequent implementations:

1. **Workspace Compilation & Test Suite**:
   ```bash
   cargo check --workspace
   cargo test --workspace
   ```
   *Expected Result*: All 32 unit and integration tests across `aether-gui`, `aether-mcp`, `aether-protocol`, and `aetherd` pass with 0 failures.

2. **Frontend TypeScript & Vite Bundle**:
   ```bash
   cd /home/rasshqa/projects/Elliot/ui
   npx tsc --noEmit && npm run build
   ```
   *Expected Result*: 0 errors, build succeeds in <10s producing production bundle in `ui/dist/`.

3. **Daemon Socket Verification**:
   ```bash
   bin/aether status
   ls -la /run/user/$(id -u)/aether.sock
   ```
   *Expected Result*: Socket permissions are `srw-------` (0600), owned by current user.

4. **Scrollback & Background Task Verification**:
   - Spawn a long-running command in a pane: `bin/aether spawn -c "htop"`.
   - Send pane to background: verify in `BackgroundTasksDrawer` that PID and ports are tracked.
   - Switch tabs and bring task back to foreground: verify scrollback is restored without duplicate text.

5. **Knowledge Graph Update**:
   ```bash
   graphify update .
   ```
   *Expected Result*: AST analysis updates graph without errors.
