# Dispatch Record — teamwork_preview_orchestrator_2

## 2026-10-24T09:54:46Z

You are the Project Orchestrator (teamwork_preview_orchestrator_2) for AetherCortex.

Working Directory: /home/rasshqa/projects/Elliot/.agents/teamwork_preview_orchestrator_2
Project Root: /home/rasshqa/projects/Elliot
Authoritative Request: /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md

Mission:
Execute the full UI/UX Refactor & AI Integration for AetherCortex per the latest request in ORIGINAL_REQUEST.md.

Requirements:
- R1. Brand Identity & Global Layout (Minimalism + Neo-Brutalism):
  - Primary accent: Cosmic Cyan #00F0FF
  - Background: near-black #050809 and charcoal #0B1013
  - Surfaces: dark panels with subtle contrast (#0E1418, #121A1F)
  - Text: off-white #F8F9FA and muted gray (#8E9BA4)
  - Borders: thin, crisp, high-contrast lines (#162026, #1F2E36)
  - Typography: sans-serif for interface labels and monospace for terminal output and code
  - Use flat colors only: no gradients, no glassmorphism, no excessive glow, no decorative clutter.
  - Persistent left sidebar: AetherCortex logo (white letter A with cosmic cyan orbit swoosh and sparkle star), title "AetherCortex", navigation items (>_ Terminal, ✦ AI Assistant, 📁 Workspace, ⚙ Settings) with active/hover indicator lines, bottom branding (| BETTER TOOLS. BIGGER POSSIBILITIES. and 3 diagonal slashes ///).
- R2. Main Terminal & Tab Management:
  - Preserve active terminal engine, PTY daemon connections, xterm rendering. Do not replace with static mockups.
  - Multi-tab management, split-pane support (Cmd+D / Cmd+Shift+D), layout balancing, keyboard interactions.
  - Top bar with terminal tab buttons, new tab trigger, "AI Connected" status pill, standard window controls.
- R3. AI Assistant Panel Alongside Terminal:
  - Integrated, collapsible AI conversation panel side-by-side with main terminal.
  - User and assistant messages, markdown parsing, code blocks with syntax highlighting & copy buttons, technical key-value information cards.
  - Streaming, loading, and actionable error states.
  - Conversation history and contextual terminal assistance.
- R4. Input Bar & Unified Provider Synchronization:
  - Rename every user-facing occurrence of "Modern Input Bar" to "Input Bar".
  - Multiline command & prompt input bar with auto height and clear mode distinction (shell execution $ vs AI prompt dispatch #/natural language).
  - Prevent arbitrary shell execution of prompts intended for AI.
  - Provider and model selectors synchronized via single source of truth in the store between Input Bar and AI Assistant panel.
  - Placeholder: "Ask AetherCortex or enter a command...".
- R5. Provider Management & Custom Provider Configuration:
  - Support OpenAI (gpt-4o), Anthropic (claude-3-5-sonnet-20241022), Gemini (gemini-1.5-pro), Groq (llama-3.3-70b-versatile), Custom Provider (display name, endpoint/base URL, API key, model identifier, protocol adapter). Retain OpenRouter & Ollama.
  - Custom Provider flow: validation, connection testing with feedback, masked API keys, add/edit/select/delete without data loss.
  - STRICT UI COPY RESTRICTION: Never display "BYOK" anywhere in the application UI (use "API Key", "Provider Settings", or "Connection Settings").
- R6. Light Mode and Dark Mode Design Tokens:
  - Cohesive Dark Mode (#050809 / #0B1013 / #00F0FF) and Light Mode (#F8F9FA / #FFFFFF / high-contrast cyan #00A3AD).
  - Semantic CSS variables for backgrounds, surfaces, text, borders, state highlights.
  - Persist theme selection in localStorage.

Acceptance Criteria & Verification:
- All functional deliverables verified.
- cargo check --workspace passes with 0 errors and 0 warnings.
- cargo test --workspace passes with 100% green tests.
- npm run build in ui/ succeeds without errors.
- node --test tests/*.test.ts passes with 100% green tests.
- Static audit confirms zero emoji characters in code, comments, or documentation.
- graphify update . executes cleanly and synchronizes knowledge graph.

Maintain progress in progress.md and BRIEFING.md in your working directory.
When finished, send a victory claim message back to Sentinel.
