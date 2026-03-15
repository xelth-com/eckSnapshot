# 📸 eckSnapshot v6.1 (AI-Native Edition)

A specialized, AI-native CLI tool that creates single-file text snapshots of entire Git repositories and feeds them directly into LLM context windows. Instead of letting AI agents guess which files to read, eckSnapshot force-feeds the complete project into the model's context — giving it a "university degree" in your codebase from the very first prompt.

It also serves as the coordination hub for multi-agent AI coding workflows: generating role-specific instructions (`CLAUDE.md`, `AGENTS.md`), maintaining project manifests (`.eck/` directory), and providing MCP integration for automatic context sync after every code change.

---

## 📦 Installation

```bash
npm install -g @xelth/eck-snapshot
```

---

## 🎯 The Battle-Tested Workflow

### 1. Initial Context (Full Snapshot)
Take a full snapshot and feed it to a powerful **Web LLM** — the **Senior Architect**.

```bash
eck-snapshot
```

The generated `.md` file goes into the chat of your chosen Architect model. The Architect analyzes the full codebase and produces a detailed technical plan.

*(For massive monorepos, slice the context using profiles: `eck-snapshot '{"name": "eck_snapshot", "arguments": {"profile": "frontend"}}'`)*

### 2. Direct Execution
Pass the Architect's technical plan to your local **Coder agent** (Claude Code / OpenCode / Codex). The Coder implements the changes directly in your repository.

### 3. Auto-Updates
When the Coder agent finishes a task, it automatically calls the built-in MCP tool (`eck_finish_task`), which commits the code and generates an incremental delta update snapshot. Feed that update back to the Architect to keep it in sync.

---

## 🧠 Which Models to Use

### Senior Architect (Web LLM — reads the snapshot)

The Architect needs a **massive context window** and strong reasoning. Best choices:

| Model | Context | Notes |
|-------|---------|-------|
| **Gemini 2.5 Pro** | 1M tokens | Best for large projects. Handles huge snapshots effortlessly. |
| **Grok 3** | 128K tokens | Fast and capable. Great balance of speed and quality. |
| **Claude Opus 4** | 200K tokens | Excellent reasoning. Slightly smaller context but very precise. |
| **ChatGPT (o3/o4-mini)** | 128K tokens | Works, but can be slow and may ignore the snapshot instructions. If using ChatGPT, you **MUST** paste the specific prompt provided at the end of the snapshot output as your first message — otherwise it will act as a generic reviewer instead of assuming the Architect role. |

### Coder Agent (Local — executes the plan)

The Coder needs **tool access** (file editing, terminal, MCP) and works locally on your machine:

| Tool | Engine | Best For |
|------|--------|----------|
| **Claude Code** | Claude Sonnet/Opus 4 | Primary choice. Deep tool integration, MCP support. |
| **OpenCode** | Any model (GLM, Claude, etc.) | Lightweight alternative with AGENTS.md support. |
| **Codex CLI** | GPT models | OpenAI's coding agent. Supported via `.codex/config.toml`. |

### MCP Setup (One-Time)
Register the MCP servers so your Coder agent can auto-commit and sync context:
```bash
eck-snapshot setup-mcp
```

---

## 🤖 The AI-Native JSON Interface (New in v6.1)

`eck-snapshot` is a **100% pure JSON/MCP bridge**. AI agents interact with the CLI by passing a single JSON payload:

```bash
eck-snapshot '{"name": "eck_snapshot", "arguments": {"profile": "backend", "jas": true}}'
eck-snapshot '{"name": "eck_update"}'
```

### 🧑‍💻 Human Shims (For Convenience)
For humans typing in the terminal, short commands work too:
- `eck-snapshot` — Full snapshot
- `eck-snapshot update` — Delta update
- `eck-snapshot scout` — Recon tree generation
- `eck-snapshot fetch "src/**/*.rs"` — Fetch specific files
- `eck-snapshot setup-mcp` — Configure MCP servers

---

## 🕵️‍♂️ The Reconnaissance Protocol (Cross-Repo Exploration)

When your AI agent is working on **Project A**, but needs to understand how **Project B** works, feeding it a standard snapshot of Project B will cause "context pollution" (the AI will forget which project it is supposed to edit).

The Recon Protocol solves this by providing isolated, read-only data extraction.

**Step 1: Scout (Map the territory)**
Run this in the external repository you want to explore:
```bash
eck-snapshot scout
```
*Result:* Generates `.eck/recon/recon_tree_...md` — a directory tree with strict instructions telling the AI **NOT** to edit this code.

**Step 2: Fetch (Extract the data)**
Feed the `recon_tree` to your AI. It will ask you to run a fetch command for specific files:
```bash
eck-snapshot fetch "src/core/parser.js" "docs/**/*.md"
```
*Result:* Generates `.eck/recon/recon_data_...md` containing only the requested code, perfectly formatted for reading without losing the primary role.

---

## 🌟 Core Features

* **🔄 Smart Delta Updates:** Tracks incremental changes via Git anchors. Accurately tracks and reports deleted files to prevent LLM hallucinations.
* **🛡️ Security (SecretScanner):** Automatically redacts API keys and credentials before sending context to LLMs. Features both Regex matching and **Shannon Entropy** analysis.
* **🔌 Native MCP Integration:** Instantly spins up Model Context Protocol (MCP) servers (`eck-core` and `glm-zai`) for Claude Code, OpenCode, and Codex.
* **📁 The `.eck/` Manifest:** Automatically maintains project context files (`CONTEXT.md`, `ROADMAP.md`, `TECH_DEBT.md`). Dynamic scanning — any `.md` file you add to `.eck/` is automatically included in snapshots.
* **☠️ Skeleton Mode:** Uses Tree-sitter and Babel to strip function bodies, drastically reducing token count for huge codebases.
* **🧠 Multi-Agent Protocol:** Built-in support for delegating tasks from a Senior Architect to Junior Managers (`jas`, `jao`, `jaz`), who orchestrate specialized GLM workers via MCP.

## 💡 The Philosophy: Why force a full snapshot?

LLMs work like humans who have memorized a textbook. Giving an AI a "file search" tool is like putting a beginner next to a bookshelf — they have to guess what to look for. Forcing a complete project snapshot into the LLM's massive context window is like giving it a university degree in your specific codebase. That is what `eck-snapshot` does.

## Ethical Automation Policy

This project respects the Terms of Service of AI providers. We do not implement browser automation to bypass or spoof web chat interfaces intended for human use. All AI integrations use official APIs.

## License
MIT © xelth-com
<div align="right"><sup>made in Eschborn</sup></div>
