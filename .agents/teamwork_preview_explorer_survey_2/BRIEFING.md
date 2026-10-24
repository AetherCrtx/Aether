# BRIEFING — 2026-10-24T02:55:00Z

## Mission
Survey the Rust backend, PTY handling, session management, multiplexing, and remote resilience in AetherTerminal to map R3 resilience and R1 backend file tree/search APIs.

## 🔒 My Identity
- Archetype: explorer
- Roles: Rust backend analysis, PTY & session management survey, remote resilience investigation
- Working directory: /home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_2
- Original parent: b4b0fa97-873a-4908-ab8b-7c3e9bde85fa
- Milestone: Phase 2 survey & design

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Produce a structured handoff report following the 5-component protocol
- Document exact file paths, line numbers, and evidence chains

## Current Parent
- Conversation ID: b4b0fa97-873a-4908-ab8b-7c3e9bde85fa
- Updated: 2026-10-24T03:01:00Z

## Investigation State
- **Explored paths**: `crates/aether-protocol` (`ipc.rs`, `agent.rs`, `mcp.rs`), `crates/aetherd` (`main.rs`, `pty_manager.rs`, `lib.rs`, `brain_db.rs`, `worktree_engine.rs`, `snapshot_engine.rs`, `obsidian_sync.rs`), `crates/aether-gui` (`main.rs`, `ipc_bridge.rs`, `tool_detector.rs`, `tauri.conf.json`), `ui/src` (`stores/aetherStore.ts`, `components/XtermWebGLPane.tsx`, `components/TerminalGrid.tsx`, `components/ModernInputBar.tsx`, `components/ObsidianSidebar.tsx`, `components/WorkflowsModal.tsx`, `main.tsx`).
- **Key findings**:
  1. Rust backend is a split architecture: standalone background daemon (`aetherd`) connected over Unix domain socket (`/run/user/<uid>/aether.sock`) with Tauri GUI bridge (`aether-gui`) and React frontend (`ui/`).
  2. PTY sessions, child processes, and 512 KB in-memory ring buffers are owned by `aetherd` and survive UI component unmounting, tab switching, and window closing.
  3. PTY stream deduplication uses monotonic byte offsets (`total_bytes: AtomicU64` in `PaneSession`) paired with `lastWrittenOffset` in `XtermWebGLPane.tsx` to prevent replay duplications on remount.
  4. Background tasks are completely decoupled from UI layout nodes; sending a pane to the background removes it from the layout tree but leaves the daemon PTY intact.
  5. There is currently NO dedicated SSH module or remote daemon protocol in the codebase; SSH is run as a regular CLI command inside a local PTY. Connection drops kill the local `ssh` process (exit code 255).
  6. Backend APIs for R1: Workflows (`ListWorkflows`) exist, but Workspace File Tree, Workspace Text Search, and Workspace File Inspection APIs are completely missing in `aether-protocol` and `aether-gui`.
- **Unexplored areas**: None within the requested scope. All 22 Rust files and relevant UI components surveyed.

## Key Decisions Made
- Fully documented R3 resilience patterns (PTY offsets, buffer retention, remote SSH recovery strategies).
- Designed exact IPC and Tauri command specifications for R1 Workspace Drive Sidebar (file tree, search, inspect).

## Artifact Index
- DISPATCH.md — task instructions
- BRIEFING.md — situational awareness
- progress.md — liveness heartbeat
- handoff.md — deliverable report
