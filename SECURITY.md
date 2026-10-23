# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

---

## 🔒 Security Architecture

AetherTerminal is designed for high-concurrency development with autonomous AI coding agents. Security is enforced through multiple layers:

1. **Unix Domain Sockets & Permissions**:
   - The daemon socket is hosted under `/run/user/<UID>/aether.sock` with strict `0600` user-only permissions.
   - Cross-user access is blocked at the kernel VFS level.

2. **Git Worktree Isolation**:
   - Each spawned agent operates in an isolated Git worktree branch under `.aether/worktrees/<agent-id>`.
   - Modifying master/main requires review through the Diff Gatekeeper (`Alt+M`).

3. **Advisory File Locks**:
   - The embedded SQLite engine prevents destructive concurrent file mutations across multiple active CLIs.

4. **Process Safety Check**:
   - Terminal closures verify active child processes before sending termination signals to prevent accidental data loss or half-written files.

---

## 🛡️ Reporting a Vulnerability

If you discover a potential security vulnerability within AetherTerminal, please report it responsibly:

1. **Do not** file a public GitHub issue.
2. Email your findings with a proof-of-concept to **[security@aether-terminal.dev]** or message the maintainer directly via GitHub Security Advisories.
3. You will receive an acknowledgment within 48 hours.
4. We will coordinate a patched release and public disclosure with appropriate attribution.
