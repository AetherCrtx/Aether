# DISPATCH — Worker M1 (Remediation Iteration 2)

## Mission
Remediate the exact defects identified by Reviewer 2, Challenger 1, and Challenger 2 in Milestone 1:
1. **Ripgrep Pattern Flag Injection (`crates/aether-gui/src/ipc_bridge.rs`)**:
   - In `search_workspace_files_with_rg`, pass `.arg("-e").arg(query)` instead of `.arg(query)` so queries starting with hyphens (e.g. `-v`, `-e`, `--help`) are parsed as patterns, not CLI flags.
   - If `child.wait()` yields a non-zero exit status and matches are empty, return `Err` to trigger the Rust walker fallback.
2. **Unicode Case-Folding Byte Offset Drift (`crates/aether-gui/src/ipc_bridge.rs`)**:
   - In `search_workspace_files_rust`, ensure case-insensitive matching correctly maps `match_start` and `match_end` to byte offsets within original `line` (preventing offset drift when case folding alters character byte lengths like Kelvin sign or Turkish dotted I).
3. **PTY Session Retention on Process Exit (`crates/aetherd/src/pty_manager.rs:490-492`)**:
   - When child process exits in `pty-wait`, do NOT immediately remove the session from `self.sessions`. Retain the session and its ring buffer so `get_scrollback` succeeds across UI unmount/remount cycles.
4. **Mock SSH Test Concurrency (`crates/aetherd/tests/pty_challenge_test.rs`)**:
   - Ensure temporary mock script and log paths use unique identifiers (`Uuid::new_v4()`) so tests pass concurrently with standard multi-threaded test runners.

## Mandatory Inputs (Read first!)
- Original User Request: `/home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md`
- Project Architecture & Scope: `/home/rasshqa/projects/Elliot/PROJECT.md`
- Reviewer 2 Handoff: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_reviewer_m1_2/handoff.md`
- Challenger 1 Handoff: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_challenger_m1_1/handoff.md`
- Your Working Directory: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1_fix`
- Parent Conversation ID: `b4b0fa97-873a-4908-ab8b-7c3e9bde85fa`

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
Ensure 100% of tests pass across all crates without any failures.

## Deliverable
Write your report to `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1_fix/handoff.md` and notify parent via `send_message`.

## 2026-10-24T03:25:32Z
Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1_fix/DISPATCH.md and /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md.
Remediate the 4 issues in Milestone 1:
1. Ripgrep flag injection on hyphen queries (use .arg("-e").arg(query)).
2. Unicode case-folding byte offset mapping in pure Rust search walker.
3. Retain PTY session and ring buffer on child exit in crates/aetherd/src/pty_manager.rs so get_scrollback succeeds across UI unmount/remount.
4. Use Uuid temp files in crates/aetherd/tests/pty_challenge_test.rs to prevent concurrent test collision.
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work.
Verify with cargo check --workspace and cargo test --workspace (ensure 100% tests pass).
Write your handoff report to /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1_fix/handoff.md and send a message when done.
