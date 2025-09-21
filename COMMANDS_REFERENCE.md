# Commands Reference

This document contains essential commands and setup instructions for the project's multi-agent architecture.

## Junior Architect (`gemini_wsl`) Setup Guide

This section explains how the `gemini_wsl` agent (Junior Architect) is configured to delegate coding tasks to the `claude` agent (Coder).

This architecture relies on `gemini-cli`'s custom tool feature.

## 1. Agent Definition

The Junior Architect (JA) is the `gemini_wsl` agent, which is an instance of `gemini-cli` running in WSL. It is defined in `setup.json`.

## 2. Custom Command (`claude.toml`)

The JA's ability to delegate to the Coder (`claude`) is defined by a custom `gemini-cli` command.

This command must be defined in a file named `claude.toml` and placed in the `gemini-cli` configuration directory (e.g., `~/.gemini/tools/claude.toml`).

### `claude.toml` Content

```toml
description = "Ask Claude (from the eckSnapshot project) to help with a task."
prompt = """!{node /mnt/c/Users/xelth/eckSnapshot/index.js ask-claude "{{args}}"}"""
```

## 3. JA Prompt (`agent-prompt.template.md`)

The JA *knows* how to *use* this command because its main system prompt (loaded from `src/templates/agent-prompt.template.md`) instructs it to.

This prompt *mandates* that the `{{args}}` it passes to the `/claude` command must be a single-line **JSON string** in the `apply_code_changes` format.

## 4. Execution Flow

1.  **Senior Architect (Gemini)** gives a high-level `execute_strategic_task` to `gemini_wsl`.
2.  **`gemini_wsl` (JA)** analyzes the task and formulates a low-level `apply_code_changes` JSON payload.
3.  **`gemini_wsl`** executes `/claude` with the JSON payload as a single string argument (`{{args}}`).
4.  **`claude.toml`** executes the `eck-snapshot ask-claude "{...}"` shell command.
5.  **`eck-snapshot`** (specifically `claudeCliService.js`) receives the JSON string as a 'prompt'.
6.  It forwards this prompt to the `claude-cli` binary (`local_dev`), which is smart enough to parse the JSON and execute the `apply_code_changes` task.

## Claude Code Commands

### Commit Command (`.claude/commands/eck/commit.md`)

A custom command for structured commits with automatic journaling. Place this file in `.claude/commands/eck/commit.md` to enable it in Claude Code.

**Usage:** `/commit <type> <scope> <summary> <details>`

**Function:**
- Stages all current changes
- Creates YAML frontmatter for journal entry with task_id, date, type, scope
- Creates markdown body with summary and details
- Prepends complete journal entry to `.eck/JOURNAL.md`
- Creates conventional commit message: `{type}({scope}): {summary}`
- Executes the commit

**Example:** `/commit feat api "Add user authentication" "Implemented JWT-based auth with login/logout endpoints"`

**Important:** This command should be preserved in git (via `.gitignore` rules) so it can be recreated if lost. The command integrates with the project's `.eck` manifest system for structured development journaling.