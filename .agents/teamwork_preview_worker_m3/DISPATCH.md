# DISPATCH — Worker M3: Aether Drive Sidebar Component & State Persistence (R1)

## Mission
Implement Requirement R1: The interactive, collapsible Aether Drive Sidebar (`Cmd+\` / `Ctrl+\`) with responsive workspace file tree (directory expand/collapse, file inspection card), integrated workspace text search panel, quick access to saved markdown workflows, and state persistence.

## Mandatory Inputs (Read first!)
- Original User Request: `/home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md`
- Project Architecture & Scope: `/home/rasshqa/projects/Elliot/PROJECT.md`
- UI Survey Blueprint: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_1/handoff.md`
- Backend APIs Implemented in M1: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m1_fix/handoff.md`
- Your Working Directory: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m3`
- Parent Conversation ID: `b4b0fa97-873a-4908-ab8b-7c3e9bde85fa`

## Write Ownership
You exclusively own and may modify:
- `ui/src/components/AetherDriveSidebar.tsx` (create new component)
- `ui/src/main.tsx` (dock sidebar inside `<main>` next to `TerminalGrid`, add toggle button in `<header>`)
- `ui/src/stores/aetherStore.ts` (add sidebar state, actions, shortcuts, and IPC calls)
- `ui/tests/` (add tests)
Do NOT modify Rust backend files.

## Technical Specifications
1. **Shortcut & Header Toggle (F13)**:
   - In `ui/src/stores/aetherStore.ts`:
     - Global shortcut: `(e.ctrlKey || e.metaKey) && (e.key === '\\' || e.code === 'Backslash')` toggles `toggleAetherDriveSidebar()`.
     - Prevent browser default: `e.preventDefault()`.
     - State persistence in `localStorage`:
       - `aether_drive_sidebar_open`: boolean string ('true' / 'false')
       - `aether_drive_active_tab`: 'tree' | 'search' | 'workflows'
       - Initial state rehydrates synchronously from `localStorage`.
   - In `ui/src/main.tsx`:
     - Add Drive Sidebar button in top header immediately after Aether logo:
       Includes `FolderTree` icon from `lucide-react`, label "Drive", keyboard badge "Ctrl+\", active highlight style.
2. **Main Layout Docking (F9)**:
   - In `ui/src/main.tsx`:
     ```tsx
     <main className="flex-1 w-full relative overflow-hidden bg-slate-950 flex flex-row">
       <AetherDriveSidebar />
       <div className="flex-1 h-full relative overflow-hidden min-w-0">
         <TerminalGrid registerTermWriter={registerTermWriter} />
       </div>
     </main>
     ```
   - When open: `AetherDriveSidebar` takes `w-80 border-r border-slate-800 shrink-0 h-full flex flex-col bg-slate-950/95 backdrop-blur z-20`.
   - When closed: collapsed / unmounted so `TerminalGrid` occupies 100% width.
3. **Responsive Workspace File Tree Panel (F10)**:
   - Tab switcher: `[Files]` / `[Search]` / `[Workflows]`.
   - Workspace directory tree:
     - Lazy loading directory items via `cmd_read_workspace_directory` (with mock fallback if running outside native Tauri).
     - Expansion/collapse carets with persistent expanded folder paths in React state / localStorage.
     - Distinguishes file types with appropriate icons and colors (Markdown, Rust, TS, JSON, Shell, config).
     - File Inspection Card on click:
       - Displays relative path, file size, line count.
       - Scrollable read-only preview of file content via `cmd_read_workspace_file`.
       - Action buttons:
         - `[Open in Terminal]`: Sends `cat <path>\n` or opens in active pane.
         - `[Copy Path]`: Copies path to clipboard.
         - `[Ask AI]`: Calls `routePromptToAgent("Explain " + path, activePaneId)`.
         - `[Claim Lock]`: Calls `claimModule([path])`.
4. **Workspace Text Search Panel (F11)**:
   - Debounced search input.
   - Invokes `cmd_search_workspace_files(workspace_id, query, 100)` (with mock fallback if outside Tauri).
   - Groups results by file with match counts.
   - Shows line number and preview snippet for each match.
   - Clicking match opens file inspection card for that file.
5. **Saved Workflows Quick Access (F12)**:
   - Lists `.md` workflows from `store.workflows` (synced via `loadWorkflows()` from `.aether/vault/Workflows/*.md`).
   - Search filter for workflows by title or description.
   - Parameter inputs for templates containing `{{param}}`.
   - `[Run in Active Pane]` button executing `runWorkflow(wf.commandTemplate, values)`.

## Mandatory Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A teamwork_preview_auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

## Verification Requirements
You MUST run:
```bash
cd /home/rasshqa/projects/Elliot/ui
npx tsc --noEmit && npm run build
```
Verify exit code 0 and 0 errors.
Add and execute automated tests covering sidebar toggle, shortcut listener, tree state, and search panel.

## Deliverable
Write your report to `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m3/handoff.md` and notify parent via `send_message`.

## 2026-10-24T04:01:39Z
Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m3/DISPATCH.md, /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md, and /home/rasshqa/projects/Elliot/PROJECT.md.
Implement Milestone 3: Aether Drive Sidebar Component (ui/src/components/AetherDriveSidebar.tsx), docking in main.tsx, Cmd+\ / Ctrl+\ shortcuts and state persistence in ui/src/stores/aetherStore.ts.
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work.
Verify with `npx tsc --noEmit && npm run build` in ui/ and add automated tests.
Write your handoff report to /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m3/handoff.md and send a message when done.
