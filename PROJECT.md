# Project: AetherTerminal Phase 2 Roadmap

## Architecture
AetherTerminal follows a dual-tier desktop architecture:
1. **Backend Daemon (`aetherd`) & GUI IPC Bridge (`aether-gui`)**:
   - `aetherd`: Unix domain socket server (`/run/user/<uid>/aether.sock`), SQLite (`brain_db.rs`), PTY session manager (`portable_pty`), 512KB VecDeque ring buffer, monotonic byte offset tracking (`AtomicU64`), git worktree engine, and snapshot manager.
   - `aether-gui`: Tauri v2 application bridging UI frontend to `aetherd` over Unix domain socket with batched keystrokes and 60 FPS / 32KB output frame batching.
   - Local filesystem commands in `aether-gui`: workspace directory listing, workspace text search (ripgrep / file walk), and file inspection.
2. **Frontend UI (`ui/`)**:
   - React 18 + TypeScript + Vite + TailwindCSS.
   - Canvas-accelerated terminal rendering via `@xterm/xterm` WebGL2 addon (`XtermWebGLPane.tsx`).
   - Global reactive store (`aetherStore.ts`) managing layout trees, tabs, background tasks, and preferences.
   - Aether Drive Sidebar drawer (`AetherDriveSidebar.tsx`) on the left dock of `<main>` with 3 panels: Workspace File Tree, Text Search, and Saved Workflows.
   - `ModernInputBar.tsx` equipped with synchronous heuristic classifier (`commandClassifier.ts`) and seamless agent routing.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Backend Workspace Directory API | `cmd_read_workspace_directory` in `aether-gui` reading files/folders with metadata | M1 | Survey 2 |
| F2 | Backend Workspace Text Search API | `cmd_search_workspace_files` in `aether-gui` returning matches, line numbers, and snippets | M1 | Survey 2 |
| F3 | Backend File Inspection API | `cmd_read_workspace_file` in `aether-gui` reading file contents up to size limit | M1 | Survey 2 |
| F4 | Remote/SSH Session Resilience | Keepalive flags, disconnect detection, and recoverable state banner | M1 | Survey 2 |
| F5 | Terminal PTY Buffer & Background Resilience | Verification of ring buffer deduplication across unmount/remount & background tasks | M1 | Survey 2 |
| F6 | Intelligent Command Classifier Engine | Deterministic heuristic classifier distinguishing shell vs natural language in real-time | M2 | Survey 1 & 3 |
| F7 | Real-time ModernInputBar Feedback | Visual badge, dynamic mode styling, tooltip, and manual toggle/pin | M2 | Survey 1 |
| F8 | Seamless Agent Routing Pipeline | Route natural language to agent CLI without `#` prefixing or shell syntax errors | M2 | Survey 1 |
| F9 | Aether Drive Sidebar Component | Collapsible sidebar drawer docking next to TerminalGrid with 3 sub-panels | M3 | Survey 1 |
| F10 | Responsive Workspace File Tree | Tree navigation, directory expand/collapse, file inspection card with actions | M3 | Survey 1 |
| F11 | Workspace Text Search Panel | Interactive search input, filter options, result list with snippet preview | M3 | Survey 1 |
| F12 | Saved Workflows Quick Access | Listing `.md` workflows, parameter inputs, one-click execution in active pane | M3 | Survey 1 |
| F13 | Keyboard Shortcut & State Persistence | `Cmd+\` / `Ctrl+\` shortcut, top header toggle button, `localStorage` persistence | M3 | Survey 1 |
| F14 | 4-Tier E2E Verification & Test Suite | Comprehensive unit/integration tests across all tiers | M4 | Survey 3 |
| F15 | Production Build & Graphify Verification | `ui` build, `cargo check/test`, `graphify update .` cleanly executed | M4 | ORIGINAL_REQUEST |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend APIs & Session Resilience (R3 + R1 Backend) | Implement `cmd_read_workspace_directory`, `cmd_search_workspace_files`, `cmd_read_workspace_file` in `aether-gui`; enhance remote SSH session resilience flags and recovery; verify PTY streaming buffers & background task retention | None | DONE |
| M2 | Intelligent Natural Language vs Shell Classifier (R2) | Implement `commandClassifier.ts`, integrate real-time classification and badge into `ModernInputBar.tsx`, implement `routePromptToAgent` without `#` prefix | None | DONE |
| M3 | Aether Drive Sidebar Drawer & State Persistence (R1) | Implement `AetherDriveSidebar.tsx` (File Tree, Search, Workflows), wire `Cmd+\` / `Ctrl+\` shortcut, header toggle button, layout docking in `main.tsx`, and `localStorage` persistence | M1, M2 | DONE |
| M4 | E2E Testing Suite & Final Verification | Implement 4-tier E2E tests, run full verification (`tsc`, `npm run build`, `cargo check`, `cargo test`, `graphify update .`) | M1, M2, M3 | IN_PROGRESS |

---

## Interface Contracts

### 1. `aether-gui` ↔ Frontend IPC Commands
```rust
// In crates/aether-gui/src/ipc_bridge.rs & main.rs:

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkspaceFileEntry {
    pub name: String,
    pub path: String,          // Relative path from workspace root
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size_bytes: u64,
    pub extension: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkspaceSearchMatch {
    pub file_path: String,
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkspaceFileContent {
    pub relative_path: String,
    pub content: String,
    pub total_bytes: u64,
    pub is_truncated: bool,
}

// Commands:
// cmd_read_workspace_directory(workspace_id: Option<String>, relative_path: Option<String>) -> Result<Vec<WorkspaceFileEntry>, String>
// cmd_search_workspace_files(workspace_id: Option<String>, query: String, max_results: Option<usize>) -> Result<Vec<WorkspaceSearchMatch>, String>
// cmd_read_workspace_file(workspace_id: Option<String>, relative_path: String, max_bytes: Option<usize>) -> Result<WorkspaceFileContent, String>
```

### 2. Frontend Classifier Contract (`ui/src/utils/commandClassifier.ts`)
```typescript
export type CommandClassification = 'shell' | 'natural_language';

export interface ClassificationResult {
  type: CommandClassification;
  confidence: number; // 0.0 - 1.0
  reason: string;
  suggestedMode: 'cmd' | 'ai';
}

export function classifyCommand(input: string, detectedToolNames?: string[]): ClassificationResult;
```

### 3. Agent Routing Contract (`ui/src/stores/aetherStore.ts`)
```typescript
export async function routePromptToAgent(
  instruction: string,
  sourcePaneId?: string,
  targetCli?: string
): Promise<AgentPane | null>;
```

---

## Code Layout
- `crates/aether-gui/src/`:
  - `ipc_bridge.rs`: Workspace directory, search, and file read commands; event streaming.
  - `main.rs`: Command registration.
  - `tool_detector.rs`: Shell and tool detection.
- `crates/aetherd/src/`:
  - `pty_manager.rs`: PTY lifecycle, ring buffers, SSH keepalive.
  - `brain_db.rs`: SQLite persistence.
- `ui/src/`:
  - `components/`:
    - `AetherDriveSidebar.tsx`: The main sidebar container with 3 tabs.
    - `ModernInputBar.tsx`: Input bar with dynamic classification badge.
    - `XtermWebGLPane.tsx`: PTY rendering and deduplication.
    - `main.tsx`: App shell, header, sidebar docking.
  - `utils/`:
    - `commandClassifier.ts`: Intelligent classifier heuristics.
  - `stores/`:
    - `aetherStore.ts`: Global state, shortcuts, IPC invocation, persistence.
