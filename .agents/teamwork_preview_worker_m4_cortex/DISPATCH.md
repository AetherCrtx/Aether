## 2026-10-24T11:29:36Z

<USER_REQUEST>
You are Worker for Milestone 4 (M4: Collapsible AI Assistant Panel).
Your Working Directory: /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m4_cortex
Authoritative Request: /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md (Requirement R3)
Project Root: /home/rasshqa/projects/Elliot
Scope & Architecture: /home/rasshqa/projects/Elliot/PROJECT.md (Features F20-F25, Interface Contract #3)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Milestone 4 Objectives:
1. `ui/src/components/AiAssistantPanel.tsx`:
   - Implement side-by-side collapsible panel mounted in `ui/src/main.tsx` next to `TerminalGrid`. Width ~380px-420px (e.g. `w-[400px] shrink-0 border-l border-cortex-border`).
   - Controlled by `store.aiAssistantOpen` and toggled via `toggleAiAssistant()`.
   - Header with title, provider/model indicator badge, synchronized provider selector, collapse button, and clear conversation button.
   - Message list rendering user and assistant messages with distinct neo-brutalist styling:
     - Markdown formatting (headers, bullet lists, bold/italic, inline code).
     - Code blocks with syntax highlighting / formatted styling and interactive "Copy" button with visual "Copied!" feedback.
     - Technical key-value information cards (e.g. tokens, latency in ms, model ID, execution status).
   - Streaming, loading, and actionable error states:
     - Loading state: pulsing indicator / animated state while awaiting response.
     - Actionable error state: red/warning card with clear error description and a "Retry" button.
   - Conversation history persistence and contextual terminal assistance ("Add Terminal Context" button / prompt).
   - Bottom prompt input bar with Send button and Enter/Cmd+Enter submission.
2. Store Extensions in `ui/src/stores/aetherStore.ts`:
   - Add state: `aiMessages: AiMessage[]`, `aiLoading: boolean`, `aiError: string | null`.
   - Export actions: `sendAiMessage(prompt: string): Promise<void>`, `clearAiMessages(): void`, `retryLastAiMessage(): Promise<void>`, `insertTerminalContextToAi(paneId?: string): void`.
   - Integrate with Tauri IPC `cmd_ai_chat` where available, with realistic mock fallbacks for web/tests.
3. Layout Integration in `ui/src/main.tsx`:
   - Dock `<AiAssistantPanel />` side-by-side with `<TerminalGrid />` inside `<main>`.
   - Ensure `✦ AI Assistant` nav button in `PersistentLeftSidebar.tsx` and "AI Connected" pill in `TopBar.tsx` cleanly toggle the panel.
4. Testing:
   - Create comprehensive tests in `ui/tests/aiAssistantPanelM4.test.ts` verifying all M4 features: panel toggle, message rendering, code copy, key-value cards, loading/error states, contextual terminal assistance, zero BYOK, zero emojis.
5. Verification:
   - Run `npm run build` in `ui/`
   - Run `node --test tests/*.test.ts` in `ui/`
   - Run `cargo check --workspace` and `cargo test --workspace`
   - Run `graphify update .`
   - Write `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m4_cortex/handoff.md` with: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
   - Send completion message to orchestrator.
</USER_REQUEST>
