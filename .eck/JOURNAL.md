---
task_id: telemetry-token-weights-sync
date: 2026-03-01
type: feat
scope: telemetry,cli
summary: Implement global token weights synchronization via Telemetry Hub
---

# Global Token Weights Sync

- Added `GET /T/tokens/weights` endpoint to `eck-telemetry` Rust service
- On-the-fly linear regression over `token_training` table, grouped by `project_type`
- `addTrainingPoint()` now auto-pushes each new data point to `xelth.com/T/tokens/train`
- New exported `syncTokenWeights()` fetches global coefficients and merges into local `.eck/token-training.json`
- New CLI command: `eck-snapshot telemetry sync-weights`

**Modified Files**:
- `eck-telemetry/src/handlers.rs`: `TokenRow`, `WeightsResponse`, `get_weights` handler
- `eck-telemetry/src/main.rs`: registered `GET /T/tokens/weights`
- `src/utils/tokenEstimator.js`: push on train + `syncTokenWeights` export
- `src/cli/cli.js`: `telemetry sync-weights` subcommand

---
task_id: telemetry-push-client
date: 2026-02-28
type: feat
scope: telemetry,cli
summary: Integrate Telemetry Hub push client for agent execution reports
---

# Telemetry Push Client

- Created `src/utils/telemetry.js`: `parseAgentReport()` + `pushTelemetry()`
- Parses `.eck/lastsnapshot/AnswerToSA.md` for model_name, status, task_scope, error_summary
- POSTs to `xelth.com/T/report`; appends `[TELEMETRY: PUSHED]` marker to prevent re-sends
- `updateSnapshot` awaits `pushTelemetry` after snapshot creation (silent)
- `updateSnapshotJson` fire-and-forgets to avoid polluting JSON stdout
- New manual command: `eck-snapshot telemetry push`

**Modified Files**:
- `src/utils/telemetry.js` (new)
- `src/cli/cli.js`: telemetry command group
- `src/cli/commands/updateSnapshot.js`: auto-push hooks

---
task_id: eck-telemetry-microservice
date: 2026-02-28
type: feat
scope: telemetry
summary: Create eck-telemetry Rust microservice for agent metrics
---

# eck-telemetry Microservice

- New Rust service (`eck-telemetry/`) using Axum + SQLx + PostgreSQL
- Endpoints: `GET /T/health`, `POST /T/report`, `POST /T/tokens/train`
- `agent_runs` table: model_name, agent_role, task_scope, status, duration_sec, error_summary
- `token_training` table: project_type, file_size_bytes, actual_tokens
- Deployment via `deploy_telemetry.sh` (builds on server `antigravity`, systemd service)
- Nginx proxy: `xelth.com/T/*` → `localhost:3203`

---
task_id: jaz-mode-opencode-isolation
date: 2026-02-28
type: refactor
scope: ja,cli
summary: Isolate Claude/OpenCode environments, remove --jag, add --jaz mode
---

# OpenCode Environment Isolation + JAZ Mode

- Added `--jaz` flag: generates `AGENTS.md` for OpenCode with GLM-4.7 configuration
- Removed `--jag` flag (Gemini integration deprecated in favor of GLM Z.AI)
- `opencodeAgentsGenerator.js`: generates YAML frontmatter + body for jaz/coder modes
- `setupMcp.js`: unified MCP setup for Claude Code + OpenCode
- Claude and OpenCode environments now strictly isolated (separate config, separate MCP servers)

---
task_id: identity-trace-protocol
date: 2026-02-28
type: feat
scope: prompts
summary: Enforce Identity Trace in all agent reports
---

# Identity Trace Protocol

- All agent report templates now require `**Executor:** [Model Name]` field
- Enables accurate telemetry attribution per model
- Updated `CLAUDE.md` generator and OpenCode templates

---
task_id: fix-jas-jao-content-and-headers
date: 2026-01-04T00:00:00Z
type: fix
scope: core
---

# Restore full content for JAS/JAO snapshots and fix header interpolation

**Critical Fixes:**

1. **Reverted "Structural Only" Logic**:
   - JAS/JAO snapshots now include FULL code content
   - Senior Architect needs complete visibility to make informed decisions
   - Removed lightweight scanning path that excluded file content
   - All modes now use `processProjectFiles` for consistent full content

2. **Fixed Header Interpolation**:
   - `aiHeader.js` now correctly handles JAS and JAO modes
   - Added template variable replacement for JAS and JAO
   - Previously only JAG mode had proper header customization

**Modified Files**:
- `src/cli/commands/createSnapshot.js`: Removed conditional content logic
- `src/utils/aiHeader.js`: Added JAS/JAO header interpolation

**Testing**: All 18 tests pass ✅

---
task_id: compact-protocol-refactor
date: 2026-01-04T00:00:00Z
type: refactor
scope: cli
---

# Implement Compact Protocol: Short Naming, JAS Snapshots, and Update Sequencing

- **Timestamp Format**: Changed from `YYYY-MM-DD_HH-mm-ss` to `YY-MM-DD_HH-mm` (2-digit year, no seconds)
- **Snapshot Naming**: Updated to compact format `eck{timestamp}_{hash}_{suffix}.md`
- **Update Sequencing**: Implemented sequential numbering (`_up1`, `_up2`, etc.)
  - Tracked in `.eck/update_seq` file
  - Counter resets when base snapshot changes

**Modified Files**:
- `src/utils/fileUtils.js`: Compact timestamp generation
- `src/cli/commands/createSnapshot.js`: Always generate snapshot
- `src/cli/commands/updateSnapshot.js`: Sequential update numbering

---
task_id: smart-header-implementation
date: 2026-01-25
type: feat
scope: core, utils
summary: Implement Smart Header injection for strategic context
---

# Smart Header + Update Snapshot Bug Fix

- Smart Header auto-injects strategic context (Roadmap, Tech Debt, Operations) into system prompt
- Fixed critical bug in update snapshot: agentReport variable was undefined
- Added force visibility for `.eck` directory files in directory tree even if gitignored
- Cleared `alwaysIncludePatterns` in setup.json to prevent file duplication

---
task_id: rename-snap-to-lastsnapshot
date: 2026-01-25
type: refactor
scope: core,cli
summary: Rename .eck/snap to .eck/lastsnapshot and update naming convention
---

# Rename .eck/snap → .eck/lastsnapshot

- `.eck/snap/` renamed to `.eck/lastsnapshot/` for clarity
- Naming convention: `eck{ShortName}{timestamp}` with capitalized first 3 and last 2 chars
- Updated all references in createSnapshot.js, updateSnapshot.js, claudeMdGenerator.js, templates

---
task_id: task-20260101181645-9ecdd64c
date: 2026-01-01
type: feat
scope: core
---

# Add Rust and Go support to Skeletonizer

- Added tree-sitter-rust and tree-sitter-go dependencies
- Implemented Rust/Go function body stripping in skeletonizer.js
- Updated file extension mapping for .rs and .go files





## 2026-03-01 — Agent Report

# Agent Report

Fixed AGENTS.md template path resolution using `__dirname` instead of fragile relative paths, added explicit `.eck/` directory reading instructions to both Coder and Junior Architect templates, and updated TECH_DEBT.md to mark issue as resolved

## 2026-03-01 — Agent Report

# Agent Report

Updated CLAUDE.md templates in src/utils/claudeMdGenerator.js to include explicit instructions for both Architect and Coder agents to read .eck/ directory manifests (CONTEXT.md, ROADMAP.md, TECH_DEBT.md, etc.) before starting tasks. This ensures agents don't rely solely on internal memory to discover project context. Changes include:

- Added "## 2. PROJECT CONTEXT (.eck DIRECTORY)" section to getArchitectInstructions() with directive to read .eck files before taking action
- Added "## PROJECT CONTEXT (.eck DIRECTORY)" section to CODER_INSTRUCTIONS with explicit steps to list .eck files and read relevant manifests
- Renumbered subsequent sections in Architect template accordingly

## 2026-03-01 — Agent Report

# Agent Report

Implemented all 3 tasks from roadmap and tech debt:

1. Fixed `showEstimationStats` (tokenEstimator.js:236-242) to dynamically calculate errors using current polynomial coefficients instead of old stored estimates

2. Added `silent` parameter to `syncTokenWeights` (tokenEstimator.js:143) and integrated fire-and-forget `syncTokenWeights(true)` into the silent `update-auto` agent command (updateSnapshot.js:12,346)

3. Introduced in-memory caching with 5-minute TTL using `Arc<RwLock>` in Rust telemetry service:
   - Added `AppState` struct with `cache` field containing `weights` and `last_updated` (handlers.rs:14-23)
   - Implemented cache validation in `get_weights` (handlers.rs:104-107)
   - Cache invalidation on new training data in `submit_token_data` (handlers.rs:85-90)
   - Updated main.rs to use `AppState::new(pool)` instead of direct `pool` (main.rs:23,35)

All tests passing (18/18).

## 2026-03-01 — Agent Report

# Agent Report

# Report: Architectural Improvements — Fail Flag, Auto-Journaling, RUNTIME_STATE
**Executor:** Claude Opus 4.6 (Claude Code)
**Status:** SUCCESS
**Changes:**
- **cli.js**: Added `-f, --fail` option to both `update` and `update-auto` commands
- **gitUtils.js**: Modified `getChangedFiles` to accept `includeWorkingTree` param — omits `HEAD` from git diff when true, capturing uncommitted changes
- **updateSnapshot.js**: `updateSnapshot()` and `updateSnapshotJson()` now respect `--fail` flag (skip autoCommit, pass flag to getChangedFiles). Added Auto-Journaling logic in `generateSnapshotContent` to prepend AnswerToSA.md content into JOURNAL.md before marking as embedded
- **mcp-eck-core.js**: Added new `eck_fail_task` MCP tool that writes BLOCKED/FAILED report to AnswerToSA.md and runs `update-auto --fail` for emergency snapshot without git commit
- **fileUtils.js**: Added `RUNTIME_STATE.md` to manifest templates with prompt and fallback content
- **claudeMdGenerator.js**: Updated architect instructions — replaced "Run tests" with manual verification, added runtime state checks, added "Challenge the Architect" guidance, added eck_fail_task to workflow
- **coder.template.md**: Updated workflow to include RUNTIME_STATE checks, hypothesis challenging, manual verification, and eck_fail_task
- **junior-architect.template.md**: Added runtime context & critical thinking step, eck_fail_task reference
**Verification:** CLI help output confirms --fail flag on both commands

