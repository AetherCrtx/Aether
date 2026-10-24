# HANDOFF REPORT — Independent Reviewer 2: Backend APIs & Session Resilience (Milestone 1)

## VERDICT: REQUEST_CHANGES

---

## 1. Observation

Direct, verbatim execution outputs and codebase inspections:

### 1.1 Test Suite Failures (`cargo test --workspace`)
When running `cargo test --workspace`:
```text
running 29 tests
...
test ipc_bridge::tests::test_search_workspace_files_rust_unicode_byte_offsets ... FAILED
test ipc_bridge::tests::test_search_workspace_files_dash_queries ... FAILED

failures:

---- ipc_bridge::tests::test_search_workspace_files_rust_unicode_byte_offsets stdout ----
thread 'ipc_bridge::tests::test_search_workspace_files_rust_unicode_byte_offsets' (216334) panicked at crates/aether-gui/src/ipc_bridge.rs:2049:9:
assertion `left == right` failed: Slice must match target_match exactly
  left: "x target_mat"
 right: "target_match"

---- ipc_bridge::tests::test_search_workspace_files_dash_queries stdout ----
thread 'ipc_bridge::tests::test_search_workspace_files_dash_queries' (216316) panicked at crates/aether-gui/src/ipc_bridge.rs:2007:9:
assertion `left == right` failed: Searching for '-v' should find the line containing '-v'
  left: 0
 right: 1

failures:
    ipc_bridge::tests::test_search_workspace_files_dash_queries
    ipc_bridge::tests::test_search_workspace_files_rust_unicode_byte_offsets

test result: FAILED. 27 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.26s
```

And in `crates/aetherd/tests/pty_challenge_test.rs`:
```text
---- test_spawn_pane_with_mock_ssh_quoted_command stdout ----
thread 'test_spawn_pane_with_mock_ssh_quoted_command' panicked at crates/aetherd/tests/pty_challenge_test.rs:467:5:
Quoted argument must be preserved as a single token
```
*(Caused by concurrency collision on shared static mock log path `/tmp/aether_challenge_mock_ssh/args.log` during parallel test runs).*

### 1.2 Code Inspection Observations

1. **Ripgrep Flag Injection (`crates/aether-gui/src/ipc_bridge.rs:951-965`)**:
   ```rust
   let mut child = std::process::Command::new("rg")
       .arg("--json")
       .arg("--smart-case")
       .arg("-F")
       .arg("-g").arg("!.git")
       .arg("-g").arg("!target")
       .arg("-g").arg("!node_modules")
       .arg("-g").arg("!dist")
       .arg("-g").arg("!.aether")
       .arg(query)
       .arg(&canonical_root)
       ...
   ```
   `query` is passed as a bare positional argument without `--` or `-e`. When `query` begins with a dash (`"-v"`, `"-e"`, `"--help"`), `rg` parses it as a CLI flag.
   Additionally, `search_workspace_files_with_rg` ignores `child.wait()` exit status: when `rg` terminates with non-zero exit status (e.g. exit code 2), `search_workspace_files_with_rg` returns `Ok(vec![])` instead of `Err`, preventing fallback to pure Rust search in `search_workspace_files_impl`.

2. **Unicode Case-Folding Byte Offset Drift (`crates/aether-gui/src/ipc_bridge.rs:1123-1139`)**:
   ```rust
   let line_lower = line.to_lowercase();
   let mut start_idx = 0;
   while let Some(pos) = line_lower[start_idx..].find(&query_lower) {
       let match_start = start_idx + pos;
       let match_end = match_start + query.len();
       matches.push(WorkspaceSearchMatch {
           file_path: rel_path.clone(),
           line_number,
           line_content: line.clone(),
           match_start,
           match_end,
       });
   ```
   `match_start` and `match_end` are byte indices inside `line_lower`. When `line` contains characters where `to_lowercase()` alters byte length (such as Kelvin sign `\u{212A}` shrinking from 3 bytes `E2 84 AA` to 1 byte `'k'`, or Turkish dotted I `\u{0130}` expanding from 2 bytes to 3 bytes), the offsets in `line_content` become corrupt, leading to incorrect string slicing or slicing panics on non-char boundaries.

3. **Premature PTY Session & Scrollback Eviction on Process Exit (`crates/aetherd/src/pty_manager.rs:490-492`)**:
   ```rust
   if let Ok(mut lock) = watcher_sessions.try_write() {
       lock.remove(&watcher_pane_id);
   }
   ```
   On child exit, `watcher_sessions` immediately purges the `PaneSession` from memory. Any subsequent call to `get_scrollback(&pane_id)` returns `PtyError::NotFound`, destroying the 512KB ring buffer immediately after process completion. Furthermore, `try_write()` introduces a non-deterministic race condition where session retention depends on whether another thread currently holds a read lock.

4. **Integrity Check**:
   - Hardcoded test outputs: NONE found.
   - Dummy/facade implementations: NONE found.
   - Real implementations exist for directory listing, traversal protection, file bounds, and SSH keepalive injection.

---

## 2. Logic Chain

1. **Test Failure Invalidates Approval**:
   - `DISPATCH.md § Verification Requirements` mandates: *"Run cargo check --workspace and cargo test --workspace. Verify that all 45 tests pass."*
   - Current test execution in `aether-gui` fails with 2 test failures.
   - Under Quality Review principles and dispatch requirements, an active test regression requires a `REQUEST_CHANGES` verdict.

2. **Ripgrep Flag Injection Impact**:
   - Software developers frequently search for compiler flags, CLI parameters, and hyphenated identifiers (e.g. `-Werror`, `--target`, `-e`, `-v`).
   - Because `search_workspace_files_with_rg` passes `query` without `-e` or `--`, ripgrep treats these queries as command-line options.
   - Because the error code from `child.wait()` is not propagated as `Err`, `search_workspace_files_impl` never executes the Rust walker fallback and reports 0 matches.
   - *Fix*: Pass `.arg("-e").arg(query)` or `.arg("--").arg(query)`, and return `Err` if `child.wait()` returns non-zero and matches are empty.

3. **Unicode Case-Folding Drift Impact**:
   - In international or multilingual files, case-insensitive substring searching using `line.to_lowercase()` introduces a byte-offset delta between `line_lower` and `line`.
   - Storing `line_lower` byte offsets inside `WorkspaceSearchMatch` alongside original `line_content` causes UI highlight mismatches or runtime panics when indexing into UTF-8 boundaries.
   - *Fix*: Map match positions back to original UTF-8 byte offsets (e.g., via char-level case-insensitive matching or tracking cumulative byte delta).

4. **PTY Session Retention Impact on R3**:
   - R3 requires: *"Ensure that terminal pane states, PTY streaming buffers, background task connections, and multiplexed sessions remain stable, resilient, and recoverable during remote SSH connections and UI component unmount/remount cycles."*
   - Evicting the session in `pty-wait` via `lock.remove(&watcher_pane_id)` immediately destroys the ring buffer when a process finishes.
   - A user switching tabs, toggling the Aether Drive sidebar (`Cmd+\`), or remounting `XtermWebGLPane` for a completed task receives `NotFound` instead of scrollback.
   - *Fix*: Retain finished sessions in `self.sessions` with `active = false` and `exit_code`, removing them only upon explicit pane destruction (`kill_pane` / `close_pane`) or via a bounded LRU tombstone cache.

---

## 3. Caveats

1. **Existing Baseline Tests vs Challenger Tests**:
   - The initial 8 unit tests in `ipc_bridge.rs` and 5 unit tests in `pty_manager.rs` passed cleanly.
   - The failing tests were introduced by adversarial stress-testing in `ipc_bridge.rs` (`test_search_workspace_files_dash_queries` and `test_search_workspace_files_rust_unicode_byte_offsets`). These tests reveal real, reproducible defects in production search behavior.
2. **Mock SSH Test Concurrency in `pty_challenge_test.rs`**:
   - `test_spawn_pane_with_mock_ssh_quoted_command` passes in isolation (`--test-threads=1`), but fails during parallel execution due to a static path collision (`/tmp/aether_challenge_mock_ssh/args.log`). The test harness should use unique temp files (`Uuid::new_v4()`).
3. **SSH Keepalive Precedence**:
   - `-o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o TCPKeepAlive=yes` prepended on the command line correctly forces keepalives for interactive SSH sessions, but overrides `~/.ssh/config` host settings unless specified by the user on the command line.

---

## 4. Conclusion

### **VERDICT: REQUEST_CHANGES**

Milestone 1 is functionally well-structured with secure canonical root checks, bounded file reads, and genuine SSH flag injection. However, it cannot be approved in its current state due to:
1. **Critical Finding 1**: Ripgrep search flag collision on queries starting with `-` (`test_search_workspace_files_dash_queries` FAILED).
2. **Major Finding 2**: Unicode case-folding byte offset drift in Rust file search fallback (`test_search_workspace_files_rust_unicode_byte_offsets` FAILED).
3. **Critical Finding 3**: Premature PTY session and scrollback buffer eviction upon process termination in `pty_manager.rs:490-492`.
4. **Minor Finding 4**: Shared static log path in `pty_challenge_test.rs` causing concurrent test collisions.

Remediation must be performed by worker M1 to resolve these findings and ensure `cargo test --workspace` passes cleanly.

---

## 5. Verification Method

To verify the findings and confirm fixes:

1. **Run full workspace tests**:
   ```bash
   cargo test --workspace
   ```
   *Expected Current Output*: Fails with 2 test failures in `aether-gui` (`test_search_workspace_files_dash_queries`, `test_search_workspace_files_rust_unicode_byte_offsets`).
   *Expected Post-Fix Output*: 0 test failures across all packages.

2. **Verify Ripgrep dash queries**:
   ```bash
   cargo test -p aether-gui test_search_workspace_files_dash_queries
   ```

3. **Verify Unicode byte offsets**:
   ```bash
   cargo test -p aether-gui test_search_workspace_files_rust_unicode_byte_offsets
   ```

4. **Verify PTY Challenge Suite**:
   ```bash
   cargo test -p aetherd --test pty_challenge_test -- --test-threads=1
   ```
