# 📸 eckSnapshot v6.0

A specialized, AI-native CLI tool designed to create and restore single-file text snapshots of Git repositories. Optimized for providing full project context to Large Language Models (LLMs) and serving as the coordination hub for AI Coders.

## 🎯 The Battle-Tested Workflow & Quick Start

I personally use this tool daily with local AI coding agents (**Claude Code** using Claude, and **OpenCode** using GLM). My reliable, heavily-tested workflow is:

### 1. Installation
```bash
npm install -g @xelth/eck-snapshot
```

### 2. Initial Context (Full Snapshots)
Take a full snapshot and feed it to a powerful Web LLM (Senior Architect like **Gemini** or **Grok**).
```bash
eck-snapshot snapshot
```
*(For massive monorepos, slice the context using profiles: `eck-snapshot snapshot --profile frontend`)*

### 3. Direct Execution
Pass the Architect's technical plan to your local Coder agent (Claude Code / OpenCode). The Coder will implement the changes directly in your repository.

### 4. Auto-Updates vs Manual Updates
When the Coder agent finishes a task, it automatically calls the built-in MCP tool (`eck_finish_task`), which commits the code and automatically generates an incremental delta update snapshot.

**Optional Manual Update:**
If you make manual changes yourself (without the agent), use this command to create a delta snapshot to sync your Web AI:
```bash
eck-snapshot update
```
This core loop is highly polished, actively maintained, and works exceptionally well.

## 🌟 Core Features

* **🔄 Smart Delta Updates:** Tracks incremental changes via Git anchors with sequential numbering. Accurately tracks and reports deleted files to prevent LLM hallucinations.
* **🛡️ Security (SecretScanner):** Automatically redacts API keys and credentials before sending context to LLMs. Features both Regex matching and **Shannon Entropy** analysis.
* **🔌 Native MCP Integration:** Instantly spins up Model Context Protocol (MCP) servers (`eck-core` for context sync) for Claude Code and OpenCode.
* **📁 The `.eck/` Manifest:** Automatically maintains project context files (`CONTEXT.md`, `ROADMAP.md`, `TECH_DEBT.md`) to onboard AI agents instantly.

---

## 🧪 Experimental / Advanced Features

*The following features are included in the tool, but I am not actively using them in my daily workflow right now. They are available for power users, but might have edge cases. If you use them and find issues, please open an issue on GitHub, or better yet, try fixing it yourself (you have the ultimate AI coding tool in your hands now!)*

* **🧠 Multi-Agent Protocol (Royal Court):** Built-in support for delegating tasks from a Senior Architect to Junior Managers (`--jas`, `--jao`, `--jaz`), who orchestrate a swarm of specialized GLM workers via MCP.
* **☠️ Skeleton Mode:** Uses `Tree-sitter` and `Babel` to strip function bodies (`--skeleton`), drastically reducing token count.
* **📊 Telemetry Hub:** Integrated with a Rust-based microservice for tracking agent execution metrics and auto-syncing token estimation weights.

## License
MIT © xelth-com
