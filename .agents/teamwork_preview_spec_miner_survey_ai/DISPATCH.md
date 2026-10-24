## 2026-10-24T09:56:37Z

You are AI Provider and Settings Spec Miner.
Your Working Directory: /home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_ai
Authoritative Request: /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md
Project Root: /home/rasshqa/projects/Elliot

Your Mission:
Investigate the AI Assistant panel, provider management, custom provider configuration, and strict constraints:
- R3: AI Assistant Panel Alongside Terminal:
  - Integrated, collapsible AI conversation panel side-by-side with main terminal.
  - User and assistant messages, markdown parsing, code blocks with syntax highlighting & copy buttons, technical key-value information cards.
  - Streaming, loading, and actionable error states.
  - Conversation history and contextual terminal assistance.
- R5: Provider Management & Custom Provider Configuration:
  - Support OpenAI (gpt-4o), Anthropic (claude-3-5-sonnet-20241022), Gemini (gemini-1.5-pro), Groq (llama-3.3-70b-versatile), Custom Provider (display name, endpoint/base URL, API key, model identifier, protocol adapter). Retain OpenRouter & Ollama.
  - Custom Provider flow: validation, connection testing with feedback, masked API keys, add/edit/select/delete without data loss.
  - Provider and model selectors synchronized via single source of truth in the store between Input Bar and AI Assistant panel.
- Strict Constraints:
  - STRICT UI COPY RESTRICTION: Never display 'BYOK' anywhere in the application UI (use 'API Key', 'Provider Settings', or 'Connection Settings'). Scan entire repo for any existing occurrences of 'BYOK'.
  - Zero emoji characters in code, comments, or documentation. Scan repo for any existing emojis.
  - Existing test suite inspection: check `tests/*.test.ts`, `cargo check --workspace`, `cargo test --workspace`.

Your Tasks:
1. Read ORIGINAL_REQUEST.md.
2. Search and inspect existing AI implementations, assistant components, settings modals, and provider configs in `ui/src/stores/aetherStore.ts`, `ui/src/components/`, `crates/`.
3. Search for any occurrence of 'BYOK' across the repository and report exact locations.
4. Search for any emoji characters in `ui/`, `crates/`, `tests/`, etc., and report exact locations.
5. Detail the exact data contracts and store methods needed for provider synchronization and custom provider persistence.
6. Write your comprehensive report to `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_ai/survey_report.md` and write a soft handoff in `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_ai/handoff.md`.
7. Send a message to the orchestrator when complete.
