# DISPATCH — Spec Miner 3 (Specification, Test Suite & Verification Matrix)

## Mission
Investigate and enumerate precise requirements, existing test suites, build configurations, and verification criteria across the entire project for Phase 2:
1. Audit existing test suites: `cargo test --workspace` (what are the 32+ tests, where are they defined), UI test setup, and build pipelines (`npx tsc --noEmit && npm run build` in `ui`).
2. Map functional acceptance criteria from `ORIGINAL_REQUEST.md` to concrete test cases across Tiers 1-4 (Feature Coverage, Boundary/Corner, Cross-Feature, Real-World Scenarios).
3. Identify how natural language classification can be verified deterministically (patterns, heuristics, ambiguity tests).
4. Identify how persistence (sidebar toggle state, terminal buffers across remount) can be tested.
5. Check `graphify` configuration and status (`graphify-out/`).

## Mandatory Inputs
- Original User Request: `/home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md` (Read this first before proceeding!)
- Workspace Root: `/home/rasshqa/projects/Elliot`
- Your Working Directory: `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_3`
- Parent Conversation ID: `b4b0fa97-873a-4908-ab8b-7c3e9bde85fa`

## Guidance
- Check existing `cargo test` files, `package.json` in `ui/` and workspace root, CI scripts or test harnesses.
- Detail the exact command lines, environments, dependencies, and test targets.
- Formulate the 4-tier test plan required by the Project Pattern.

## Deliverable
Write your findings and recommendations to `/home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_3/handoff.md`.
Follow the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Recommendations).
Notify parent via `send_message` when done.

## 2026-10-24T02:54:30Z
User Request:
Read /home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_3/DISPATCH.md and /home/rasshqa/projects/Elliot/.agents/ORIGINAL_REQUEST.md.
Investigate project specifications, tests, and build verification.
Audit existing tests (the 32+ cargo tests, UI tests/build scripts), and design the 4-tier E2E testing matrix covering R1, R2, R3 and build verification.
Check graphify status in graphify-out/.
Write your complete findings and recommendations to /home/rasshqa/projects/Elliot/.agents/teamwork_preview_spec_miner_survey_3/handoff.md.
Send a message back to parent when done.
