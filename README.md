# 📸 eckSnapshot v6.1 (AI-Native Edition)

A specialized, AI-native CLI tool that creates single-file text snapshots of entire Git repositories and feeds them directly into LLM context windows. Instead of letting AI agents guess which files to read, eckSnapshot force-feeds the complete project into the model's context — giving it a "university degree" in your codebase from the very first prompt.

It also serves as the coordination hub for multi-agent AI coding workflows: generating role-specific instructions (`CLAUDE.md`, `AGENTS.md`), maintaining project manifests (`.eck/` directory), and providing MCP integration for automatic context sync after every code change.

---

## 🤖 The AI-Native JSON Interface (New in v6.1)

`eck-snapshot` is no longer a traditional CLI with human-centric flags (like `--depth` or `--no-tree`). It is a **100% pure JSON/MCP bridge**.

AI agents interact with the CLI by passing a single JSON payload representing an MCP tool call.

**How AI agents use it:**
```bash
eck-snapshot '{"name": "eck_snapshot", "arguments": {"profile": "backend", "jas": true}}'
eck-snapshot '{"name": "eck_update_auto", "arguments": {}}'
```

### 🧑‍💻 Human Shims (For Convenience)
For human users typing in the terminal, we provide legacy command shims that automatically translate to JSON under the hood:
- `eck-snapshot` ➡️ Runs full snapshot
- `eck-snapshot update` ➡️ Runs delta update
- `eck-snapshot scout` ➡️ Runs reconnaissance tree generation
- `eck-snapshot fetch "src/**/*.rs"` ➡️ Fetches specific files

---

## 🎯 The Battle-Tested Workflow

### 1. Initial Context (Full Snapshots)
Take a full snapshot and feed it to a powerful Web LLM (Senior Architect like **Gemini** or **Grok**).
```bash
eck-snapshot
```
*(For massive monorepos, slice the context using profiles: `eck-snapshot '{"name": "eck_snapshot", "arguments": {"profile": "frontend"}}'`)*

### 2. Direct Execution
Pass the Architect's technical plan to your local Coder agent (Claude Code / OpenCode). The Coder will implement the changes directly in your repository.

### 3. Auto-Updates
When the Coder agent finishes a task, it automatically calls the built-in MCP tool (`eck_finish_task`), which commits the code and automatically generates an incremental delta update snapshot.

---

## 🕵️‍♂️ The Reconnaissance Protocol (Cross-Repo Exploration)

When your AI agent is working on **Project A**, but needs to understand how **Project B** works, feeding it a standard snapshot of Project B will cause "context pollution" (the AI will forget which project it is supposed to edit).

The Recon Protocol solves this by providing isolated, read-only data extraction.

**Step 1: Scout (Map the territory)**
Run this in the external repository you want to explore:
```bash
eck-snapshot scout
```
*Result:* Generates `.eck/recon/recon_tree_...md`. This file contains the directory tree and strict instructions telling the AI **NOT** to edit this code.

**Step 2: Fetch (Extract the data)**
Feed the `recon_tree` to your AI. It will respond by asking you to run a fetch command for specific files it needs:
```bash
eck-snapshot fetch "src/core/parser.js" "docs/**/*.md"
```
*Result:* Generates `.eck/recon/recon_data_...md` containing only the requested code, perfectly formatted for your AI to read without losing its primary role.

---

## 🌟 Core Features

* **🔄 Smart Delta Updates:** Tracks incremental changes via Git anchors. Accurately tracks and reports deleted files to prevent LLM hallucinations.
* **🛡️ Security (SecretScanner):** Automatically redacts API keys and credentials before sending context to LLMs. Features both Regex matching and **Shannon Entropy** analysis.
* **🔌 Native MCP Integration:** Instantly spins up Model Context Protocol (MCP) servers (`eck-core` and `glm-zai`) for Claude Code, OpenCode, and Codex.
* **📁 The `.eck/` Manifest:** Automatically maintains project context files (`CONTEXT.md`, `ROADMAP.md`, `TECH_DEBT.md`). Dynamic scanning — any `.md` file you add to `.eck/` is automatically included in snapshots.

## 💡 The Philosophy: Why force a full snapshot?

LLMs work like humans who have memorized a textbook. Giving an AI a "file search" tool is like putting a beginner next to a bookshelf—they have to guess what to look for. Forcing a complete project snapshot into the LLM's massive context window is like giving it a university degree in your specific codebase. That is what `eck-snapshot` does.

## Ethical Automation Policy

This project respects the Terms of Service of AI providers. We do not implement browser automation to bypass or spoof web chat interfaces intended for human use. All AI integrations use official APIs.

## License
MIT © xelth-com
<div align="right"><sup>made in Eschborn</sup></div>
