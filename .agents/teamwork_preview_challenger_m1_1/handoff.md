# Verification & Empirical Challenge Report — Milestone 1 Backend APIs

## 1. Observation

### 1.1 Empirical Verification Test Suite
A suite of 16 comprehensive adversarial unit tests was added to `crates/aether-gui/src/ipc_bridge.rs` under `mod tests` to stress-test the three new workspace APIs under path traversals, resource limits, symlinks, large files, and adversarial search inputs.

Command executed:
```bash
cargo test --package aether-gui
```

Out of 28 unit tests:
- **26 tests passed** (including directory path traversal blocks, file path traversal blocks, symlink escaping blocks, 2MB large file reads, 0-byte file reads, exact truncation boundary reads, empty search queries, regex metacharacter literal searches, and search result capping).
- **2 tests failed with empirical assertions**, exposing two concrete bugs in `cmd_search_workspace_files`.

---

### 1.2 Verbatim Test Failures

#### Failure 1: Ripgrep Positional Argument & Flag Injection (`test_search_workspace_files_dash_queries`)
```
---- ipc_bridge::tests::test_search_workspace_files_dash_queries stdout ----

thread 'ipc_bridge::tests::test_search_workspace_files_dash_queries' (211640) panicked at crates/aether-gui/src/ipc_bridge.rs:2007:9:
assertion `left == right` failed: Searching for '-v' should find the line containing '-v'
  left: 0
 right: 1
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
```

In `crates/aether-gui/src/ipc_bridge.rs:951-965`:
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
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
```
When `query` is `"-v"`, `"-e"`, `"--help"`, or any CLI-flag-like string:
- `rg` interprets `-v` as the `--invert-match` flag.
- `rg` then treats `canonical_root` as the query pattern.
- Having no directory argument left, `rg` defaults to searching `.` (the application working directory) rather than the specified workspace root.
- Result: 0 matches are returned for the target file, and unrelated files from the host repository are scanned.

#### Failure 2: Byte Offset Desynchronization in Fallback Search (`test_search_workspace_files_rust_unicode_byte_offsets`)
```
---- ipc_bridge::tests::test_search_workspace_files_rust_unicode_byte_offsets stdout ----

thread 'ipc_bridge::tests::test_search_workspace_files_rust_unicode_byte_offsets' (213858) panicked at crates/aether-gui/src/ipc_bridge.rs:2049:9:
assertion `left == right` failed: Slice must match target_match exactly
  left: "x target_mat"
 right: "target_match"
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
```

In `crates/aether-gui/src/ipc_bridge.rs:1123-1135`:
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
        start_idx = match_end;
```
When `line` contains Unicode characters whose lowercase representation changes byte length (e.g. Kelvin sign U+212A `\u{212A}` is 3 bytes in UTF-8, but its lowercase is `'k'` which is 1 byte; or Turkish dotted `\u{0130}` is 2 bytes while `i\u{0307}` is 3 bytes):
- `line_lower` has different byte lengths and offsets from `line`.
- `match_start` and `match_end` are byte indices into `line_lower`, but are reported alongside `line_content: line.clone()`.
- Slicing `line_content[match_start..match_end]` produces shifted text (e.g. `"x target_mat"` instead of `"target_match"`) or panics with `byte index X is not a char boundary`.

---

### 1.3 Verified Robust Implementations

1. **Path Traversal Security**:
   - `cmd_read_workspace_directory` with `../../` or symlinks pointing outside workspace root fails immediately with `Security violation: directory '...' escapes workspace root`.
   - `cmd_read_workspace_file` with `../etc/passwd` or symlinks pointing outside workspace root fails immediately with `Security violation: path '...' escapes workspace root`.
2. **Resource Boundedness**:
   - `cmd_read_workspace_file` with a 2MB file properly bounded memory by reading 262,144 bytes (256KB default limit), accurately setting `total_bytes: 2097152` and `is_truncated: true`.
   - Bounded reads with exact boundaries (`max_bytes: 100`, `99`, `101`) and `max_bytes: Some(0)` behave strictly according to contract.
3. **Regex Special Characters**:
   - Searching for `[a-z]+.*(foo|bar)?$`, `(.*)`, `(val + 1)` executed as literal character searches without regex compilation errors.
4. **Result Limit**:
   - File with 250 matches capped results accurately at `max_results: Some(15)` and default `100`.
5. **Dangling Symlinks & Build Artifacts**:
   - Broken symlinks are handled without panics (`size_bytes: 0`, `is_symlink: true`).
   - `.git`, `target`, `node_modules`, `dist`, `.aether` are properly excluded.
6. **Remote SSH Resilience**:
   - SSH keepalive arguments (`-o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o TCPKeepAlive=yes`) in `aetherd/src/pty_manager.rs` are properly injected and verified idempotent.

---

## 2. Logic Chain

1. *Observation*: In `search_workspace_files_with_rg`, `query` is passed directly as a positional CLI argument `.arg(query)` to `rg`.
2. *Inference*: Any query starting with `-` or `--` (such as searching for code containing `-v`, `-e`, `--help`, `-C 2`, `-m`) is parsed by ripgrep as an option flag rather than a search pattern.
3. *Impact*: Ripgrep modifies its behavior (e.g., `-v` inverts matches), consumes the next positional argument (`canonical_root`) as its pattern, searches the application working directory `.` instead of the workspace root, and returns 0 matches for the queried file.
4. *Observation*: In `search_workspace_files_rust`, `line.to_lowercase()` is used for case-insensitive searching, but the byte indices from `line_lower` are directly assigned to `match_start` and `match_end` on the unlowercased `line`.
5. *Inference*: In UTF-8, case folding is not byte-length preserving. Offsets computed on `line_lower` are invalid for `line`.
6. *Impact*: Frontend highlighting is shifted or corrupted, and any string slicing `line_content[match_start..match_end]` will produce corrupted text or panic on non-character boundaries.
7. *Conclusion*: Milestone 1 cannot be approved in its current state because `cmd_search_workspace_files` breaks under adversarial and common developer inputs.

---

## 3. Caveats

1. **Pre-existing Concurrency Issue in `aetherd` Test**:
   - `crates/aetherd/tests/pty_challenge_test.rs` writes mock SSH arguments to a fixed path `/tmp/mock_ssh_args.log`. When `cargo test --package aetherd` runs parallel threads, two tests compete for this file. Running with `--test-threads=1` passes 13/13 tests cleanly. This is an artifact of that test file and does not affect the core `pty_manager.rs` logic.
2. **Windows Path Separators**:
   - Path normalization uses `.replace('\\', "/")` which works across Unix and Windows. Testing was conducted on Linux as per project requirements.

---

## 4. Conclusion

**VERDICT: REQUEST_CHANGES**

Milestone 1 is nearly complete and demonstrates strong path traversal and resource boundedness protection, but requires two straightforward fixes to ensure search robustness before proceeding to Milestone 2.

### Required Changes for Worker:

1. **Fix `search_workspace_files_with_rg` in `crates/aether-gui/src/ipc_bridge.rs:960`**:
   Replace `.arg(query)` with `.arg("-e").arg(query)` (or `.arg("--").arg(query).arg(&canonical_root)`).
   *Rationale*: `-e` guarantees that ripgrep treats `query` strictly as a pattern, regardless of leading hyphens.

2. **Fix `search_workspace_files_rust` in `crates/aether-gui/src/ipc_bridge.rs:1123-1140`**:
   Avoid computing byte offsets directly on `line.to_lowercase()`. Instead, use `line.char_indices()` to match character-by-character case-insensitively, or map case-folded character offsets back to byte indices in `line`.
   *Rationale*: Ensures `match_start` and `match_end` are always valid UTF-8 byte boundaries in the original `line_content`.

---

## 5. Verification Method

To independently verify after implementing the required changes:

1. Run the `aether-gui` test suite:
   ```bash
   cargo test --package aether-gui
   ```
2. Invalidation Condition:
   All 28 tests (including `test_search_workspace_files_dash_queries` and `test_search_workspace_files_rust_unicode_byte_offsets`) must pass with 0 failures and exit code 0.
