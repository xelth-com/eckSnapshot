# 📸 eckSnapshot v6.0

A specialized, AI-native CLI tool designed to create and restore single-file text snapshots of Git repositories. Optimized for providing full project context to Large Language Models (LLMs) and serving as the coordination hub for AI Coders.

## 🎯 The Battle-Tested Workflow (Author's Note)

I personally use this tool daily with both **Claude Code** and **OpenCode**. My reliable, heavily-tested workflow is:

1. **Full Snapshots:** I take a full snapshot (`eck-snapshot snapshot`) and feed it to a powerful Web LLM (Senior Architect like Gemini 1.5 Pro or Grok 3).
2. **Context Profiles:** If the project is huge, I use context profiles (`--profile frontend`) to slice it into manageable pieces.
3. **Direct Execution:** I write code directly using the Senior Architect's guidance and execute tasks via local Coders (Claude/OpenCode).
4. **Incremental Updates:** After changes are made, I use delta updates (`eck-snapshot update`) to keep the Architect's context perfectly synced without resending the whole repo.

This core loop is highly polished, actively maintained, and works exceptionally well.

## 🚀 Quick Start

### Installation
```bash
npm install -g @xelth/eck-snapshot
```

### Basic Usage
```bash
# 1. Create a standard full snapshot (Core Workflow)
eck-snapshot snapshot

# 2. Use profiles for large monorepos
eck-snapshot snapshot --profile backend

# 3. Create an incremental update (only changed/deleted files)
eck-snapshot update
```

## 🌟 Core Features

* **🔄 Smart Delta Updates:** Tracks incremental changes via Git anchors with sequential numbering. Accurately tracks and reports deleted files to prevent LLM hallucinations.
* **🛡️ Security (SecretScanner):** Automatically redacts API keys and credentials before sending context to LLMs. Features both Regex matching and **Shannon Entropy** analysis.
* **🔌 Native MCP Integration:** Instantly spins up Model Context Protocol (MCP) servers (`eck-core` for context sync) for Claude Code and OpenCode.
* **📁 The `.eck/` Manifest:** Automatically maintains project context files (`CONTEXT.md`, `ROADMAP.md`, `TECH_DEBT.md`) to onboard AI agents instantly.

---

## 🧪 Experimental / Advanced Features

*The following features are included in the tool, but I am not actively using them in my daily workflow right now. They are available for power users, but might have edge cases. If you use them and find issues, please open an issue on GitHub, or better yet, try fixing it yourself (you have the ultimate AI coding tool in your hands now!)*

* **🧠 Multi-Agent Protocol (Royal Court):** Built-in support for delegating tasks from a Senior Architect to Junior Managers (`--jas`, `--jao`, `--jaz`), who orchestrate a swarm of specialized GLM-4.7 workers via MCP.
* **☠️ Skeleton Mode:** Uses `Tree-sitter` and `Babel` to strip function bodies (`--skeleton`), drastically reducing token count.
* **📊 Telemetry Hub:** Integrated with a Rust-based microservice for tracking agent execution metrics and auto-syncing token estimation weights.

## License
MIT © xelth-com
