---
type: fix
scope: cli
summary: Fix timezone mismatch in snapshots
timestamp: 2026-01-01T16:05:00Z
---

- Replaced toISOString() (UTC) with generateTimestamp() for filenames in createSnapshot.js and updateSnapshot.js
- Changed aiHeader.js to use toLocaleString() for display timestamps
- Ensures snapshots respect user's local system time and timezone

---
type: refactor
scope: cli
summary: Switch standard mode to Eck-Protocol v2
timestamp: 2026-01-01T15:55:00Z
---

- Removed legacy JSON command format from standard snapshots
- Implemented Eck-Protocol v2 instructions (Markdown + XML + Metadata) in aiHeader.js
- Ensures reliable code generation without JSON escaping issues

---
type: fix
scope: cli
summary: Hide Gemini agents in standard snapshots
timestamp: 2026-01-01T15:45:00Z
---

- Updated aiHeader.js to filter out gemini-related agents from the prompt unless --with-ja is used
- Removed gemini_windows from standard mode command formats
- Prevents context leakage of JA workflow details in standard architectural snapshots

---
type: refactor
scope: cli
summary: Make JA workflow instructions conditional
timestamp: 2025-12-21T22:09:31Z
---

- Replaced static JA workflow text in templates with dynamic placeholders
- Updated aiHeader.js to only inject JA instructions if --with-ja flag is present
- Simplified workflow description for standard snapshots
---
task_id: feat-browser-automation-config-v1
date: 2025-12-21
type: feat
scope: config
---

# Enable Claude Chrome MCP browser automation capabilities

- Added browser automation capabilities to local_dev agent: 'browser automation (chrome_mcp)', 'visual regression testing', 'network logging'
- Created browserAutomation section in aiInstructions with detailed capabilities and restrictions
- Documented Chrome MCP integration for frontend testing, debugging, and visual regression

---
task_id: refine-help-guide-text-v2
date: 2025-11-08
type: docs
scope: cli
---

# Refine help text for generate-profile-guide

- Clarified that `generate-profile-guide` is the recommended alternative to `profile-detect` for very large projects where the underlying AI's context window may be insufficient.

---
task_id: feat-implement-english-help-guide-v2
date: 2025-11-08
type: feat
scope: cli
---

# Implement detailed, workflow-driven help text

- Replaced the main `--help` output with a step-by-step guide in English, formatted for console readability.
- The guide now prioritizes the core workflow: snapshot, profile-detect, using profiles, and pruning.
- Added clear, console-style usage examples for each key step.

---
task_id: fix-profile-detect-and-add-index-viewer-v1
date: 2025-10-10
type: fix
scope: cli
---

# Fix JSON parsing in profile-detect

- Modified extractJson to be more robust against AI log wrappers
- Finds first '{' and last '}' to extract JSON from surrounding text
- Added /managed_components/ to .gitignore
- Implemented new index-view command to inspect code chunks database
- This resolves the crash when running the profile-detect command

---
task_id: feat-c-language-support-v1
date: 2025-10-10
type: feat
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
