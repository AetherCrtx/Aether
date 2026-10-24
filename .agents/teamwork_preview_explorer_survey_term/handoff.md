# Soft Handoff Report: Terminal, Tab Management, and Input Bar Survey

## 1. Observation
1. **Terminal Engine and PTY Streaming**:
   - `ui/src/components/XtermWebGLPane.tsx` (lines 66-542) implements xterm.js terminal rendering with `@xterm/addon-fit`, `@xterm/addon-image` (SIXEL/iTerm), and `@xterm/addon-webgl` with automated fallback to native DOM renderer via `checkWebGLHardwareSupport()` (lines 21-64).
   - `ui/src/main.tsx` (lines 71-92, 98-112) binds `registerTermWriter` and `subscribeAetherEvents`, buffering incoming PTY chunks in `pendingPtyBuffersRef` if chunks arrive during component mount.
   - Capability negotiation handlers for DA1, DA2, DECRQM (modes 2026, 2004, 1004, 1016), Kitty Progressive Keyboard (`CSI ? u`), XTVERSION, and OSC 10/11 color queries are active in `XtermWebGLPane.tsx` (lines 137-244).
   - Buffer deduplication against the 512 KB daemon ring buffer is implemented in `XtermWebGLPane.tsx` (lines 391-450).
2. **Multi-Tab and Split-Pane Architecture**:
   - Binary layout tree is defined in `ui/src/stores/aetherStore.ts:118-126` (`LayoutNode`) and managed by `balanceLayout` (lines 391-406), `updateSplitRatio` (lines 408-430), `equalizeLayout` (lines 432-438), `createTab` (lines 478-552), `switchTab` (lines 554-567), and `closeTab` (lines 569-605).
   - Split-pane rendering is handled in `ui/src/components/TerminalGrid.tsx` via `SplitNodeView` (lines 108-142) and `SplitDivider` (lines 33-106).
   - `Cmd+D` and `Cmd+Shift+D` are hooked in `ui/src/stores/aetherStore.ts:1369-1373` (`splitActivePane(e.shiftKey ? 'horizontal' : 'vertical')`) and permitted through xterm's input filter in `XtermWebGLPane.tsx:288-301`.
3. **'Modern Input Bar' Occurrences**:
   - `ui/src/components/AgentHeaderPill.tsx:140`: `title="Toggle Modern Input Bar (Alt+I)"`.
   - `ui/src/stores/aetherStore.ts:1483`: `// Alt+I -> Toggle Modern Input Bar on active pane`.
   - No other occurrences of the exact string 'Modern Input Bar' exist in the codebase.
4. **Input Bar Current State**:
   - `ui/src/components/ModernInputBar.tsx` (lines 307-325) has fixed `rows={1}` without dynamic `scrollHeight` expansion.
   - Textarea placeholder is conditional on mode rather than the required concise string `"Ask AetherCortex or enter a command..."`.
   - `submit()` in `ModernInputBar.tsx` (lines 115-152) branches on `mode === 'ai'`, but lacks explicit defense against arbitrary shell execution when input is classified as natural language without an explicit `$` prefix.
5. **Provider Synchronization**:
   - `aetherStore.ts` contains `aiProviderConfig: ProviderConfig | null` (line 274), but lacks unified `activeAiProvider` and `activeAiModel` state properties and synchronization actions between Input Bar and AI Assistant panel.
6. **Test Verification**:
   - `npm run build` in `ui/` succeeds with exit code 0.
   - `node --test tests/*.test.ts` in `ui/` executes 74 tests across 26 suites with 0 failures.
   - `cargo check --workspace` finishes with 0 errors and 0 warnings.
   - `cargo test --workspace` executes 85+ tests with 100% green results.

---

## 2. Logic Chain
1. *From Observation 1*: The terminal engine utilizes a real-time event pipeline (`subscribeAetherEvents`), xterm addon subsystem, and capability query responders directly connected to `aetherd`. Removing or replacing this with static HTML mockups would break active shell sessions, interactive TUIs (fzf, agy, opencode), and process lifecycle tracking. Therefore, `XtermWebGLPane.tsx` and `TerminalGrid.tsx` must be preserved intact.
2. *From Observation 2*: The layout tree (`LayoutNode`) and tab model (`TerminalTab`) are self-contained in `aetherStore.ts` and handle recursive vertical and horizontal splits. `Cmd+D` and `Cmd+Shift+D` properly bubble from xterm to `setupGlobalShortcuts()`. Therefore, preserving this structure ensures seamless multi-tab and split-pane functionality without structural refactoring.
3. *From Observation 3*: Replacing the 2 user-facing occurrences of 'Modern Input Bar' in `AgentHeaderPill.tsx` and `aetherStore.ts`, while re-exporting `InputBar` in `InputBar.tsx`, completely satisfies the R4 renaming mandate with zero breaking changes.
4. *From Observation 4*: Adding an effect adjusting `textarea.style.height` to `Math.min(Math.max(el.scrollHeight, 32), 160)` enables seamless multiline auto-height. Setting `placeholder="Ask AetherCortex or enter a command..."` satisfies the R4 copy requirement.
5. *From Observation 4 & Requirement R4*: Prompts intended for AI can be strictly separated from shell commands by ensuring: (a) explicit `$` prefix routes to shell, (b) explicit `#` or `@` prefix routes to AI, (c) natural language classified by `commandClassifier.ts` with confidence >= 0.75 routes to AI agent/assistant pipeline and is blocked from `executeCommandInPane`.
6. *From Observation 5*: Adding `activeAiProvider` and `activeAiModel` to `aetherStore.ts` creates a single source of truth shared by both `InputBar.tsx` and `AiAssistantPanel.tsx`.

---

## 3. Caveats
- No caveats regarding terminal preservation: active engine mechanics and test suites were thoroughly verified.
- The top-level window controls (Minimize, Maximize, Close) require Tauri API `@tauri-apps/api/window` at runtime, which must fall back gracefully when run in web/browser mock mode.
- Emojis must remain strictly prohibited across all future files and commits.

---

## 4. Conclusion
The implementation blueprint for R2 (Terminal & Tab Management) and R4 (Input Bar & Unified Provider Synchronization) is fully formulated, scoped, and verified against all existing test suites. The terminal stack remains fully functional and ready for worker implementation following the step-by-step sequence in `survey_report.md`.

---

## 5. Verification Method
To independently verify this survey:
1. Build verification:
   `npm run build` in `/home/rasshqa/projects/Elliot/ui`
2. Frontend unit and integration tests:
   `node --test tests/*.test.ts` in `/home/rasshqa/projects/Elliot/ui`
3. Backend workspace tests:
   `cargo test --workspace` in `/home/rasshqa/projects/Elliot`
4. Inspect survey artifacts:
   `view_file` on `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_term/survey_report.md`
   `view_file` on `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_term/handoff.md`

---

## Remaining Work (For Implementing Worker Agents)
1. In `ui/src/stores/aetherStore.ts`:
   - Add `activeAiProvider` and `activeAiModel` to `globalState`.
   - Export `setActiveAiProvider` and `setActiveAiModel`.
   - Update line 1483 comment to `Toggle Input Bar on active pane`.
2. In `ui/src/components/`:
   - Create `InputBar.tsx` (with auto-height, concise placeholder, dual-layer AI routing guard, and synchronized provider selector).
   - Update `AgentHeaderPill.tsx:140` title to `Toggle Input Bar (Alt+I)`.
   - Update `TerminalGrid.tsx` to import and render `InputBar`.
3. In `ui/src/main.tsx` / `ui/src/components/TopBar.tsx`:
   - Implement top bar with terminal tab buttons, new tab trigger, 'AI Connected' status pill, and window controls.
4. Execute `npm run build`, `node --test tests/*.test.ts`, and `cargo test --workspace` to ensure zero regressions.
