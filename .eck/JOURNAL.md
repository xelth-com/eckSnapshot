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





















## 2026-03-08 — Agent Report

# Agent Report

# Task Complete: NPM Keywords & Footer Alignment

## Changes
- **`package.json`**: Added `keywords` array with 11 SEO terms (ai, llm, mcp, snapshot, context, claude, gemini, grok, chatgpt, agent, prompt)
- **`README.md`**: Changed footer from centered to right-aligned, removed extra `<br>`

## 2026-03-08 — Agent Report

# Agent Report

# Task Complete: README Additions

## Changes
- **`README.md`**: Added three new sections before License:
  1. **Roadmap** — NotebookLM optimization planned
  2. **Ethical Automation Policy** — strict ban on Playwright/Puppeteer browser spoofing
  3. **Footer** — "made in Eschborn" centered at bottom

## 2026-03-07 — Agent Report

# Agent Report

# Task Complete: Refine AI Prompt Suggestion

## Changes
- `src/cli/commands/createSnapshot.js` line 930: Removed "Claude" from large file tip (200k context too small for full snapshots)
- Line 932: Changed "copy and paste this exact prompt along with your snapshot file" → "copy and paste this exact text as your FIRST prompt along with the snapshot file"

## 2026-03-07 — Agent Report

# Agent Report

# Task Complete: Merge Workflow Sections, Clarify Auto-Updates, Remove Version Numbers

## Changes Made

### 1. `README.md`
- Merged "Battle-Tested Workflow" and "Quick Start" into a single unified section with numbered steps (Install → Snapshot → Execute → Updates)
- Clarified that local coders auto-sync via `eck_finish_task` MCP tool; manual `eck-snapshot update` is optional for human-made changes
- Removed model version numbers: "Gemini 1.5 Pro" → "Gemini", "Grok 3" → "Grok", "GLM-4.7" → "GLM"

### 2. `src/cli/cli.js`
- Updated "Working & Updating" help text to explain that local coders auto-sync via MCP, manual update is for human changes only

## No Issues

## 2026-03-07 — Agent Report

# Agent Report

# Task Complete: Refocus Documentation on Battle-Tested Workflow

## Changes Made

### 1. `README.md` (full rewrite)
- Replaced generic feature list with "Battle-Tested Workflow" author's note section
- Core Features now highlight: Delta Updates, SecretScanner, MCP Integration, .eck Manifest
- Moved Royal Court, Skeleton Mode, and Telemetry Hub to "Experimental / Advanced Features" section with community call-to-action
- Removed AI Swarm Setup and Token Estimation sections (moved to experimental context)

### 2. `src/cli/cli.js` (2 edits)
- Replaced Skeleton Mode-first workflow (steps 1-3) with Full Snapshot workflow (steps 1-2)
- Removed "Lazy Loading" step (show command still available but not featured)
- Added "Experimental Features" note at the bottom of help text pointing to `--help` for advanced flags

## No Issues

## 2026-03-07 — Agent Report

# Agent Report

# Task Complete: Update AI Model Recommendations

## Changes Made (5 files)

1. **`README.md`** — Updated Royal Court description to list Claude/Gemini/Grok as primary, with a note that ChatGPT works but is slower.
2. **`src/cli/cli.js`** (2 edits) — Updated help guide header from "Gemini/ChatGPT" to "Claude/Gemini/Grok" with a ChatGPT note. Updated profile guide suggestion from "Gemini 1.5 Pro" to "Gemini, Claude, or Grok".
3. **`src/cli/commands/createSnapshot.js`** — Changed prompt suggestion header to "Crucial for ChatGPT, helpful for others" and added a yellow tip line recommending Claude/Gemini/Grok.
4. **`src/cli/commands/generateProfileGuide.js`** — Updated AI recommendation from "Gemini 1.5 Pro, Claude Opus, ChatGPT" to "Gemini, Claude, Grok".

## No Issues

## 2026-03-07 — Agent Report

# Agent Report

# Task Complete: Update AI Prompt Suggestion

## Change
- `src/cli/commands/createSnapshot.js` line 932: Changed prompt from `Reply "Ready" when you have analyzed the project state.` to `then await my first task.`
- Prevents LLMs from auto-analyzing and potentially hallucinating project state before the user gives a task.

## 2026-03-07 — Agent Report

# Agent Report

# Task Complete: AI Prompt Suggestion in CLI Output

## Changes Made

### `src/cli/commands/createSnapshot.js` (line ~927)
- Added a new output block after the token training command section
- Displays a copy-pasteable prompt in cyan bold that users can paste into ChatGPT/Gemini alongside the snapshot file
- Prompt text: *"Read the SYSTEM DIRECTIVE at the very beginning of the attached file. Immediately assume the role of Senior Architect as instructed. Reply 'Ready' when you have analyzed the project state."*
- Uses already-imported `chalk` for styling

## No Issues

## 2026-03-07 — Agent Report

# Agent Report

# Task Complete: Aggressive System Directive in Snapshot Headers

## Changes Made

### 1. `src/templates/multiAgent.md`
- Replaced passive `# AI Instructions` header with `# SYSTEM DIRECTIVE FOR THE ACTIVE AI AGENT`
- Added **CRITICAL** directive forcing any LLM reading the file to immediately assume the Senior Architect role
- Added new "Your Role & Identity" section (Section 1) explicitly defining the role
- Renamed "How to Read This Snapshot" to Section 2, "Core Operational Workflow" to Section 3
- Removed emoji from section headers (🛠️ MANIFEST → MANIFEST, 🛡️ ANTI-TRUNCATION → ANTI-TRUNCATION) for cleaner parsing
- Preserved all functional content (manifest protocol, journal workflow, command formats, agents, etc.)

### 2. `src/utils/aiHeader.js` (line ~690)
- Updated the fallback header (used when `setup.json` fails to load) to include the System Directive preamble
- Fallback now reads: `# SYSTEM DIRECTIVE FOR THE ACTIVE AI AGENT` + CRITICAL instruction before the snapshot info

## Impact
- Any LLM (ChatGPT, Claude, Gemini) receiving a snapshot will be prompted to assume the Architect role immediately instead of acting as a passive observer
- No breaking changes — template variables (`{{repoName}}`, `{{projectOverview}}`, etc.) are unchanged

## 2026-03-07 — Agent Report

# Agent Report

# Report: Update DEFINITION OF DONE blocks across all agent templates

**Status:** SUCCESS

**Changes:**
- `src/templates/opencode/coder.template.md` — replaced OPTION A/B with PRIMARY/FALLBACK, added commit step and user warning
- `src/templates/opencode/junior-architect.template.md` — same replacement, preserved `eck_fail_task` as step 5
- `src/utils/claudeMdGenerator.js` — updated both `getArchitectInstructions()` (architect role) and `CODER_INSTRUCTIONS` constant with new DEFINITION OF DONE
- `CLAUDE.md` (repo root) — updated to match new pattern for current session consistency

**Key improvements:**
1. Fallback now requires `git commit` before `eck-snapshot update` (step 3), preventing "No changes detected" error
2. Agents must warn the user when MCP tool is missing (step 0)
3. Clearer naming: "PRIMARY METHOD" / "FALLBACK METHOD" instead of "OPTION A" / "OPTION B"

## 2026-03-02 — Agent Report

# Agent Report

SUCCESS — Added PostgreSQL support to eckSnapshot filtering system:
1. Added PostgreSQL project detection pattern (postgresql.conf, pg_hba.conf, PG_VERSION, data/base, data/global, data/pg_wal) with priority 10
2. Added PostgreSQL-specific file filtering: ignores all PG internal dirs (base/, global/, pg_wal/, pg_xact/, pg_notify/, etc.), PG system files (PG_VERSION, postmaster.pid), and PG-specific extensions (.fsm, .vm)
3. Also fixed eckasser project: added data/pg_pos/ to .gitignore and removed 974 PG data files from git tracking

## 2026-03-02 — Agent Report

# Agent Report

SUCCESS — Released v6.0.0. Changes: (1) Bumped version in package.json from 5.9.0 to 6.0.0, updated description. (2) Completely rewrote README.md to reflect Royal Court architecture, GLM Z.AI Swarm, Shannon Entropy SecretScanner, Rust Telemetry Hub, and improved Delta Snapshots.

## 2026-03-01 — Agent Report

# Agent Report

Updated MCP tool description and all agent templates to clarify that `eck_finish_task` automatically writes to AnswerToSA.md. Templates now provide clear instructions: Option A (MCP tool - use status parameter) and Option B (Manual CLI fallback - read first, then write, then run update). This prevents AnswerToSA.md write failures caused by safety checks.

## 2026-03-01 — Agent Report

# Agent Report

Updated `initializeEckManifest()` function in `src/utils/fileUtils.js` to use data from `setup.json` (specifically `projectContext` block) when generating fallback STUB templates for `ENVIRONMENT.md` and `CONTEXT.md`. This resolves the TECH_DEBT issue where these files were manually maintained with generic placeholders. Templates now use actual project name, type, stack, and AI integration info from setup.json configuration.

## 2026-03-01 — Agent Report

# Agent Report

Updated MCP tool descriptions and agent templates to strictly prohibit using snapshot-generating commands (`eck_finish_task`, `update-auto`, `update`) for intermediate testing. All templates now include warnings that these tools must only be used once at the very end of a task to prevent snapshot history spam.
 
## 2026-03-01 — Fix AnswerToSA.md write failures by directing agents to use eck_finish_task status argument

Updated MCP tool description and all agent templates (coder.template.md, junior-architect.template.md, claudeMdGenerator.js) to provide clear instructions about using `eck_finish_task` tool instead of manually writing to AnswerToSA.md. The templates now explicitly state that:
1. The tool will automatically write the report to AnswerToSA.md
2. Agents should NOT manually write to AnswerToSA.md (it will fail safety checks)
3. Fallback instructions are provided for manual CLI usage if MCP tool is unavailable

## 2026-03-01 — Agent Report

# Agent Report

Implemented deleted file tracking with [FILE DELETED] marker, added Shannon Entropy calculation to SecretScanner for high-entropy secret detection (threshold > 4.5), and cleaned up .eck manifest files (ENVIRONMENT.md, TECH_DEBT.md, ROADMAP.md) to reflect completed and resolved items

## 2026-03-01 — Auto-generate ENVIRONMENT.md and CONTEXT.md from setup.json

Updated `initializeEckManifest()` function to auto-generate fallback templates for `ENVIRONMENT.md` and `CONTEXT.md` using data from `setup.json` (projectContext block). This resolves the technical debt issue where these files were manually maintained with generic placeholders. Now they will use actual project name, type, stack, and AI integration info from setup.json.

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

