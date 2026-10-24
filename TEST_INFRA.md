# E2E Test Infra: AetherCortex UI/UX Refactor & AI Integration

## Test Philosophy
- Opaque-box, requirement-driven, deterministic.
- Derives directly from ORIGINAL_REQUEST.md requirements (R1 through R6).
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Testing + Real-World Workload Testing across 4 distinct tiers.

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---------|-------------|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| F1 | Neo-Brutalist Theme Tokens | R1, R6 | 5 | 5 | Yes | Yes |
| F2 | Typography Scoping | R1 | 5 | 5 | Yes | Yes |
| F3 | Persistent Left Sidebar | R1 | 5 | 5 | Yes | Yes |
| F4 | Workspace Drawer Integration | R1 | 5 | 5 | Yes | Yes |
| F5 | Zero-Emoji Compliance | Acceptance | 5 | 5 | Yes | Yes |
| F6 | Prohibited Copy Removal ("BYOK" Ban) | R5 | 5 | 5 | Yes | Yes |
| F7 | Reactive Terminal Theme Sync | R6 | 5 | 5 | Yes | Yes |
| F8 | Unified Provider Store State | R4, R5 | 5 | 5 | Yes | Yes |
| F9 | Full Provider Matrix Support | R5 | 5 | 5 | Yes | Yes |
| F10 | Custom Provider CRUD | R5 | 5 | 5 | Yes | Yes |
| F11 | Live Connection Testing & Key Masking | R5 | 5 | 5 | Yes | Yes |
| F12 | Settings Modal Provider Management | R5 | 5 | 5 | Yes | Yes |
| F13 | Main Terminal Engine Preservation | R2 | 5 | 5 | Yes | Yes |
| F14 | Terminal Tab & Split Controls | R2 | 5 | 5 | Yes | Yes |
| F15 | Top Bar with AI Connected Pill | R2 | 5 | 5 | Yes | Yes |
| F16 | Input Bar Auto-Height | R4 | 5 | 5 | Yes | Yes |
| F17 | Shell Protection Guard | R4 | 5 | 5 | Yes | Yes |
| F18 | Input Bar Synchronized Selector | R4 | 5 | 5 | Yes | Yes |
| F19 | Concise Placeholder Copy | R4 | 5 | 5 | Yes | Yes |
| F20 | Side-by-Side AI Assistant Panel | R3 | 5 | 5 | Yes | Yes |
| F21 | Markdown & Code Block Copy | R3 | 5 | 5 | Yes | Yes |
| F22 | Technical Info Cards | R3 | 5 | 5 | Yes | Yes |
| F23 | Streaming, Loading & Error States | R3 | 5 | 5 | Yes | Yes |
| F24 | Assistant Synchronized Selector | R3, R4 | 5 | 5 | Yes | Yes |
| F25 | History & Contextual Assistance | R3 | 5 | 5 | Yes | Yes |

## Test Architecture
- **Location**: `ui/tests/aetherCortexE2E.test.ts`
- **Runner**: Node.js native test runner (`node --test ui/tests/aetherCortexE2E.test.ts`)
- **Supplementary Suites**: `ui/tests/commandClassifier.test.ts`, `ui/tests/aetherDriveSidebar.test.ts`, `ui/tests/aiPilot.test.ts`
- **Pass/Fail Semantics**: 100% green exit code 0. Zero warnings, zero uncaught promise rejections.

## Coverage Thresholds
- Tier 1: >= 5 tests per feature (happy-path isolation)
- Tier 2: >= 5 tests per feature (boundaries, extremes, empty values, invalid inputs)
- Tier 3: Pairwise cross-feature combinations (provider synchronization, theme reactivity during split pane changes, drawer vs AI panel simultaneous toggle)
- Tier 4: Realistic user application scenarios (full end-to-end user workflows)
