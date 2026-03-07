# 📸 eckSnapshot v6.0

A specialized, AI-native CLI tool designed to create and restore single-file text snapshots of Git repositories. Optimized for providing full project context to Large Language Models (LLMs) and serving as the coordination hub for AI Coders.


## 🎯 The Battle-Tested Workflow & Quick Start

I personally use this tool daily with local AI coding agents (**Claude Code** using Claude, and **OpenCode** using GLM). My reliable, heavily-tested workflow is:

### 1. Installation
```bash
npm install -g @xelth/eck-snapshot
```

### 2. Initial Context (Full Snapshots)
Take a full snapshot and feed it to a powerful Web LLM (Senior Architect like **Gemini** or **Grok**). *(Note: **ChatGPT** also works, but you MUST paste the specific prompt provided at the end of the snapshot output as your first prompt).*
```bash
eck-snapshot
```
*(For massive monorepos, slice the context using profiles: `eck-snapshot --profile frontend`)*

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


## 💡 The Philosophy: Why force a full snapshot?

You've probably noticed a pattern: the longer you chat with an LLM about your codebase, the smarter it gets and the better its code becomes. 

How do you get that expert-level understanding from the very first prompt? You can't rely on an agent guessing which isolated files to read based on filenames. You need to force-feed it the entire context at once. 

Think of AI models like human engineers. Imagine a person standing next to a massive bookshelf of programming textbooks. The total amount of information available to them is exactly the same before they go to university and after they graduate. Both can open a book, check the table of contents, and look up a formula. Yet, the results they produce are vastly different. Why? Because the graduate has the structural context *inside their head*. 

LLMs work the exact same way. Giving an AI a "file search" tool is like putting a beginner next to the bookshelf. Forcing a complete project snapshot into the LLM's massive context window is like giving it a university degree in your specific codebase. That is what `eck-snapshot` does.

## License
MIT © xelth-com
