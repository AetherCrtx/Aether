# DISPATCH — E2E Test Writer (Milestone 4)

## Mission
Author and execute the comprehensive 4-Tier E2E test suite covering Phase 2 features (R1: Aether Drive Sidebar, R2: Intelligent Command Classifier, R3: Session Resilience), create `TEST_READY.md`, and verify all build acceptance criteria.

## Mandatory Inputs (Read first!)
- Original User Request: `/home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md`
- Project Architecture & Scope: `/home/rasshqa/projects/Elliot/PROJECT.md`
- Spec Miner Survey: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_3/handoff.md`
- Your Working Directory: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_test_writer_m4`
- Parent Conversation ID: `b4b0fa97-873a-4908-ab8b-7c3e9bde85fa`

## Scope & Write Ownership
You own:
- `ui/tests/e2ePhase2.test.ts` (create comprehensive end-to-end test suite)
- `TEST_READY.md` (create at workspace root `/home/rasshqa/projects/Elliot/TEST_READY.md`)

## Tasks to Complete
1. **Author 4-Tier E2E Test Suite (`ui/tests/e2ePhase2.test.ts`)**:
   - **Tier 1: Feature Coverage (R1, R2, R3)**:
     - R1: Sidebar toggle, tab switching, file tree directory listing, inspection card metadata, search filtering, workflow loading & rendering.
     - R2: Lexical classification across shell, explicit markers, interrogatives, imperative verbs, conversational phrasing, agent routing.
     - R3: SSH keepalive injection flags, PTY ring buffer retention, background task detachment & restoration without process kill.
   - **Tier 2: Boundary & Corner Cases**:
     - Extreme inputs: empty strings, whitespace, 10x rapid toggle spams, deep directory paths, large byte inspection truncation, dash queries (`-v`), Unicode case-folding.
   - **Tier 3: Cross-Feature Combinations**:
     - Sidebar navigation while classifier operates; workflow parameter replacement triggering agent dispatch; file inspection "Ask AI" forwarding.
   - **Tier 4: Real-World Scenarios**:
     - Developer exploration workflow: Toggle Drive -> Search "PtyManager" -> Inspect -> Ask AI -> Run workflow -> Verify terminal stability.
2. **Execute Full Project Verification**:
   - `cd ui && node --test tests/e2ePhase2.test.ts tests/commandClassifier.test.ts tests/aetherDriveSidebar.test.ts`
   - `cd ui && npx tsc --noEmit && npm run build`
   - `cargo check --workspace`
   - `cargo test --workspace`
   - `graphify update .`
3. **Create `TEST_READY.md` at Project Root**:
   - Document test runner commands, tier breakdown, coverage counts, and checklist.

## Deliverable
Write your report to `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_test_writer_m4/handoff.md` and notify parent via `send_message`.

## 2026-10-24T04:22:25Z
Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_test_writer_m4/DISPATCH.md, /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md, and /home/rasshqa/projects/Elliot/PROJECT.md.
Author the 4-tier E2E test suite in ui/tests/e2ePhase2.test.ts, create /home/rasshqa/projects/Elliot/TEST_READY.md, and execute the full verification suite (ui build, cargo test, graphify update).
Write your handoff report to /home/rasshqa/projects/Elliot/.agents/teamwork_preview_test_writer_m4/handoff.md and send a message when done.
