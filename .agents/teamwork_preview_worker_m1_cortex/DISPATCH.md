## 2026-10-24T10:07:38Z
You are Worker for Milestone 1 (M1: Brand Identity, Design Tokens & Persistent Sidebar).
Your Working Directory: /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1_cortex
Authoritative Request: /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md
Project Root: /home/rasshqa/projects/Elliot
Scope & Architecture: /home/rasshqa/projects/Elliot/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Input Context & Specifications:
- Read /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md
- Read /home/rasshqa/projects/Elliot/PROJECT.md
- Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_ui/survey_report.md
- Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_ai/survey_report.md

Milestone 1 Objectives:
1. Implement `ui/src/components/PersistentLeftSidebar.tsx`:
   - AetherCortex SVG logo (white letter A with cosmic cyan orbit swoosh and sparkle star)
   - Brand title "AetherCortex"
   - 4 navigation items with active/hover indicator lines:
     - `>_ Terminal` (navigates/focuses terminal)
     - `✦ AI Assistant` (toggles `aetherStore.toggleAiAssistant()` or opens panel)
     - `📁 Workspace` (toggles `aetherStore.toggleSidebar()` - opens AetherDriveSidebar drawer)
     - `⚙ Settings` (opens `setSettingsModalOpen(true)` or settings dialog)
   - Bottom branding: vertical cyan accent bar `| BETTER TOOLS. BIGGER POSSIBILITIES.` and 3 diagonal slashes `///`.
2. Integrate `PersistentLeftSidebar` into `ui/src/main.tsx`:
   - Place persistent sidebar on the leftmost column of the viewport.
   - Keep `AetherDriveSidebar` docked immediately to its right when open (as the collapsible Workspace drawer).
   - Fix typography: use sans-serif for UI labels, monospace for terminal, code, and input commands. Remove global `font-mono` from `body` in `ui/index.html`.
3. Design Tokens & Styling (Minimalism + Neo-Brutalism):
   - In `ui/src/index.css` and `ui/tailwind.config.js`:
     - Primary accent: Cosmic Cyan `#00F0FF`
     - Background: near-black `#050809` and charcoal `#0B1013`
     - Surfaces: dark panels with subtle contrast (`#0E1418`, `#121A1F`)
     - Text: off-white `#F8F9FA` and muted gray (`#8E9BA4`)
     - Borders: thin, crisp, high-contrast lines (`#162026`, `#1F2E36`)
     - Light Mode: `#F8F9FA` / `#FFFFFF` / high-contrast cyan `#00A3AD`
     - Flat colors only: no gradients, no glassmorphism, no excessive glow, no decorative clutter.
   - Default theme in `ui/src/stores/aetherStore.ts`: `'aethercortex-dark'`. Persist theme selection in `localStorage`.
   - Update `XtermWebGLPane.tsx` to reactively update terminal theme colors when theme changes.
4. Strict Copy Restriction ("BYOK" Ban):
   - NEVER display "BYOK" anywhere in the application UI (use "API Key", "Provider Settings", or "Connection Settings").
   - Eliminate all 8 identified occurrences in:
     - `crates/aetherd/src/ai_pilot/supervisor.rs` (line 293)
     - `ui/src/main.tsx` (lines 455, 463)
     - `ui/src/components/OrchestratorBar.tsx` (lines 185, 188)
     - `ui/src/components/AiSettingsModal.tsx` (lines 192, 289)
     - `ui/tests/aiPilot.test.ts` (line 63)
5. Zero-Emoji Repository Compliance:
   - Clean up emojis in markdown docs: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `TEST_READY.md`, `HANDOFF.md`.
   - Ensure 0 emojis across entire repository code, comments, and docs.
6. Verification & Hand-off:
   - Run `npm run build` in `ui/`.
   - Run `node --test tests/*.test.ts` in `ui/`.
   - Run `cargo check --workspace` and `cargo test --workspace`.
   - Verify zero emojis and zero "BYOK" matches.
   - Write `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1_cortex/handoff.md` with: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
   - Send completion message to orchestrator.
