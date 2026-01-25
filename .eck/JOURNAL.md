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
   - Added template variable replacement for:
     - JAS: "Junior Architect (Sonnet 4.5)" - Fast Manager & Implementer
     - JAO: "Junior Architect (Opus 4.5)" - Deep Thinker & Planner
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
- **JAS/JAO Snapshots**: Now generate structural snapshot files (tree + manifests, no code)
  - Provides Senior Architect with project context map
  - Claude agent has full file system access via CLAUDE.md
- **Update Sequencing**: Implemented sequential numbering (`_up1`, `_up2`, etc.)
  - Tracked in `.eck/update_seq` file
  - Counter resets when base snapshot changes
  - Format: `eck{timestamp}_{hash}_upN.md`

**Modified Files**:
- `src/utils/fileUtils.js`: Compact timestamp generation
- `src/cli/commands/createSnapshot.js`: Always generate snapshot, structural mode for JAS/JAO
- `src/cli/commands/updateSnapshot.js`: Sequential update numbering

---
task_id: battle-test-royal-court-docs
date: 2026-01-04T00:00:00Z
type: docs
scope: eck
---

# Document Royal Court autonomous protocols

- Added "Advanced Autonomous Protocols" section to `.eck/OPERATIONS.md`
- Documented Token Economy (Smart Delegation Protocol)
- Documented Ralph Wiggum Protocol (Deterministic Persistence)
- Documented Feedback Loop (Reporting Protocol with `.eck/AnswerToSA.md`)
- Created first `.eck/AnswerToSA.md` feedback report implementing the new protocol
- All documentation aligned with implementation in `src/utils/claudeMdGenerator.js`

---
task_id: task-20260104-royal-court-architecture
date: 2026-01-04
type: feat
scope: core,cli
summary: Implement Royal Court Architecture with Smart Delegation Protocol
---

# Royal Court Architecture: Gemini 3 Pro → Claude 4.5 → MiniMax Swarm

## Changes
- **Architecture Upgrade**: Implemented hierarchical AI system
  - Senior Architect: Gemini 3 Pro (orchestrator)
  - Junior Architects: JAS (Sonnet 4.5), JAO (Opus 4.5), JAG (Gemini 3 Pro)
  - Workers: MiniMax M2.1 Swarm via MCP

- **CLI Flags**:
  - Removed: `--with-ja`
  - Added: `--jag` (full snapshot for Gemini 3 Pro)
  - Added: `--jas` (CLAUDE.md mode for Sonnet 4.5)
  - Added: `--jao` (CLAUDE.md mode for Opus 4.5)

- **Smart Delegation Protocol** (`src/utils/claudeMdGenerator.js`):
  - Token Efficiency: Don't delegate tasks solvable in 1-2 tool calls
  - Intelligent Retry: 2-4 attempts based on progress, not blind repeats
  - Failure Hierarchy: MiniMax → Junior Architect → Senior Architect
  - Critical: Claude is smarter than MiniMax, should take over after failed retries

- **MiniMax Worker Swarm** (`scripts/mcp-minimax-worker.js`):
  - Dynamic tool registration: `minimax_frontend`, `minimax_backend`, `minimax_qa`, `minimax_refactor`
  - Specialized personas for each domain
  - Internal file reading to save Junior Architect's context

- **Updated Files**:
  - `src/cli/cli.js`: New flags
  - `src/cli/commands/createSnapshot.js`: Workflow fork logic
  - `src/utils/aiHeader.js`: JAG mode support
  - `src/utils/claudeMdGenerator.js`: Smart Delegation Protocol
  - `setup.json`: New agent definitions (JAS, JAO, JAG)
  - `src/templates/agent-prompt.template.md`: Generic Junior Architect template

## Impact
- **Token Savings**: Intelligent delegation prevents wasteful MCP calls
- **Quality**: Claude takes over when MiniMax struggles
- **Flexibility**: Progress-based retry (not fixed limit)
- **Scalability**: Parallel MiniMax workers for bulk tasks

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

---
task_id: smart-header-implementation
date: 2026-01-25
type: feat
scope: core, utils
summary: Implement Smart Header injection for strategic context and fix update snapshot bug
details: |
  Implemented Smart Header feature that automatically injects strategic context (Roadmap, Tech Debt, Operations) into system prompt header.
  Fixed critical bug in update snapshot command where agentReport variable was not defined.
  Added force visibility for . Eck directory files in directory tree even if gitignored.
  Cleared alwaysIncludePatterns in setup.json to prevent file duplication in snapshot body.
---

---
task_id: rename-snap-to-lastsnapshot
date: 2026-01-25
type: refactor
scope: core,cli
summary: Rename .eck/snap to .eck/lastsnapshot and update naming convention
details: |
  Renamed .eck/snap/ directory to .eck/lastsnapshot/ for clarity about folder purpose.
  Implemented eck{ShortName}{timestamp} naming convention with capitalized first 3 and last 2 characters.
  Updated all references in createSnapshot.js, updateSnapshot.js, claudeMdGenerator.js, and templates.
---

---
type: fix
scope: core
---

# Add support for C language projects

- Added C project detection (Makefile, CMakeLists.txt, *.c, *.h)
- Added C-specific file filtering for compiled objects (.o, .a, .so)
- Installed tree-sitter-c@0.21.4 parser
- Integrated C parser into segmenter for functions, structs, enums, unions
- Added token estimation coefficients for C (0.23 ratio)

---
task_id: refactor-claude-skip-permissions-default-v1
date: 2025-09-28T14:30:00.000Z
type: refactor
scope: claude-cli
---
## Force --dangerously-skip-permissions for all Claude calls

- Removed the user-facing '--dangerously-skip-permissions' option from 'ask-claude' and 'ask-claude-session' commands.
- Hardcoded the flag in the service layer to ensure all calls to 'claude-code' are non-interactive by default.
- This change improves the reliability of the tool in automated workflows by preventing it from hanging on permission prompts.

---
task_id: refactor-gpt-service-to-codex-cli-v1
date: 2025-09-28T14:00:00.000Z
type: refactor
scope: services
---
## Switch ask-gpt from chatgpt-cli to official codex CLI

- Replaced `npx chatgpt` calls with the official `codex` CLI, using the `exec --full-auto` command for machine-readable output.
- Implemented an automatic login flow that detects authentication errors and triggers the interactive `codex login` command.
- Created a new `authService.js` to handle the login initiation.
- Removed the `open` package dependency as it is no longer needed.
- Updated tests in `gptService.test.js` to mock the new `codex` command flow.
- Added comprehensive documentation in README.md for both ChatGPT and Claude Code integration.
- Enhanced CLI help with detailed examples and authentication instructions.

---
task_id: gpt-test-1
date: 2025-09-28T09:24:01.314Z
type: feat
scope: test
---
## GPT integration test

- Delegated simple change
- Committed journal

---
task_id: gpt-test-1
date: 2025-09-28T09:23:41.532Z
type: feat
scope: test
---
## GPT integration test

- Delegated simple change
- Committed journal

---
task_id: gpt-test-1
date: 2025-09-28T09:23:33.203Z
type: feat
scope: test
---
## GPT integration test

- Delegated simple change
- Committed journal

---
task_id: gpt-test-1
date: 2025-09-28T09:22:43.135Z
type: feat
scope: test
---
## GPT integration test

- Delegated simple change
- Committed journal

---
task_id: gpt-test-1
date: 2025-09-28T09:22:27.678Z
type: feat
scope: test
---
## GPT integration test

- Delegated simple change
- Committed journal

---
task_id: gpt-test-1
date: 2025-09-28T09:22:04.054Z
type: feat
scope: test
---
## GPT integration test

- Delegated simple change
- Committed journal

---
task_id: configure-claude-auto-accept-v1
date: 2025-09-14T23:34:21Z
type: feat
scope: workflow
---

## Enable and document claude-code auto-accept mode

Created a global `settings.json` for claude-code to enable `acceptEdits` by default, allowing for fully autonomous operation. Added a `CLAUDE_SETUP.md` file to document this essential configuration step for new developers or fresh installations.

---
task_id: create-eck-commit-command-v1
date: 2025-09-14T23:29:38Z
type: feat
scope: workflow
---

## Create custom /eck:commit claude-code command

Added a custom slash command to automate the new structured journaling and conventional commit process. This command takes structured input (type, scope, summary, details) and uses it to update JOURNAL.md and create a git commit, enforcing our new workflow.

# Development Journal

## Recent Changes
Track significant changes, decisions, and progress here.

---

### YYYY-MM-DD - Project Started
- Initial project setup
- Added basic structure
