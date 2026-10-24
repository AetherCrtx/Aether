# DISPATCH — Worker M1: Backend APIs & Session Resilience (R3 + R1 Backend)

## Mission
Implement backend APIs for workspace directory navigation, workspace text search, file inspection, and remote/SSH session resilience in the Rust crates of AetherTerminal.

## Mandatory Inputs (Read first!)
- Original User Request: `/home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md`
- Project Architecture & Scope: `/home/rasshqa/projects/Elliot/PROJECT.md`
- Technical Specification & Blueprint: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_2/handoff.md`
- Your Working Directory: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1`
- Parent Conversation ID: `b4b0fa97-873a-4908-ab8b-7c3e9bde85fa`

## Write Ownership
You exclusively own and may modify:
- `crates/aether-gui/src/ipc_bridge.rs`
- `crates/aether-gui/src/main.rs`
- `crates/aetherd/src/pty_manager.rs`
- Any new test files in `crates/aether-gui/tests/` or `crates/aetherd/tests/`
Do NOT modify files in `ui/`.

## Tasks to Implement
1. **Implement Workspace Directory API in `crates/aether-gui/src/ipc_bridge.rs`**:
   - `cmd_read_workspace_directory(workspace_id: Option<String>, relative_path: Option<String>) -> Result<Vec<WorkspaceFileEntry>, String>`
   - Resolves target directory relative to current workspace root.
   - Reads entries, sorts directories first alphabetically, then files alphabetically.
   - Filters out `.git`, `target`, and `node_modules` by default or flags them properly.
   - Returns name, relative path, is_dir, is_symlink, size_bytes, extension.
2. **Implement Workspace Text Search API in `crates/aether-gui/src/ipc_bridge.rs`**:
   - `cmd_search_workspace_files(workspace_id: Option<String>, query: String, max_results: Option<usize>) -> Result<Vec<WorkspaceSearchMatch>, String>`
   - Performs fast text search across workspace files. If `rg` (ripgrep) is installed on host, can invoke `rg --json` or execute multi-threaded recursive search in Rust.
   - Skips binary files and hidden/build directories (`.git`, `target`, `node_modules`, `dist`).
   - Returns matching file_path, line_number, line_content, match_start, match_end.
3. **Implement Workspace File Inspection API in `crates/aether-gui/src/ipc_bridge.rs`**:
   - `cmd_read_workspace_file(workspace_id: Option<String>, relative_path: String, max_bytes: Option<usize>) -> Result<WorkspaceFileContent, String>`
   - Safely reads file content up to `max_bytes` (default 256KB).
   - Returns relative_path, content (valid UTF-8 string or lossy conversion), total_bytes, is_truncated.
4. **Register Commands in `crates/aether-gui/src/main.rs`**:
   - Add `cmd_read_workspace_directory`, `cmd_search_workspace_files`, `cmd_read_workspace_file` to Tauri's `generate_handler![]`.
5. **Remote / SSH Session Resilience in `crates/aetherd/src/pty_manager.rs`**:
   - When spawning SSH commands (`ssh ...`), automatically inject keepalive flags:
     `-o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o TCPKeepAlive=yes`
   - Ensure child PTY processes and ring buffers remain stable and uninterrupted.
6. **Unit Tests**:
   - Add unit tests validating `WorkspaceFileEntry`, `cmd_read_workspace_directory`, `cmd_search_workspace_files`, `cmd_read_workspace_file`, and SSH keepalive flag injection.

## Mandatory Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A teamwork_preview_auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

## Verification Requirements
You MUST run:
```bash
cargo check --workspace
cargo test --workspace
```
Ensure all existing 32 tests AND all new tests pass with 100% green exit code 0.

## Deliverable
Write your report to `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1/handoff.md`.
Report:
- Observation (what was changed and implemented)
- Logic Chain
- Verification commands executed and exact test output
- Caveats & Conclusion
Notify parent via `send_message` when done.

## 2026-10-24T03:04:38Z
Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1/DISPATCH.md, /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md, and /home/rasshqa/projects/Elliot/PROJECT.md.
Implement Milestone 1: Backend APIs (cmd_read_workspace_directory, cmd_search_workspace_files, cmd_read_workspace_file) in crates/aether-gui and remote SSH resilience keepalive in crates/aetherd/src/pty_manager.rs.
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
Verify your changes with `cargo check --workspace` and `cargo test --workspace` ensuring all 32+ tests pass.
Write your handoff report to /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1/handoff.md and send a message when done.

