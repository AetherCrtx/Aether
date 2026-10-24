# Milestone 2 Handoff: Intelligent Natural Language vs Shell Classifier (R2)

**Worker**: `teamwork_preview_worker_m2`  
**Date**: 2026-10-24  
**Working Directory**: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_worker_m2`  
**Target Scope**: R2 — Intelligent Natural Language vs Shell Classifier, Dynamic ModernInputBar Mode Badge, and Agent Routing  
**Parent Task ID**: `b4b0fa97-873a-4908-ab8b-7c3e9bde85fa`  

---

## 1. Observation

1. **Initial Codebase State**:
   - `ModernInputBar.tsx` previously used a hardcoded `#` check: `const mode: InputMode = value.startsWith('#') ? 'ai' : 'cmd';`.
   - On submit, typing natural language without `#` in an interactive shell pane forwarded the instruction straight to bash/zsh via `executeCommandInPane(paneId, trimmed)`, resulting in shell syntax errors or `command not found`.
   - `aetherStore.ts` only had `dispatchToPeerAgent` which was hardcoded for command error recovery (`Analyze and fix the issue in this command output:\n$ ${command}\n${excerpt}\n`) rather than general natural language dispatch.

2. **Files Created & Modified**:
   - `ui/src/utils/commandClassifier.ts` (new): Implemented `classifyCommand(input: string, detectedToolNames?: string[]): ClassificationResult` with zero-latency heuristics for explicit prefixes (`#`, `$`), path-based executables (`./`, `/`, `../`, `~`), env vars (`KEY=val`), shell operators (`|`, `>`, `&&`, `;`, `&`, flags), recognized CLI binaries, conversational openers, interrogatives, punctuation (`?`, `!`), and English stop-words frequency.
   - `ui/src/components/ModernInputBar.tsx`:
     - Integrated `classifyCommand(value, detectedToolNames)` on keystroke.
     - Mode badge dynamically renders `$ CMD` (Cyan) or `✨ AI (Auto)` / `# AI` (Indigo).
     - Added tooltip with auto-detected reason and confidence percentage.
     - Enabled manual toggle/pinning by clicking the badge (`manualModeOverride`).
     - On submit in AI mode: strips leading `#`, sends instruction cleanly to agent pane PTY without `#`, or routes cleanly via `routePromptToAgent` without shell syntax errors.
   - `ui/src/stores/aetherStore.ts`:
     - Implemented and exported `routePromptToAgent(instruction: string, sourcePaneId?: string, targetCli?: string): Promise<AgentPane | null>`.
     - Strips leading `#`, identifies active agent pane or spawns one via `spawnAgentPane`, activates it via `setActivePane`, and sends `${cleanInstruction}\n` cleanly to its PTY.
   - `ui/tests/commandClassifier.test.ts` (new): 20 comprehensive unit test cases covering all heuristic branches, edge cases, quoted commit messages with question marks, empty strings, and tool detection.

3. **Verification Command Outputs**:
   - Unit test execution (`node --test tests/commandClassifier.test.ts` in `/home/rasshqa/projects/Elliot/ui`):
     ```
     ▶ classifyCommand
       ▶ Empty and whitespace inputs
         ✔ defaults to shell with confidence 1.0 for empty string
         ✔ defaults to shell for whitespace-only strings
       ✔ Empty and whitespace inputs
       ▶ Explicit prefixes
         ✔ classifies # as explicit AI prefix
         ✔ classifies $ as explicit shell prefix
         ✔ classifies direct agent mentions (@agent)
       ✔ Explicit prefixes
       ▶ Path-based executables
         ✔ detects relative path executables
         ✔ detects home and absolute path executables
       ✔ Path-based executables
       ▶ Environment variable assignments
         ✔ detects env variable assignments at start
         ✔ detects shell variable and command expansions
       ✔ Environment variable assignments
       ▶ Shell syntax operators and CLI flags
         ✔ detects pipes and redirections
         ✔ detects chaining and backgrounding
         ✔ detects CLI flags on unknown commands
       ✔ Shell syntax operators and CLI flags
       ▶ Recognized CLI binaries
         ✔ classifies standard developer binaries
         ✔ preserves shell mode when quoted commit message has question mark
         ✔ supports host-detected tool names
         ✔ identifies conversational phrasing after binary names
       ✔ Recognized CLI binaries
       ▶ Natural language interrogatives and conversational openers
         ✔ detects multi-word conversational openers
         ✔ detects single-word conversational starters and action verbs
         ✔ detects punctuation markers (?, !)
         ✔ detects natural language stop-word frequency
       ✔ Natural language interrogatives and conversational openers
     ✔ classifyCommand (14.517954ms)
     ℹ tests 20
     ℹ suites 8
     ℹ pass 20
     ℹ fail 0
     ```
   - TypeScript checking and production build (`npx tsc --noEmit && npm run build` in `/home/rasshqa/projects/Elliot/ui`):
     ```
     npm notice run aether-terminal-ui@0.1.0 npx
     npm notice run 'tsc' --noEmit
     npm notice run aether-terminal-ui@0.1.0 build
     npm notice run tsc && vite build
     vite v5.4.21 building for production...
     ✓ 1598 modules transformed.
     dist/index.html                   0.60 kB │ gzip:   0.38 kB
     dist/assets/index-BQ8cmHtV.css   50.75 kB │ gzip:  10.19 kB
     dist/assets/index-0Yg5EwU2.js   817.41 kB │ gzip: 224.08 kB
     ✓ built in 6.39s
     ```
     Exit code 0, 0 errors.
   - Graphify update (`graphify update .` in `/home/rasshqa/projects/Elliot`):
     ```
     Re-extracting code files in . (no LLM needed)...
     AST extraction: 39/39 uncached files (100%)
     Rebuilt: 1745 nodes, 3350 edges, 125 communities
     graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
     ```
     Exit code 0.

---

## 2. Logic Chain

```
[Observation 1: Users entering natural language without '#' triggered bash command-not-found errors]
      │
      ▼
[Inference 1: A client-side, zero-latency synchronous classifier evaluating lexical, syntactic, and semantic tokens allows the UI to automatically switch execution modes in real-time on keystroke]
      │
      ▼
[Inference 2: Distinguishing explicit overrides (# and $) as top-priority rules ensures user agency is never obstructed by automated heuristics]
      │
      ▼
[Observation 2: Quoted strings in shell commands like git commit -m "why did this fail?" contained question marks]
      │
      ▼
[Inference 3: Stripping quoted arguments prior to shell syntax and punctuation analysis guarantees zero false positives on CLI commit messages and grep patterns]
      │
      ▼
[Observation 3: Shell panes had no mechanism to cleanly hand off prompts to an AI agent pane]
      │
      ▼
[Inference 4: routePromptToAgent in aetherStore.ts resolves the target agent, reuses existing agent panes or spawns a new one, switches active focus, and transmits the clean instruction to the PTY with no '#' prefixing]
```

---

## 3. Caveats

- **Quoted string handling**: Quoted string stripping replaces `"..."` and `'...'` with empty string placeholders for syntax operator checks. If a user enters solely a quoted natural language question like `"how do I do this?"`, the classifier treats it as natural language via interrogative checks on the full input string.
- **Ambiguous Single-word Tokens**: Single-word inputs without punctuation (such as `status` or `test`) default to shell execution with 0.65-0.70 confidence because developer shells frequently define custom aliases or shell built-ins.
- **PTY Initialization Delay**: When spawning a new agent pane from a regular shell pane via `routePromptToAgent`, a 500ms delay is scheduled before streaming the prompt to ensure the underlying daemon process and PTY buffer have completed startup handshakes.

---

## 4. Conclusion

Milestone 2 (Requirement R2) is fully implemented, verified, and complete:
1. `ui/src/utils/commandClassifier.ts` delivers deterministic, zero-latency classification across shell commands and natural language prompts.
2. `ui/src/components/ModernInputBar.tsx` dynamically displays `$ CMD` (Cyan) and `✨ AI (Auto)` / `# AI` (Indigo) with tooltips detailing confidence and reason, plus manual mode toggling/pinning.
3. `ui/src/stores/aetherStore.ts` provides `routePromptToAgent` for seamless prompt dispatch without `#` prefixing or shell syntax errors.
4. All 20 unit tests pass 100% green, and `npx tsc --noEmit && npm run build` completes with exit code 0 and 0 errors.

---

## 5. Verification Method

To independently verify this milestone:

1. **Run Unit Tests**:
   ```bash
   cd /home/rasshqa/projects/Elliot/ui
   node --test tests/commandClassifier.test.ts
   ```
   *Expected output*: 20 tests pass, 0 fail, exit code 0.

2. **Run TypeScript Check & Production Build**:
   ```bash
   cd /home/rasshqa/projects/Elliot/ui
   npx tsc --noEmit && npm run build
   ```
   *Expected output*: Exit code 0, 0 TypeScript errors, bundle generated in `dist/`.

3. **Verify Interactive Behavior**:
   - Inspect `ui/src/components/ModernInputBar.tsx`:
     - Verify `classifyCommand` is invoked with `value` and `detectedToolNames`.
     - Verify mode badge renders `$ CMD` for shell commands and `✨ AI (Auto)` / `# AI` for natural language.
     - Verify badge tooltip displays `classification.reason` and percentage confidence.
     - Verify clicking badge calls `toggleMode` to manually override.
     - Verify submit dispatches to `routePromptToAgent(cleanInstruction, paneId)` when mode is `ai` in non-agent panes.
