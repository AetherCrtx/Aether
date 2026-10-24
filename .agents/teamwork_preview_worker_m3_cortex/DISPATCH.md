## 2026-10-24T10:56:45Z
You are Worker for Milestone 3 (M3: Terminal Top Bar, Tab/Split Controls & Input Bar).
Your Working Directory: /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m3_cortex
Authoritative Request: /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md
Project Root: /home/rasshqa/projects/Elliot
Scope & Architecture: /home/rasshqa/projects/Elliot/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Input Context & Specifications:
- Read /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md (Requirements R2 & R4)
- Read /home/rasshqa/projects/Elliot/PROJECT.md (§ Milestones M3, Interface Contracts #2)
- Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_term/survey_report.md
- Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_term/handoff.md

Milestone 3 Objectives:
1. Top Bar & Tab Management (`ui/src/components/TopBar.tsx` / `ui/src/main.tsx`):
   - Terminal tab buttons with active styling, close trigger, switchTab.
   - New tab trigger (`+`) invoking `createTab()`.
   - "AI Connected" status pill in the top bar: Cosmic Cyan `#00F0FF` dot indicator, active provider label, clicking toggles AI assistant or opens provider settings.
   - Standard window controls (minimize, maximize, close) with web preview safety checks.
   - Preserve active terminal engine, PTY daemon connections, xterm rendering, DA1/DA2/Kitty keyboard handlers, split panes (`Cmd+D` / `Cmd+Shift+D`), layout balancing. Never replace terminal with static mockups.
2. Input Bar (`ui/src/components/InputBar.tsx`):
   - Rename all user-facing occurrences of "Modern Input Bar" to "Input Bar" (in `ui/src/components/AgentHeaderPill.tsx:140`, comments, and UI strings). Re-export `InputBar` in `ModernInputBar.tsx` for backwards compatibility.
   - Multiline command & prompt input bar with automatic height adjustment: adjusts dynamically between 32px and 160px based on content.
   - Concise placeholder text: "Ask AetherCortex or enter a command...".
   - Clear mode distinction between shell execution (`$`) and AI prompt dispatch (`#` / natural language).
   - Shell protection guard: Prevent arbitrary shell execution of prompts intended for the AI. If input is classified as natural language (or starts with `#`/`@`) without explicit `$` prefix, route to AI execution (`routePromptToAgent`) and strictly block `executeCommandInPane`.
   - Synchronized provider and model selector directly embedded in the Input Bar, bound to `selectedAiProvider` and `selectedAiModel` in `aetherStore.ts` as the single source of truth.
3. Testing & Constraints:
   - Add comprehensive tests in `ui/tests/terminalInputBarM3.test.ts` verifying TopBar tabs, "AI Connected" pill, Input Bar multiline auto-height, placeholder, shell protection guard, and provider selector synchronization.
   - Ensure zero occurrences of "BYOK" and zero emojis across all code and tests.
4. Verification & Hand-off:
   - Run `npm run build` in `ui/`
   - Run `node --test tests/*.test.ts` in `ui/`
   - Run `cargo check --workspace` and `cargo test --workspace`
   - Run `graphify update .`
   - Write `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m3_cortex/handoff.md` with: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
   - Send completion message to orchestrator.
