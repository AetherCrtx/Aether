# Original User Request

## 2026-10-24T02:52:05Z

Complete the remaining Phase 2 roadmap for AetherTerminal by implementing the Aether Drive Sidebar (`Cmd+\` / `Ctrl+\`), intelligent natural language vs shell command auto-detection, and persistent remote/SSH session handling.

Working directory: /home/rasshqa/projects/Elliot
Integrity mode: development

## Requirements

### R1. Aether Drive Sidebar (`Cmd+\` / `Ctrl+\`)
Provide an interactive, collapsible sidebar drawer accessible via keyboard shortcut (`Cmd+\` or `Ctrl+\`) and top toolbar icon. The sidebar must feature a responsive workspace file tree (supporting directory expand/collapse and file inspection), an integrated workspace text search panel, and quick access to saved markdown workflows.

### R2. Intelligent Natural Language vs Shell Command Classifier
In the modern input bar, intelligently classify user input in real time to distinguish between shell commands and natural language prompts. When a natural language instruction is detected, automatically provide seamless routing or conversion to the AI agent execution pipeline without requiring manual `#` prefixing or causing shell syntax errors.

### R3. Persistent Terminal & Remote Session Resilience
Ensure that terminal pane states, PTY streaming buffers, background task connections, and multiplexed sessions remain stable, resilient, and recoverable during remote SSH connections and UI component unmount/remount cycles.

## Acceptance Criteria

### Functional Deliverables
- [ ] `Cmd+\` and `Ctrl+\` reliably toggle the Aether Drive Sidebar, with state persisted across sessions.
- [ ] The file tree accurately reflects the active workspace directory structure, allowing expansion, collapsing, and file selection.
- [ ] Workspace search allows entering queries and lists matching files with preview snippets.
- [ ] `ModernInputBar` correctly differentiates natural language instructions from shell commands, providing fluid agent dispatch.
- [ ] Background tasks and terminal multiplexer continue running without disconnection during window navigation or focus switches.

### Code Quality & Build Verification
- [ ] `npx tsc --noEmit && npm run build` in the `ui` directory completes with exit code 0 and 0 errors.
- [ ] `cargo check --workspace` and `cargo test --workspace` pass with 100% green tests (all 32+ unit and integration tests passing).
- [ ] `graphify update .` executes cleanly and updates the architecture knowledge graph.
