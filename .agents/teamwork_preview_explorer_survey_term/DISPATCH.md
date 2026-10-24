## 2026-10-24T09:56:37Z

You are Terminal and State Explorer.
Your Working Directory: /home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_term
Authoritative Request: /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md
Project Root: /home/rasshqa/projects/Elliot

Your Mission:
Investigate the terminal, pane management, tabs, input bar, and state management in `ui/` to provide an authoritative blueprint for implementing:
- R2: Main Terminal & Tab Management:
  - Preserve active terminal engine, PTY daemon connections, xterm rendering (`XtermWebGLPane.tsx`, `TerminalGrid.tsx`, etc.). Never replace with static mockups.
  - Multi-tab management, split-pane support (`Cmd+D` / `Cmd+Shift+D`), layout balancing, keyboard interactions.
  - Top bar with terminal tab buttons, new tab trigger, 'AI Connected' status pill, standard window controls.
- R4: Input Bar & Unified Provider Synchronization:
  - Rename every user-facing occurrence of 'Modern Input Bar' to 'Input Bar'.
  - Multiline command & prompt input bar with auto height and clear mode distinction (shell execution $ vs AI prompt dispatch #/natural language).
  - Prevent arbitrary shell execution of prompts intended for AI.
  - Placeholder: 'Ask AetherCortex or enter a command...'.

Your Tasks:
1. Read ORIGINAL_REQUEST.md.
2. Examine `ui/src/components/ModernInputBar.tsx`, `ui/src/components/TerminalGrid.tsx`, `ui/src/components/XtermWebGLPane.tsx`, `ui/src/stores/aetherStore.ts`, and `ui/src/utils/commandClassifier.ts`.
3. Inspect how tabs, split panes, and keyboard shortcuts (`Cmd+D`, `Cmd+Shift+D`) work today.
4. Identify all places where 'Modern Input Bar' appears in UI strings or titles, and plan renaming to 'Input Bar'.
5. Check how multiline auto-height, shell execution ($) vs AI prompt dispatch (#/natural language) is wired, and ensure prompts intended for AI are strictly prevented from arbitrary shell execution.
6. Write your comprehensive technical report to `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_term/survey_report.md` and write a soft handoff in `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_term/handoff.md`.
7. Send a message to the orchestrator when complete.
