---
task_id: fix-directory-tree-substring-match
date: 2026-03-17
type: fix
scope: fileUtils
summary: Fix generateDirectoryTree hiding files whose names contain dirsToIgnore substrings
---

# Fix generateDirectoryTree substring match bug

- `generateDirectoryTree` used `.includes()` to check `dirsToIgnore`, causing files like `build.gradle.kts` to be hidden because `"build"` is a substring
- Changed to exact `===` match with `entry.isDirectory()` guard — only actual directories are filtered now
- Files like `build.gradle`, `build.gradle.kts`, `rebuild-index.js` are no longer falsely excluded from the tree

**Modified Files**:
- `src/utils/fileUtils.js`: line 316, `generateDirectoryTree` filtering logic

---
task_id: polyglot-monorepo-filtering
date: 2026-03-17
type: feat
scope: filtering,projectDetector
summary: Merge ignore filters from ALL detected project types for polyglot monorepos
---

# Polyglot Monorepo Filtering (Path A)

- `getProjectSpecificFiltering()` now accepts `string | string[]` — merges (union + dedup) `filesToIgnore`, `dirsToIgnore`, `extensionsToIgnore` from all matching types in `setup.json`
- New export `getAllDetectedTypes(detection)` extracts all types from detection result
- Android detection improved: `android/` added to subdirectory search lists for Gradle files, so nested Android projects (e.g., `android/build.gradle.kts`) are detected in polyglot repos
- `processProjectFiles`, `estimateProjectTokens`, `scanDirectoryRecursively` all updated to pass full type arrays instead of single primary type
- Verified on xelixir (Rust + Android): `gradlew`, `gradlew.bat`, `ic_launcher*.xml`, `.gradle/` now filtered; Rust sources kept

**Modified Files**:
- `src/utils/projectDetector.js`: `getProjectSpecificFiltering` (array support), `getAllDetectedTypes` (new), `calculateTypeScore` (android subdirs)
- `src/utils/fileUtils.js`: `scanDirectoryRecursively` (projectTypes array), import updated
- `src/cli/commands/createSnapshot.js`: all call sites updated to use `getAllDetectedTypes()`

---
task_id: cross-context-linked-projects
date: 2026-03-15
type: feat
scope: cross-context,cli
summary: Implement Cross-Context Protocol with linked projects and 0-10 depth scale
---

# Cross-Context Protocol (Linked Projects)

- Added `eck-snapshot link [depth]` command — generates standalone `link_*.md` companion snapshots
- Depth scale: 0=tree only, 1-3=truncated (20/50/100 lines), 4-6=skeleton, 7-10=full content
- Custom cross-context header with dual fetch formats (Windows short + Linux JSON)
- Added cross-context awareness to `multiAgent.md` and `architect-prompt.template.md` AI templates
- Human-friendly `link` shim in `LEGACY_COMMANDS`

**Modified Files**:
- `src/cli/cli.js`: `link` legacy command shim, updated help text
- `src/cli/commands/createSnapshot.js`: `isLinkedProject` depth mapping, standalone `link_` file output
- `src/utils/aiHeader.js`: reverted inline injection (standalone file approach instead)
- `src/templates/multiAgent.md`: cross-context awareness section
- `src/templates/architect-prompt.template.md`: `link` in available commands

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



















































## 2026-03-21 — Agent Report

# Agent Report

## Task: `ecksnapshot:fix-detector-enoent-spam`

### Done
- Added `fileExists` guard in `getNodejsDetails()` (line ~293) — returns early with base `details` object if `package.json` is missing.
- Added `fileExists` guard in `getReactNativeDetails()` (line ~401) — same early return pattern.

### Result
ENOENT warnings no longer spam the console when these detection functions are called on projects without a root `package.json`. The existing `catch` blocks remain as a safety net for other I/O or parse errors.

## 2026-03-17 — Agent Report

# Agent Report

## Задача: Переименовать recon → scouts + вынести линки в .eck/links/

### Изменения

**1. `src/cli/commands/recon.js` — переименование recon → scouts:**
- Папка `.eck/recon/` → `.eck/scouts/`
- Файлы `recon_tree_*` → `scout_tree_*`, `recon_data_*` → `scout_data_*`
- Заголовки в markdown: "RECONNAISSANCE" → "SCOUT"
- Лог сообщения: "Generating reconnaissance" → "Scouting repository"

**2. `src/cli/commands/createSnapshot.js` — линки в отдельную папку:**
- Link snapshots (`link_*.md`) теперь сохраняются в `.eck/links/` вместо `.eck/lastsnapshot/`
- Обычные снапшоты остаются в `.eck/lastsnapshot/` как раньше
- Больше нет накопления link-файлов в lastsnapshot

**3. `src/cli/cli.js` — обновлён help text:**
- "Reconnaissance" → "Scout repository" / "Fetch file contents"

### Что НЕ менялось
- Имя файла `recon.js` и функция `runReconTool` — внутреннее, пользователь не видит
- README.md — не обновлялся (отдельная задача)
- setup.json, MCP серверы — не содержали упоминаний recon

## 2026-03-17 — Agent Report

# Agent Report

## Задача: Улучшить промпт scout/fetch для предотвращения ошибок LLM при чтении дерева

### Проблема
LLM (Gemini) неправильно читала ASCII-дерево и указывала неверные пути при `fetch` — пропускала промежуточные директории (например `plugins/mcp-integration/...` вместо `plugins/plugin-dev/skills/mcp-integration/...`). В результате 2 из 3 файлов не были найдены.

### Что сделано (файл: `src/cli/commands/recon.js`)

1. **Добавлена подсказка в промпт scout** (секция "How to request more data"):
   - Предупреждение что пути из дерева легко прочитать неправильно
   - Рекомендация использовать `**/<filename>` вместо точных путей
   - 3 конкретных примера

2. **Добавлено предупреждение в вывод fetch**:
   - Подсчитывается сколько паттернов реально нашли файлы vs сколько было запрошено
   - Если часть паттернов не сработала — в markdown-вывод вставляется warning с рекомендацией перепроверить пути и использовать глобы

## 2026-03-17 — Agent Report

# Agent Report

## Fix: generateDirectoryTree substring match bug

### Problem
Line 316 in `generateDirectoryTree` used `.includes()` for directory ignore matching:
```js
config.dirsToIgnore.some(d => entry.name.includes(d.replace('/', '')))
```
This caused `"build/"` in dirsToIgnore to hide any entry containing "build" as a substring — including files like `build.gradle`, `build.gradle.kts`, and even `rebuild-index.js`.

### Fix
Changed to exact name match, applied only to directories:
```js
entry.isDirectory() && config.dirsToIgnore.some(d => entry.name === d.replace('/', ''))
```

### Verified
- `build/` (dir) → filtered ✅
- `build.gradle.kts` (file) → kept ✅ (was broken)
- `build.gradle` (file) → kept ✅ (was broken)
- `rebuild-index.js` (file) → kept ✅ (was broken)
- `node_modules/`, `dist/`, `.gradle/` → still filtered ✅

## 2026-03-17 — Agent Report

# Agent Report

## Polyglot Monorepo Filtering — Implemented (Path A)

### Problem
In multi-stack projects (e.g., xelixir = Rust + Android), `detectProjectType` returned only the dominant type (e.g., "rust"). Only Rust-specific filters were applied, allowing Android junk (`gradlew`, `gradlew.bat`, `ic_launcher*.xml`, `.gradle/`, vector drawables) to leak into snapshots, wasting tens of thousands of tokens.

### Solution: Path A — Union of All Detected Type Filters
Chose Path A (simple merge) over Path B (scoped per-directory) as it solves 95%+ of cases with minimal code changes.

### Changes Made

**`src/utils/projectDetector.js`:**
1. `getProjectSpecificFiltering()` — now accepts `string | string[]`. When given an array, merges (union + dedup) `filesToIgnore`, `dirsToIgnore`, `extensionsToIgnore` from ALL matching types in `setup.json`.
2. New export `getAllDetectedTypes(detection)` — extracts all types from a detection result (primary + `allDetections`).
3. Android detection improved: added `'android'` to subdirectory search lists for Gradle files and project directories, so `android/build.gradle.kts` is now found in polyglot repos.

**`src/utils/fileUtils.js`:**
1. `scanDirectoryRecursively()` — parameter renamed `projectType → projectTypes`, now passes array through recursive calls and to `getProjectSpecificFiltering`.
2. `displayProjectInfo()` — shows "Polyglot filtering" message when multiple types detected.
3. Import updated to include `getAllDetectedTypes`.

**`src/cli/commands/createSnapshot.js`:**
1. `processProjectFiles()` — parameter renamed `projectType → projectTypes`, receives array.
2. `estimateProjectTokens()` — receives array for filtering, extracts primary type for polynomial coefficient lookup.
3. Call sites updated: `getAllDetectedTypes(projectDetection)` used instead of `projectDetection.type`.

### Verification (xelixir project)
- **Before:** Detection = `rust(45)` only → Android junk passes through
- **After:** Detection = `[android(70), rust(45), flutter(20), react-native(20)]` → merged filters from ALL types
- `gradlew` → FILTERED ✅
- `gradlew.bat` → FILTERED ✅  
- `ic_launcher_background.xml` → FILTERED ✅
- `ic_launcher.xml` → FILTERED ✅
- `crates/server/src/main.rs` → KEPT ✅
- `Cargo.toml` → KEPT ✅

### Note
Android now scores highest (70) for xelixir due to strong manifest+gradle signals. This doesn't affect filtering (all types merged), but may affect token estimation coefficients (uses primary type). Minor cosmetic issue — out of scope for this fix.

## 2026-03-16 — Agent Report

# Agent Report

## Fix: MCP setup path resolution bug

### Problem
`setupMcp.js` used `process.cwd()` in 4 places for locating project config files (`.mcp.json`, `opencode.json`, `.codex/config.toml`, `.eck/claude-mcp-config.json`). If the user ran `eck-snapshot setup-mcp` from a subdirectory, configs would be created in the wrong location.

### Fix
- Added `findProjectRoot()` — walks up from `cwd` looking for `.git` or `package.json` markers, falls back to `cwd`
- Added `fsSync` import for synchronous directory scanning
- Replaced all 4 `process.cwd()` references with `projectRoot` parameter
- All internal functions (`setupForClaude`, `setupForOpenCode`, `setupForCodex`) now receive `projectRoot` as a parameter
- Exported `ensure*` functions were already correct (they accept `repoPath`) — no changes needed
- Diagnostic log added: if `projectRoot !== cwd`, prints the resolved root path

### Not affected
- `ensureProjectMcpConfig(repoPath)` — already directory-agnostic
- `ensureProjectOpenCodeConfig(repoPath)` — already directory-agnostic
- `ensureProjectCodexConfig(repoPath)` — already directory-agnostic

### Verified
- Module loads without errors
- `findProjectRoot()` correctly resolves project root via `.git`/`package.json` markers

## 2026-03-16 — Agent Report

# Agent Report

## Task: Refine depth gradations (0-9) for `scout` and `link` commands

### Problem
- `fetch` command was being confused with `link` — user typed `fetch 10` expecting depth-based output, but `fetch` only accepts glob patterns
- Old depth scale (0-10) had redundant levels: 4-6 all did identical skeleton, 7-10 all did identical full content

### Changes Made

**New file: `src/core/depthConfig.js`**
- Shared depth configuration used by both `scout` and `link`
- `getDepthConfig(depth)` returns mode settings for any depth 0-9
- `DEPTH_SCALE` array for human-readable documentation

**Updated depth scale (0-9):**
| Depth | Mode | Description |
|-------|------|-------------|
| 0 | Tree only | Directory structure, no file contents |
| 1 | Truncated 10 | 10 lines per file (imports/header) |
| 2 | Truncated 30 | 30 lines per file |
| 3 | Truncated 60 | 60 lines per file |
| 4 | Truncated 100 | 100 lines per file |
| 5 | Skeleton | Function/class signatures only (no docs) |
| 6 | Skeleton + docs | Signatures + docstrings/comments preserved |
| 7 | Full (compact) | Full content, truncated at 500 lines |
| 8 | Full (standard) | Full content, truncated at 1000 lines |
| 9 | Full (unlimited) | Everything, no limits |

**`src/core/skeletonizer.js`** — Added `preserveDocs` option:
- Depth 5: strips JSDoc/docstrings for maximum compression
- Depth 6: preserves JSDoc (JS/TS) and Python docstrings (tree-sitter)

**`src/cli/commands/recon.js`** — `scout` now accepts depth argument:
- `eck-snapshot scout` → tree only (default, depth 0)
- `eck-snapshot scout 5` → tree + skeleton content
- Output includes depth scale table for AI reference

**`src/cli/commands/createSnapshot.js`** — `link` uses shared `getDepthConfig()`

**`src/cli/cli.js`** — Updated legacy shims and help text

**`.eck/OPERATIONS.md`** — Updated documentation with new scale

**`src/templates/multiAgent.md`** — Updated 0-10 → 0-9 reference

### `fetch` — unchanged
Still accepts only glob patterns. No depth support (by design).

### Smoke tested
- `scout` (depth 0): tree only ✅
- `scout 1` (depth 1): tree + 10 lines per file, 66 files processed ✅
- `depthConfig` module: all 10 levels return correct configs ✅

## 2026-03-15 — Agent Report

# Agent Report

## Dual Fetch Formats + Cross-Context Prompt Awareness

### Changes Made

**1. `src/cli/commands/createSnapshot.js`**
- Updated `isLinkedProject` header to output both fetch formats:
  - **Option A** (short format): `eck-snapshot fetch "path/to/file"` — best for Windows PowerShell/CMD
  - **Option B** (JSON format): `eck-snapshot '{"name": "eck_fetch", ...}'` — best for Linux/Mac Bash/Zsh

**2. `src/templates/multiAgent.md`**
- Added `### CROSS-CONTEXT DEVELOPMENT (LINKED PROJECTS)` section before the anti-truncation protocol.
- Instructs the AI to ask users to run `eck-snapshot link [depth 0-10]` in companion repos and upload the `link_*.md` file.

**3. `src/templates/architect-prompt.template.md`**
- Added `eck-snapshot link <depth>` to the Available Commands list.

No issues.

## 2026-03-15 — Agent Report

# Agent Report

## Refactored Link Command to Standalone File Generator

### Changes Made

**1. `src/cli/cli.js`**
- Updated `link` legacy command: now takes `depth` as `args[0]` (not a path), sets `isLinkedProject: true`.
- Updated help text: `eck-snapshot link 4` — run inside target project directory.

**2. `src/utils/aiHeader.js`**
- Reverted the `MULTI-PROJECT CONTEXT` injection (no longer needed since linked projects are standalone files).

**3. `src/cli/commands/createSnapshot.js`**
- Added depth-mapping logic at the top of `createRepoSnapshot` when `isLinkedProject` is true:
  - Depth 0: `skipContent = true` (tree only)
  - Depth 1-3: truncated lines (20/50/100)
  - Depth 4-6: skeleton mode
  - Depth 7-10: full content
- Replaced inline linked project processing block with standalone file output:
  - When `isLinkedProject`, generates a custom cross-context header instead of the full AI architect header.
  - Output filename prefixed with `link_` instead of `eck`.
  - Includes `skipContent` notice when depth=0.

### Architecture
Users now run `eck-snapshot link [depth]` inside the target project directory. It generates a standalone `link_*.md` file that can be uploaded alongside the main project snapshot. No more appending to the main snapshot.

## 2026-03-15 — Agent Report

# Agent Report

## Added `link` Legacy Command Shim

Added human-friendly shorthand to `LEGACY_COMMANDS` in `src/cli/cli.js`:
- `eck-snapshot link ../other-project 4` → translates to `{"name": "eck_snapshot", "arguments": {"link": "../other-project", "linkDepth": 4}}`
- Depth defaults to 0 if omitted.
- Added `HUMAN SHORTHANDS` section to the help text.

No issues.

## 2026-03-15 — Agent Report

# Agent Report

## Linked Projects (Cross-Context) Feature — Implemented

### Changes Made

**1. `src/cli/cli.js`** — Updated help text to document new `link` and `linkDepth` arguments.

**2. `src/utils/aiHeader.js`** — Injected a `MULTI-PROJECT CONTEXT` notice into the `### PROJECT OVERVIEW` section when `options.link` is present. This tells the AI that linked projects exist at the bottom of the snapshot and provides guidance on using `eck_fetch` for deeper inspection.

**3. `src/cli/commands/createSnapshot.js`** — Core implementation:
- After the main project's `fileBody` is assembled, processes each linked project path.
- Resolves paths relative to `originalCwd`.
- Maps `linkDepth` (0-10) to processing modes:
  - **0**: Tree only, no file contents.
  - **1-3**: Truncated content (20/50/100 lines respectively).
  - **4-6**: Skeleton mode.
  - **7-10**: Full content.
- Runs `detectProjectType` + `processProjectFiles` on each linked project with the mapped options.
- Generates a directory tree for each linked project.
- Appends a clearly marked `# 🔗 LINKED PROJECT` section with absolute path, cross-context instructions, tree, and content.
- Errors on individual linked projects are caught and warned, not fatal.

### Usage
```json
{"name": "eck_snapshot", "arguments": {"link": "../other-project", "linkDepth": 3}}
{"name": "eck_snapshot", "arguments": {"link": ["../api", "../shared-lib"], "linkDepth": 5}}
```

### No Issues Remaining
All three files modified, module loads without errors.

## 2026-03-15 — Agent Report

# Agent Report

# feat(cli): Make empty command default to full snapshot

Changed `cli.js` action handler: when no payload is provided, instead of showing help, it now runs `createRepoSnapshot(cwd, {})` — a full snapshot. Added a hint pointing users to `eck-snapshot -h` for the full tool list. Help is still accessible via `-h`/`--help` flags.

## 2026-03-15 — Agent Report

# Agent Report

# release(core): Remove claudeCliService, switch to stub manifests, bump to v6.1.0

## Changes

### `src/utils/fileUtils.js`
- Removed `import { executePrompt as askClaude } from '../services/claudeCliService.js'`
- Removed `aiGenerationEnabled` flag and all AI generation logic
- Replaced `prompt`/`fallback` template structure with simple `content` stubs
- Creation loop simplified: just writes `config.content`, no AI branch
- Static project detection kept for populating `projType`/`projStack` in stubs

### `src/services/claudeCliService.js`
- Deleted entirely (was 23KB of legacy subprocess Claude CLI integration)

### `package.json`
- Version bumped: `6.0.13` → `6.1.0`

### `.eck/TECH_DEBT.md`
- Marked `claudeCliService.js` debt as resolved

## Verification
- `fileUtils.js` loads cleanly without `claudeCliService.js`
- `cli.js` loads cleanly
- Version reads as `6.1.0`

## 2026-03-15 — Agent Report

# Agent Report

# feat(cli): Restore token training tools using JSON-native interface

## What was done
- Re-created `src/cli/commands/trainTokens.js` with JSON-native `runTokenTools(payload)` dispatcher
- Wired `eck_train_tokens` and `eck_token_stats` into `cli.js` router (switch cases + help text)
- Updated `.eck/TECH_DEBT.md` — marked this item as resolved

## New tools
| Tool | Args | Function |
|------|------|----------|
| `eck_train_tokens` | `{ projectType, fileSizeBytes, estimatedTokens, actualTokens }` | Calibrate token estimation polynomial |
| `eck_token_stats` | `{}` | Show estimation accuracy + sync weights |

## Verification
- `cli.js` loads cleanly with new import

## 2026-03-15 — Agent Report

# Agent Report

# docs(eck): Update all .eck/ manifests for v6.1 JSON-native architecture

## Updated Files

### `.eck/CONTEXT.md`
- Rewrote architecture section: CLI is now a JSON/MCP bridge, not traditional commander subcommands
- Added CLI router table mapping JSON tool names → source files
- Added Codex to supported AI coding tools table
- Added Reconnaissance Protocol description
- Updated snapshot modes to show JSON arguments instead of flags
- Removed telemetry hub section (CLI commands deleted)
- Updated all command examples to JSON format

### `.eck/OPERATIONS.md`
- Rewrote all command examples to use JSON payloads with shim alternatives
- Added Reconnaissance Protocol section (scout/fetch)
- Added MCP config locations table (Claude Code / OpenCode / Codex)
- Removed browser automation section (ask-claude deleted)
- Removed legacy ask-claude subprocess warning
- Kept Smart Delegation Protocol and Reporting Protocol (still valid)

### `.eck/ROADMAP.md`
- Added v6.1 completed items: JSON-native CLI, Recon Protocol, Codex integration, dead code cleanup
- Added current sprint items: remove claudeCliService dependency, remove legacy shims
- Removed completed items that were already tracked in earlier versions

### `.eck/TECH_DEBT.md`
- Added 4 active debt items:
  - `claudeCliService.js` still used by `fileUtils.js`
  - `LEGACY_COMMANDS` shim still present
  - `mcp-server-template.js` stale description
  - `eck_train_tokens` JSON command generated but not routed
- Moved resolved items from v6.1 migration

## 2026-03-15 — Agent Report

# Agent Report

# docs(readme): Overhaul README for JSON-Native interface and Recon Protocol

Replaced the entire README.md with updated documentation covering:
- The new 100% JSON/MCP CLI interface with examples
- Human-friendly shim commands for convenience
- The Reconnaissance Protocol (scout/fetch) workflow for cross-repo exploration
- Updated feature list (Codex support, removed deprecated features)
- Removed documentation for deleted commands (restore, prune, consilium, etc.)

## 2026-03-15 — Agent Report

# Agent Report

# refactor(recon): Provide multi-platform command options in scout template

Updated the `recon_tree_*.md` template in `src/cli/commands/recon.js` to offer two copy-pasteable fetch command formats:
- **Option A** (short): `eck-snapshot fetch "path" "glob"` — best for Windows PowerShell/CMD
- **Option B** (JSON): `eck-snapshot '{"name": "eck_fetch", ...}'` — best for Linux/Mac Bash/Zsh

## 2026-03-15 — Agent Report

# Agent Report

# refactor(cleanup): Delete orphaned legacy CLI commands and services

## Deleted (11 files)
- `src/cli/commands/restoreSnapshot.js`
- `src/cli/commands/pruneSnapshot.js`
- `src/cli/commands/consilium.js`
- `src/cli/commands/trainTokens.js`
- `src/cli/commands/detectProfiles.js`
- `src/cli/commands/generateProfileGuide.js`
- `src/cli/commands/setupGemini.js`
- `src/cli/commands/setupGemini.test.js`
- `src/cli/commands/showFile.js`
- `src/cli/commands/envSync.js`
- `src/services/claudeCliService.test.js`

## Kept (deviation from spec)
- `src/services/claudeCliService.js` — still actively imported by `src/utils/fileUtils.js` (line 6: `askClaude` used in manifest auto-generation at line 1083). Deleting it would break the snapshot pipeline.

## Verification
- `cli.js` loads cleanly after deletions
- No remaining imports reference the deleted modules

## 2026-03-15 — Agent Report

# Agent Report

# refactor(core): Eliminate reliance on legacy command shim

## Changes Made

### `scripts/mcp-eck-core.js` (critical path)
- `execa("node", [cliPath, "update-auto", "--fail"])` → `execa("node", [cliPath, JSON.stringify({ name: "eck_update_auto", arguments: { fail: true } })])`
- `execa("node", [cliPath, "update-auto"])` → `execa("node", [cliPath, JSON.stringify({ name: "eck_update_auto" })])`

### `src/utils/claudeMdGenerator.js`
- All `eck-snapshot setup-mcp` → `eck-snapshot '{"name": "eck_setup_mcp"}'`
- All `eck-snapshot update` → `eck-snapshot '{"name": "eck_update"}'`
- Removed redundant "do not use eck-snapshot update" warning

### `src/templates/opencode/coder.template.md`
- `eck-snapshot update` → `eck-snapshot '{"name": "eck_update"}'`

### `src/templates/opencode/junior-architect.template.md`
- `eck-snapshot update` → `eck-snapshot '{"name": "eck_update"}'`

### `src/templates/skeleton-instruction.md`
- `eck-snapshot show path/to/file1.js` → `eck-snapshot '{"name": "eck_fetch", "arguments": {"patterns": [...]}}'`

### `src/cli/commands/createSnapshot.js`
- Profile listing command updated to JSON format
- Error hint updated

### `src/cli/commands/generateProfileGuide.js`
- "Once saved, run" hint updated to JSON format

### `src/cli/commands/setupMcp.js`
- OpenCode hint updated to JSON format

### `src/utils/tokenEstimator.js`
- Training command updated to JSON format

## Remaining legacy references (non-critical)
- JSDoc comments in `setupMcp.js` (documentation only)
- `README.md` in claude-code templates
- Dead-code modules (`showFile.js`, `trainTokens.js`) — not wired into JSON router

## Verification
- `cli.js` loads cleanly
- `mcp-eck-core.js` loads cleanly
- All user-facing hints and internal subprocess calls now use native JSON format

## 2026-03-15 — Agent Report

# Agent Report

# feat(recon): Reinstate Reconnaissance protocol in JSON interface

## What was done

### Created `src/cli/commands/recon.js`
- `runReconTool(payload)` — dispatcher for `eck_scout` and `eck_fetch`
- `runScout()` — generates a deep directory tree (maxDepth 15) into `.eck/recon/recon_tree_*.md` with AI-safe instructions warning not to assume architect role for the external repo
- `runFetch(patterns)` — uses `micromatch` to glob-match files, reads their content, saves to `.eck/recon/recon_data_*.md`

### Updated `src/cli/cli.js`
- Added `import { runReconTool } from './commands/recon.js'`
- Added `eck_scout` and `eck_fetch` cases to the switch router
- Added `scout` and `fetch` legacy shims to `LEGACY_COMMANDS`
- Updated help text to list the two new recon tools with examples

## Verification
- `'{"name": "eck_scout"}'` — generates tree file successfully
- `'{"name": "eck_fetch", "arguments": {"patterns": ["setup.json"]}}'` — fetches 1 file successfully
- `scout` legacy shim — works
- Both modules load cleanly

## 2026-03-15 — Agent Report

# Agent Report

# refactor(cli): Migrate to 100% AI-Native JSON/MCP CLI interface

## What was done
Completely rewrote `src/cli/cli.js`:
- Removed all `commander` sub-commands and legacy human-centric flags
- CLI now accepts a single JSON string: `{"name": "tool_name", "arguments": {...}}`
- Routes to existing core functions: `eck_snapshot`, `eck_update`, `eck_update_auto`, `eck_setup_mcp`, `eck_detect`, `eck_doctor`

## Legacy compatibility shim
Added `LEGACY_COMMANDS` map that intercepts old positional commands (`update-auto`, `snapshot`, `update`, `setup-mcp`, `detect`, `doctor`) and translates them to JSON payloads before commander parses them. This keeps internal callers like `mcp-eck-core.js` (which calls `node index.js update-auto`) working without modification.

## Deviation from spec
- `eck_scout`/`eck_fetch` (`runReconTool` from `recon.js`) omitted — module doesn't exist in codebase
- Legacy shim was NOT in the spec but was required to prevent breaking `eck_finish_task` MCP tool

## Removed imports (dead code)
`restoreSnapshot`, `pruneSnapshot`, `generateConsilium`, `testFileParsing`, `trainTokens`, `showTokenStats`, `executePrompt`, `executePromptWithSession`, `detectProfiles`, `generateProfileGuide`, `setupGemini`, `pushTelemetry`, `showFile`, `envPush`, `envPull`, `inquirer`, `ora`, `execa`, `checkCodeBoundaries`

## Verification
- `--help` shows new JSON interface
- `'{"name": "eck_detect"}'` — works
- `detect` (legacy) — works via shim
- Invalid JSON — clean error with example
- `eck_finish_task` MCP tool — works (this commit proves it)

## 2026-03-15 — Agent Report

# Agent Report

# feat(mcp): Auto-detect and configure Codex MCP integration

## Changes Made

### `src/cli/commands/setupMcp.js`
- Updated JSDoc to mention Codex support
- Added auto-detection of `.codex/` directory in `setupMcp()` — triggers `setupForCodex()` automatically
- Added `setupForCodex()` — interactive setup with spinner/progress feedback
- Added `ensureProjectCodexConfig()` (exported) — silently injects `[mcp_servers.eck-core]` and `[mcp_servers.glm-zai]` TOML sections into `.codex/config.toml` using raw string manipulation (no TOML parser dependency)
- Uses `string.includes()` check to avoid duplicate entries
- Escapes backslashes in Windows paths for TOML compatibility

### `src/cli/commands/createSnapshot.js`
- Added `ensureProjectCodexConfig` to import
- Hooked Codex config injection right after OpenCode config — runs during snapshot creation when AGENTS.md is generated
- Non-critical: wrapped in try/catch so failures don't break snapshots

## Verification
- Both modules load without errors
- All exports confirmed: `setupMcp`, `ensureProjectMcpConfig`, `ensureProjectOpenCodeConfig`, `ensureProjectCodexConfig`

## 2026-03-15 — Agent Report

# Agent Report

# Исследование Codex-RS для интеграции с eck-snapshot

## 1. Регистрация MCP-серверов

Codex использует **многослойную TOML-конфигурацию** (7 слоёв с приоритетом: CLI → repo `.codex/config.toml` → parent dirs → CWD → user `$CODEX_HOME/config.toml` → system → admin/cloud).

**Два транспорта:**
- `Stdio`: `command`, `args`, `env`, `cwd`
- `StreamableHttp`: `url`, `bearer_token_env_var`, `http_headers`

**Общие опции:** `enabled`, `required`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, `disabled_tools`, `scopes`, `oauth_resource`.

**Плагины** также могут определять MCP через `.mcp.json` (JSON, camelCase). Пользовательский конфиг имеет приоритет.

**Ключевые файлы:**
- `codex-rs/core/src/config/types.rs` — `McpServerConfig`, `McpServerTransportConfig`
- `codex-rs/core/src/config/mod.rs` — загрузка и мерж
- `codex-rs/core/src/config_loader/mod.rs` — стек слоёв
- `codex-rs/core/src/mcp/mod.rs` — MCP-менеджер
- `codex-rs/core/src/plugins/manager.rs` — плагинные MCP

## 2. Системные промпты

Модульная сборка через `DeveloperInstructions` (`protocol/src/models.rs`):
1. Permission/Policy шаблоны (`protocol/src/prompts/permissions/`)
2. Базовые инструкции (`core/prompt.md`, встроены через `include_str!()`)
3. Memory tool инструкции (`core/templates/memories/*.md`)
4. Collaboration mode (`core/templates/collaboration_mode/{default,plan,pair_programming,execute}.md`)
5. Personality (`core/templates/personalities/gpt-5.2-codex_{friendly,pragmatic}.md`)
6. Apps, Git commit attribution

User message: AGENTS.md инструкции + environment context (XML) + subagent config.

**Ключевые файлы:**
- `codex-rs/core/src/codex.rs:3370-3470` — сборка промпта
- `codex-rs/protocol/src/models.rs:424-615` — `DeveloperInstructions`
- `codex-rs/core/src/context_manager/updates.rs` — билдеры секций

## 3. Формат патчей

**Собственный формат**, НЕ unified diff, НЕ JSON:
```
*** Begin Patch
*** Add File: <path>     — новый файл (+строки)
*** Delete File: <path>  — удаление
*** Update File: <path>  — патч с hunks (@@ контекст)
*** Move to: <new_path>  — переименование
*** End Patch
```
Hunks: ` ` контекст, `-` удалить, `+` добавить. 3 строки контекста по умолчанию.

**НЕ поддерживаются:** unified diff, JSON, бинарные патчи, гибридные форматы (наш Eck-Protocol v2 `<file>` теги).

**Ключевые файлы:**
- `codex-rs/apply-patch/apply_patch_tool_instructions.md`
- `codex-rs/apply-patch/src/parser.rs`

## Выводы для интеграции

| Аспект | Codex | eck-snapshot |
|--------|-------|--------------|
| Конфиг MCP | TOML, многослойный | JSON, единый |
| Транспорты | Stdio + StreamableHttp | Stdio |
| Промпты | Модульная сборка, developer role | CLAUDE.md/AGENTS.md генерация |
| Патчи | `*** Begin/End Patch` | Eck-Protocol v2 (`<file>`) |

**Рекомендации:**
1. MCP: генерировать TOML-секции для `config.toml` вместо JSON
2. Промпты: наш CLAUDE.md передавать как AGENTS.md (user instructions)
3. Патчи: форматы несовместимы — нужен адаптер или использование встроенного `apply_patch`

## 2026-03-12 — Agent Report

# Agent Report

## Task Complete: Interactive Knowledge Distillation Protocol

### Changes Made

**`src/utils/claudeMdGenerator.js`** — 2 edits:
1. **Architect instructions** (`getArchitectInstructions`): Added section 6 "Knowledge Distillation" before operational rules (renumbered to §7). Instructs JA to ask user before updating `.eck/` manifests.
2. **Coder instructions** (`CODER_INSTRUCTIONS`): Added Knowledge Distillation section before WORKFLOW. Same prompt — ask before documenting.

**`src/templates/opencode/junior-architect.template.md`**:
- Added §6 "Knowledge Distillation" before Reporting Protocol (renumbered to §7).

**`src/templates/opencode/coder.template.md`**:
- Added Knowledge Distillation section before WORKFLOW.

### Behavior
All agent roles (JA-Sonnet, JA-Opus, Coder in Claude Code, JA in OpenCode, Coder in OpenCode) will now ask the user:
> "I have deep context of the codebase right now. Should I update the `.eck/` manifests (like ARCHITECTURE.md or TECH_DEBT.md) with what I've learned before we finish?"

Code completion is always prioritized. Documentation is opt-in.

## 2026-03-12 — Agent Report

# Agent Report

## Research Complete: Claude Code Context Window Tracking

### Key Findings

**No source code available.** Claude Code is distributed as a compiled Bun binary (`claude.exe`, ~228MB). There is no JS source to grep. All findings are from CHANGELOG and official documentation.

---

### 1. Status Line Input — Context Window Fields

The status line script receives JSON via stdin with these fields:

```json
{
  "context_window": {
    "total_input_tokens": 12345,
    "total_output_tokens": 6789,
    "current_usage": {
      "input_tokens": 5000,
      "output_tokens": 2000,
      "cache_creation_input_tokens": 1000,
      "cache_read_input_tokens": 3000
    },
    "used_percentage": 75,
    "remaining_percentage": 25,
    "context_window_size": 200000
  },
  "exceeds_200k_tokens": false
}
```

- `used_percentage` — pre-calculated, based on input tokens only (input + cache_creation + cache_read, excludes output)
- `exceeds_200k_tokens` — boolean, true when combined tokens from last API response exceed 200k

### 2. Auto-Compact Behavior

- **Threshold:** Was 60%, now **80%** (changed in CHANGELOG). Exact config key not documented publicly.
- **Mechanism:** Clears older tool outputs first, then summarizes conversation. User requests and key code are preserved. CLAUDE.md content persists across compactions.
- Auto-compact was made "instant" in a recent version.

### 3. PreCompact Hook (Our Best Hook Point)

```json
{
  "hook_event_name": "PreCompact",
  "trigger": "manual|auto",
  "custom_instructions": "",
  "session_id": "...",
  "transcript_path": "/path/to/session.jsonl",
  "cwd": "..."
}
```

- Fires before compaction starts
- Matcher values: `manual` (from `/compact`) or `auto` (threshold reached)
- **Cannot block compaction** — only side-effects (logging, re-injecting context via `systemMessage`)
- Hook type: command only

### 4. Recommended Hook Strategy for Knowledge Distillation

**Option A — PreCompact hook (reactive):**
- Trigger: `auto` matcher
- Action: Run a script that dumps current task state / distilled knowledge into a file, then returns `{ "systemMessage": "..." }` to re-inject critical context post-compaction

**Option B — Status line polling (proactive):**
- Monitor `context_window.used_percentage` in a status line script
- When it crosses a threshold (e.g., 70%), write a warning file or trigger a side-effect
- Cannot inject messages, only display in status line

**Option C — Hybrid (recommended):**
- Status line monitors `used_percentage` and displays warning at 70%
- PreCompact hook fires at 80%, captures distilled knowledge, injects it as `systemMessage`

### No Code Changes Made
This was a research-only task.

## 2026-03-12 — Agent Report

# Agent Report

## Task Complete: Exclude `profile_generation_guide.md` from dynamic snapshot

### Change
- **`src/utils/fileUtils.js`** (`loadProjectEckManifest`): Added `entry.name === 'profile_generation_guide.md'` to the exclusion filter so this internal tool file is skipped during dynamic `.eck/` scanning and doesn't waste Architect context tokens.

### Verification
- Module imports cleanly, no errors.

## 2026-03-12 — Agent Report

# Agent Report

## Task Complete: Dynamic `.eck/` Directory Parsing

### Changes Made

**`src/utils/fileUtils.js` — `loadProjectEckManifest()`**
- Replaced hardcoded file list with dynamic `fs.readdir()` scan of the `.eck/` directory
- All `.md` files are now loaded automatically
- Well-known files (`CONTEXT.md`, `OPERATIONS.md`, `JOURNAL.md`, `ROADMAP.md`, `TECH_DEBT.md`, `ENVIRONMENT.md`) still map to their dedicated manifest keys for backward compatibility
- All other `.md` files (e.g., `ARCHITECTURE.md`, `RUNTIME_STATE.md`, `DEPLOY_CHECKLIST.md`) are collected into a new `manifest.dynamicFiles` dictionary
- Secret/credential files are still filtered out (`secret`, `credential`, `server_access` in filename)

**`src/utils/aiHeader.js` — 3 changes:**
1. **`normalizeManifest()`** — passes through `dynamicFiles` from the raw manifest
2. **`buildEckManifestSection()`** — dynamically lists any extra files in the `.eck Directory` section
3. **`generateEnhancedAIHeader()`** — new `dynamicSection` block injects content from all dynamic files into the `projectOverview` template string, with `[STUB]` markers stripped

### Verification
- Both modules import cleanly (`node -e "import(...)"` — no errors)
- Fully backward compatible: existing 6 well-known files behave identically
- New files are additive only — no existing behavior changed

## 2026-03-10 — Agent Report

# Agent Report

## Task: Switch OpenCode MCP config from global to project-local

### Changes Made

**`src/cli/commands/setupMcp.js`:**
- Renamed `ensureOpenCodeGlobalMcp()` → `ensureProjectOpenCodeConfig(repoPath)`
- Changed config path from `~/.config/opencode/opencode.json` (global) to `path.join(repoPath, 'opencode.json')` (local)
- Added logic to ensure `config.instructions` includes `'AGENTS.md'`
- Removed `fs.mkdir` for parent directory (no longer needed since repoPath already exists)
- Added newline at end of written file (consistent with `ensureProjectMcpConfig`)

**`src/cli/commands/createSnapshot.js`:**
- Updated import: `ensureOpenCodeGlobalMcp` → `ensureProjectOpenCodeConfig`
- Updated call: `await ensureProjectOpenCodeConfig(processedRepoPath)`
- Updated log message: "Added eck-core to local opencode.json"

### Verification
- Confirmed new export exists and old export is `undefined`
- No stale references to `ensureOpenCodeGlobalMcp` anywhere in the codebase
- Module loads without errors

## 2026-03-09 — Agent Report

# Agent Report

## Fix: `.mcp.json` schema compliance

### Problem
`ensureProjectMcpConfig()` in `src/cli/commands/setupMcp.js` was writing MCP server entries directly to the JSON root instead of wrapping them in the required `mcpServers` key. This caused Claude Code `/doctor` to report: `Does not adhere to MCP server configuration schema`.

### Fix
Updated `ensureProjectMcpConfig()` to:
1. Ensure `config.mcpServers` root key exists
2. Read/write `eck-core` config under `config.mcpServers['eck-core']` instead of `config['eck-core']`

### Result
`.mcp.json` now produces the correct schema:
```json
{
  "mcpServers": {
    "eck-core": { "command": "node", "args": ["..."] }
  }
}
```

### Verified
- Deleted old broken `.mcp.json`, re-ran `ensureProjectMcpConfig()` — correct format generated.

## 2026-03-08 — Agent Report

# Agent Report

# Fix: Remove hardcoded "eckasse" ghost context from setup.json

## Changes Made

### 1. `setup.json` — Cleared hardcoded `projectContext`
- **Before:** `name: "eckasse"`, `type: "monorepo"`, hardcoded workspaces/stack/aiIntegration from a specific project
- **After:** All fields empty (`""`, `[]`) so they don't override dynamic detection for new projects

### 2. `src/utils/fileUtils.js` — Improved fallback logic (lines 932-935)
- **`projName`**: Now falls back to `path.basename(projectPath)` (actual folder name) before `staticFacts.type`, preventing generic type labels like "nodejs" from being used as project names
- **`projStack`**: Now checks `stack.length > 0` before `.join()`, so an empty array correctly falls back to `'TBD'` instead of producing an empty string

## Result
New projects initialized with `eck-snapshot` will no longer inherit stale "eckasse" context. Dynamic detection and folder-name inference now work correctly as the primary source of truth.

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

