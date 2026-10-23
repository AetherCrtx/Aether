# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-10-23

### Added
- **Chrome-Style Multitab Header**:
  - Integrated dynamic tabs directly inside the application top bar with a dedicated `+` button.
  - Double-click inline tab renaming.
  - Split pane count badges per tab and tab close buttons.
  - Tab navigation shortcuts: `Ctrl+T` (new tab), `Ctrl+Tab` / `Ctrl+Shift+Tab` (tab cycling), `Alt+1..9` (direct jump), `Ctrl+Shift+W` (close tab).
- **Background Terminal System & Process Detach**:
  - Background Tasks Drawer (`Alt+Shift+B` or header button).
  - Ability to detach any active terminal into background execution (`Alt+B`).
  - Asynchronous command launcher with live elapsed time, PID, and TCP port radar inspection.
  - One-click attach to split or open as a fresh dedicated tab.
- **Process Safety Check on Close**:
  - Foreground process inspection via `/proc/{pid}/task/{pid}/children`.
  - `Ctrl+W` / `Alt+W` safety modal warning when active compilers, dev servers, or agent CLIs are running inside the pane.
- **Full Keyboard Navigation & Window Resizing**:
  - Vim directional pane navigation (`Alt+H/J/K/L`) and arrow keys.
  - Keyboard split resizing (`Alt+Shift+H/J/K/L`).
  - Interactive mouse drag split resizing with cyan grip indicator and double-click 50/50 reset.
  - Proportional leaf-weighted balancing algorithm (`Alt+E`).
- **PTY Performance & Zero-Latency Keystrokes**:
  - Decoupled PTY input writer loop using `UnixStream::into_split()`.
  - Keystroke micro-batching (<0.1ms latency) and high-throughput dynamic batching (up to 32KB).
  - Enabled `@xterm/addon-webgl` hardware acceleration with WebGL context recovery.
- **Multi-CLI Agentic Coding Orchestration**:
  - Embedded SQLite "One Brain" with WAL mode and FTS5 full-text search.
  - Git worktree isolation with shared dependency symlinks (`node_modules`, `target`, `.venv`).
  - Diff Gatekeeper modal with 3-way merge conflict detection (`Alt+M`).
  - Zero-commit time travel snapshots slider (`Alt+Z`).
  - Bi-directional Obsidian Vault & Sprint Runner synchronization (`Ctrl+B`).
  - Built-in Model Context Protocol (`aether-mcp`) stdio server.
