# DISPATCH — Worker M2: Intelligent Natural Language vs Shell Classifier (R2)

## Mission
Implement the intelligent natural language vs shell command auto-detection engine, real-time visual feedback badge in `ModernInputBar.tsx`, and seamless agent routing in `ui/src/stores/aetherStore.ts` (Requirement R2).

## Mandatory Inputs (Read first!)
- Original User Request: `/home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md`
- Project Architecture & Scope: `/home/rasshqa/projects/Elliot/PROJECT.md`
- Technical Specification & Blueprint: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_explorer_survey_1/handoff.md`
- Your Working Directory: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m2`
- Parent Conversation ID: `b4b0fa97-873a-4908-ab8b-7c3e9bde85fa`

## Write Ownership
You exclusively own and may modify:
- `ui/src/utils/commandClassifier.ts` (create new file)
- `ui/src/components/ModernInputBar.tsx`
- `ui/src/stores/aetherStore.ts` (add `routePromptToAgent` and export if needed)
- `ui/tests/` or unit test files for the classifier

## Tasks to Implement
1. **Create `ui/src/utils/commandClassifier.ts`**:
   - Implement `export function classifyCommand(input: string, detectedToolNames?: string[]): ClassificationResult`.
   - Heuristics:
     - Explicit `#`: returns `natural_language` (`suggestedMode: 'ai'`).
     - Explicit `$`: returns `shell` (`suggestedMode: 'cmd'`).
     - Path-based executables (`./`, `/`, `../`, `~`): `shell`.
     - Environment variable assignments (`FOO=bar`): `shell`.
     - Shell syntax operators and CLI flags (`|`, `>`, `<`, `;`, `&`, `&&`, `$VAR`, `--flag`, `-f`): `shell`.
     - Recognized CLI binary names (`git`, `cargo`, `npm`, `docker`, `ls`, etc.): `shell` unless followed by conversational phrasing.
     - Natural language interrogatives (`how`, `why`, `what`, `where`, `can you`, `please`, `help`, `explain`, `tell me`, `find all`, `debug`, `fix`): `natural_language`.
     - Punctuation (`?`, `!` at end): `natural_language`.
     - English stop-words frequency (`the`, `is`, `a`, `an`, `in`, `on`, `for`, `with`): `natural_language`.
     - Zero-latency synchronous execution on every keystroke.
2. **Update `ui/src/components/ModernInputBar.tsx`**:
   - Replace static `value.startsWith('#')` with dynamic classification from `classifyCommand(value, detectedToolNames)`.
   - Update Mode Badge on left of input bar:
     - Show `$ CMD` (Cyan) or `✨ AI (Auto)` / `# AI` (Indigo).
     - Tooltip showing auto-detected reason and confidence percentage.
     - Allow manual click on badge to pin/toggle mode.
   - On `submit()`:
     - When mode is `ai`:
       - If active pane is an agent pane, send `${cleanInstruction}\n` directly without prepending `#`.
       - If active pane is a regular shell pane, call `routePromptToAgent(cleanInstruction, paneId)` to forward to an active/spawned agent pane without `#` prefixing or shell syntax errors.
     - When mode is `cmd`: execute shell command via `executeCommandInPane`.
3. **Update `ui/src/stores/aetherStore.ts`**:
   - Implement `export async function routePromptToAgent(instruction: string, sourcePaneId?: string, targetCli?: string): Promise<AgentPane | null>`.
   - Strips leading `#` from instruction.
   - Finds an active agent pane (or spawns one if none active).
   - Sets it active and sends `${instruction}\n` to its PTY cleanly.
4. **Unit Tests**:
   - Create comprehensive unit tests for `classifyCommand` verifying representative shell commands, natural language questions, boundary edge cases, command-name collisions, and empty inputs.

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

## Deliverable
Write your report to `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m2/handoff.md`.
Report:
- Observation (what was changed and implemented)
- Logic Chain
- Exact verification output
- Caveats & Conclusion
Notify parent via `send_message` when done.

## 2026-10-24T03:44:42Z
Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m2/DISPATCH.md, /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md, and /home/rasshqa/projects/Elliot/PROJECT.md.
Implement Milestone 2: Intelligent Natural Language vs Shell Classifier (ui/src/utils/commandClassifier.ts), real-time badge in ModernInputBar.tsx, and routePromptToAgent in ui/src/stores/aetherStore.ts.
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work.
Verify your changes with `npx tsc --noEmit && npm run build` in ui/ and run unit tests.
Write your handoff report to /home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m2/handoff.md and send a message when done.
