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

## 2026-10-24T09:53:51Z

# AetherCortex — UI/UX Refactor & AI Integration

Refactor the existing AetherCortex application into a polished, modern AI-powered terminal interface combining Minimalism and Neo-Brutalism, inspired by the AetherCortex brand identity and dark-mode reference design.

Working directory: /home/rasshqa/projects/Elliot
Integrity mode: development

## Requirements

### R1. Brand Identity & Global Layout (Minimalism + Neo-Brutalism)
- Establish the AetherCortex visual direction across the application:
  - Primary accent: Cosmic Cyan `#00F0FF`
  - Background: near-black `#050809` and charcoal `#0B1013`
  - Surfaces: dark panels with subtle contrast (`#0E1418`, `#121A1F`)
  - Text: off-white `#F8F9FA` and muted gray (`#8E9BA4`)
  - Borders: thin, crisp, high-contrast lines (`#162026`, `#1F2E36`)
  - Typography: sans-serif for interface labels and monospace for terminal output and code
  - Use flat colors only: no gradients, no glassmorphism, no excessive glow, and no decorative clutter.
- Provide a persistent left sidebar with:
  - AetherCortex logo (white letter A with cosmic cyan orbit swoosh and sparkle star) and brand title "AetherCortex"
  - Navigation items: `>_ Terminal`, `✦ AI Assistant`, `📁 Workspace`, and `⚙ Settings` with active/hover indicator lines
  - Bottom branding: vertical cyan accent bar `| BETTER TOOLS. BIGGER POSSIBILITIES.` and 3 diagonal slashes `///`.

### R2. Main Terminal & Tab Management
- Preserve the active terminal engine, PTY daemon connections, and xterm rendering. Do not replace the terminal with static mockups.
- Maintain multi-tab management, split-pane support (`Cmd+D` / `Cmd+Shift+D`), layout balancing, and keyboard interactions.
- Provide a top bar with terminal tab buttons, new tab trigger, an `AI Connected` status pill, and standard window controls.

### R3. AI Assistant Panel Alongside Terminal
- Implement an integrated, collapsible AI conversation panel positioned side-by-side with the main terminal.
- Render user and assistant messages with clear visual distinction, markdown parsing, code blocks with syntax highlighting and copy buttons, and technical key-value information cards.
- Provide streaming, loading, and actionable error states.
- Support conversation history and contextual terminal assistance.

### R4. Input Bar & Unified Provider Synchronization
- Rename every user-facing occurrence of "Modern Input Bar" to "Input Bar".
- Provide a multiline command and prompt input bar with automatic height adjustment and clear mode distinction between shell execution (`$`) and AI prompt dispatch (`#` / natural language).
- Prevent arbitrary shell execution of prompts intended for the AI.
- Include provider and model selectors synchronized via a single source of truth in the store between the Input Bar and AI Assistant panel.
- Use concise placeholder text: "Ask AetherCortex or enter a command...".

### R5. Provider Management & Custom Provider Configuration
- Support the following AI providers using stored API keys:
  - OpenAI (default model: `gpt-4o`)
  - Anthropic (default model: `claude-3-5-sonnet-20241022`)
  - Google Gemini (default model: `gemini-1.5-pro`)
  - Groq (default model: `llama-3.3-70b-versatile`)
  - Custom Provider (with configurable display name, endpoint/base URL, API key, model identifier, and protocol adapter)
  - Retain existing OpenRouter and Ollama support.
- Custom Provider flow must validate required fields, allow connection testing with meaningful feedback, mask API keys, and allow adding, editing, selecting, and deleting configurations without unsaved data loss.
- Strict UI copy restriction: Never display the term "BYOK" anywhere in the application UI (use "API Key", "Provider Settings", or "Connection Settings").

### R6. Light Mode and Dark Mode Design Tokens
- Provide cohesive Dark Mode (`#050809` / `#0B1013` / `#00F0FF`) and Light Mode (`#F8F9FA` / `#FFFFFF` / high-contrast cyan `#00A3AD`).
- Define reusable semantic CSS variables for backgrounds, surfaces, text, borders, and state highlights.
- Persist user theme selection across sessions in localStorage.

## Acceptance Criteria

### Functional Deliverables
- [ ] Left sidebar renders AetherCortex logo, title, 4 navigation items (`Terminal`, `AI Assistant`, `Workspace`, `Settings`), and bottom brand accents.
- [ ] Terminal remains fully interactive with PTY execution, tabs, and split panes intact.
- [ ] AI Assistant panel operates alongside the terminal with markdown and code formatting.
- [ ] Input Bar replaces all user-facing instances of "Modern Input Bar" and maintains automatic height and mode detection.
- [ ] Provider and model selections remain synchronized between Input Bar and AI Assistant.
- [ ] Settings modal allows managing OpenAI, Anthropic, Gemini, Groq, and custom providers with live connectivity testing.
- [ ] The prohibited term "BYOK" does not appear in any user-facing UI text, tooltip, or modal.
- [ ] Both Dark Mode and Light Mode render consistently with accessible contrast.

### Code Quality & Build Verification
- [ ] `cargo check --workspace` passes with 0 errors and 0 warnings.
- [ ] `cargo test --workspace` passes with 100% green tests.
- [ ] `npm run build` in `ui/` succeeds without errors.
- [ ] `node --test tests/*.test.ts` passes with 100% green tests.
- [ ] Static audit confirms zero emoji characters in code, comments, or documentation.
- [ ] `graphify update .` executes cleanly and synchronizes the knowledge graph.
