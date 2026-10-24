# Handoff Report: UI Layout and Brand Identity Survey (R1 & R6)
**Agent**: UI Layout and Brand Explorer  
**Working Directory**: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_ui`  
**Handoff Type**: Soft (Exploratory survey complete -> transitioning to implementation agents)  
**Date**: 2026-10-24  

---

## 1. Observation

Direct observations and evidence from code analysis, tool executions, and static audits:

1. **Global App Structure (`ui/src/main.tsx:128-548`)**:
   The current root component renders an outer container with `className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-mono overflow-hidden"`.
   The top `<header className="h-10 bg-slate-900/90 backdrop-blur ...">` houses a brand logo ("AETHER//TERM"), a button toggling `AetherDriveSidebar`, the `ChromeHeaderTabs` component, an orchestrator pipeline stage banner, and 10 action buttons.
   The main body (`<main className="flex-1 w-full relative overflow-hidden bg-slate-950 flex flex-row">`) directly hosts `<AetherDriveSidebar />` as a horizontal flex sibling to `<TerminalGrid registerTermWriter={registerTermWriter} />`.

2. **Typography Monospace Leakage (`ui/index.html:9` and `ui/src/main.tsx:129`)**:
   `ui/index.html` line 9 sets `<body class="bg-tokyo-bgDark text-tokyo-fg overflow-hidden font-mono antialiased">`.
   Because `font-mono` is set on `body`, all UI interface chrome (labels, buttons, modal titles, tabs) inadvertently inherits monospace typography rather than sans-serif.

3. **Fallback Theme Default Bug (`ui/src/stores/aetherStore.ts:254` and `ui/src/components/ThemeModal.tsx:13`)**:
   Verbatim in `ui/src/stores/aetherStore.ts:254`:
   ```ts
   currentTheme: typeof localStorage !== 'undefined' ? (localStorage.getItem('aether_theme') || 'tokyo-night') : 'tokyo-night',
   ```
   Fresh application instances with empty `localStorage` fallback to `'tokyo-night'` rather than the neo-brutalist `'aethercortex-dark'`.

4. **Terminal Theme Dynamic Synchronization Gap (`ui/src/components/XtermWebGLPane.tsx:80-116`)**:
   `new Terminal({ ... theme: { background: '#16161e00', foreground: '#c0caf5', ... } })` statically hardcodes Tokyo Night dark theme values during terminal instantiation. The component does not subscribe to `store.currentTheme` and does not update `term.options.theme` when users switch themes.

5. **Forbidden Copy Violations ("BYOK")**:
   Static search identified 5 occurrences of the prohibited term "BYOK" in user-facing UI and comments:
   - `ui/src/components/AiSettingsModal.tsx:192`: `<span>Native AI Pilot & Multi-Provider BYOK</span>`
   - `ui/src/components/AiSettingsModal.tsx:289`: `<span>API Key (BYOK)</span>`
   - `ui/src/main.tsx:463`: `title="Aether Native AI Pilot & Multi-Provider BYOK Settings"`
   - `ui/src/components/OrchestratorBar.tsx:185`: `title="Configure BYOK Provider and API Keys"`
   - `ui/src/components/OrchestratorBar.tsx:188`: `<span>BYOK Settings</span>`

6. **Light Mode Accent Token Mismatch (`ui/src/utils/themes.ts:77` & `ui/src/index.css:29-31`)**:
   `aethercortex-light` theme currently defines `accent: '#008B94'`, whereas Requirement R6 specifies high-contrast cyan `#00A3AD`.

7. **Zero Emoji Character Audit**:
   Static scan of all TypeScript, CSS, and HTML files in `ui/src` confirmed 0 emoji characters currently exist in source code.

8. **Build and Test Baseline Verification**:
   - `npm run build` in `ui/`: Completed successfully with exit code 0 (`[PASS] built in 6.79s`, 1600 modules transformed).
   - `node --test ui/tests/*.test.ts`: 74/74 tests passing (0 failures, duration 1164ms).
   - `cargo check --workspace`: 0 errors, 0 warnings.
   - `cargo test --workspace`: 86/86 unit and integration tests passing.

---

## 2. Logic Chain

1. **Layout Synthesis (Observation 1 -> Persistent Left Sidebar Architecture)**:
   Because `AetherDriveSidebar` functions as a collapsible file tree / workspace search drawer toggled by `Cmd+\` / `Ctrl+\` and state-persisted via `localStorage`, it should not be replaced or deleted. Instead, the persistent left sidebar must be placed on the leftmost column of the viewport (`h-screen w-56 flex-shrink-0`), with `AetherDriveSidebar` opening directly to its right when the `Workspace` navigation item is active. This preserves all existing drawer and keyboard interactions while fulfilling R1.

2. **Typography Compliance (Observation 2 -> Sans-Serif / Monospace Scoping)**:
   Removing `font-mono` from `<body class="...">` in `ui/index.html` and setting `font-sans` on the root viewport ensures interface labels comply with R1 ("Typography: sans-serif for interface labels and monospace for terminal output and code"). Monospace is explicitly applied to `XtermWebGLPane`, `<kbd>` badges, code snippets, and input bar command text.

3. **Theme Integrity & Persistence (Observations 3, 4, 6 -> R6 Design Tokens)**:
   Updating the default theme in `aetherStore.ts` to `'aethercortex-dark'`, fixing the light mode cyan token to `#00A3AD`, and adding a reactive `useEffect` in `XtermWebGLPane.tsx` that updates `term.options.theme = activeTheme.xterm` guarantees that theme switches (persisted in `localStorage.getItem('aether_theme')`) propagate seamlessly to the terminal canvas.

4. **Strict Compliance Auditing (Observations 5 & 7 -> Clean Production Bar)**:
   Eliminating the 5 "BYOK" instances and renaming "Modern Input Bar" to "Input Bar" guarantees complete compliance with user-facing copy restrictions without breaking any underlying IPC commands. Maintaining 0 emoji characters satisfies the static audit acceptance criteria.

---

## 3. Caveats

- **Tauri Window Controls**: In Tauri desktop builds on Linux/Wayland, window controls (close, minimize, maximize) may either be managed by the window manager or rendered inside the custom header. The top header bar should reserve right-aligned space for window control buttons when running under Tauri desktop mode.
- **Terminal WebGL Context Loss on Fast Resizes**: When the persistent left sidebar or AI Assistant panel is toggled, the terminal viewport changes dimensions. Calling `fitTerminal()` debounced via `requestAnimationFrame` ensures zero WebGL2 context loss or canvas distortion.

---

## 4. Conclusion

The existing `ui/` codebase is healthy, well-tested, and builds cleanly. Implementing R1 and R6 does not require breaking existing terminal multiplexing or workspace search functionality.

The architectural deliverable in `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_ui/survey_report.md` establishes:
1. A drop-in `PersistentLeftSidebar` component with the AetherCortex SVG logo, 4 navigation items with active indicator bars, and bottom branding (`| BETTER TOOLS. BIGGER POSSIBILITIES.` and `///`).
2. A unified 3-column layout where the persistent sidebar anchors the left, the collapsible `AetherDriveSidebar` acts as the Workspace drawer, the main terminal remains interactive at the center, and the AI Assistant panel docks on the right.
3. Complete semantic CSS design tokens for Dark Mode (`#050809` / `#0B1013` / `#00F0FF`) and Light Mode (`#F8F9FA` / `#FFFFFF` / `#00A3AD`) with flat colors, zero gradients, zero glassmorphism, zero emojis, and reactive terminal synchronization.

---

## 5. Verification Method

To independently verify all findings and validate implementations:

1. **Build Verification**:
   ```bash
   cd /home/rasshqa/projects/Elliot/ui && npm run build
   ```
   Must exit with code 0 and 0 TypeScript compilation errors.

2. **Frontend Test Suite Verification**:
   ```bash
   cd /home/rasshqa/projects/Elliot && node --test ui/tests/*.test.ts
   ```
   Must pass 100% of the 74 existing tests.

3. **Backend Workspace Verification**:
   ```bash
   cd /home/rasshqa/projects/Elliot && cargo check --workspace && cargo test --workspace
   ```
   Must pass with 0 errors and all 86 unit and integration tests green.

4. **Static Emoji Audit Verification**:
   ```bash
   python3 -c "
   import os, unicodedata
   emojis = []
   for root, _, files in os.walk('ui/src'):
       for f in files:
           if f.endswith(('.ts', '.tsx', '.css', '.html')):
               with open(os.path.join(root, f), 'r', encoding='utf-8') as fp:
                   for lno, line in enumerate(fp, 1):
                       for ch in line:
                           c = ord(ch)
                           if (0x1F300 <= c <= 0x1F9FF) or (0x2600 <= c <= 0x27BF) or (0x1F600 <= c <= 0x1F64F):
                               emojis.append((f, lno, ch))
   assert len(emojis) == 0, f'Found emojis: {emojis}'
   print('Zero emojis verified!')
   "
   ```

5. **Forbidden Term Verification**:
   ```bash
   ! grep -rn "BYOK" ui/src/
   ```
   Must return 0 matching lines.

---

## 6. Remaining Work (Soft Handoff to Implementation Agents)

For implementation agents taking over Phase 2 execution:

1. **Create `ui/src/components/PersistentLeftSidebar.tsx`**:
   Insert the complete React component defined in Section 7 of `survey_report.md`.
2. **Update `ui/tailwind.config.js` and `ui/src/index.css`**:
   Add `--cortex-*` tokens and configure `fontFamily.sans`.
3. **Mount in `ui/src/main.tsx`**:
   Wrap the main workspace with `<PersistentLeftSidebar />`, add `AI Connected` status pill in the top header, and update `index.html` title and font classes.
4. **Fix XTerm Reactive Theme Updates**:
   Update `XtermWebGLPane.tsx` to watch `store.currentTheme` and apply `activeTheme.xterm`.
5. **Clean up Copy**:
   Replace the 5 occurrences of "BYOK" in `AiSettingsModal.tsx`, `main.tsx`, and `OrchestratorBar.tsx`.
   Rename user-facing "Modern Input Bar" references to "Input Bar".
6. **Update Knowledge Graph**:
   Run `graphify update .` to synchronize knowledge base.
