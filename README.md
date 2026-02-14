
# eckSnapshot (v5.4.0)

A specialized CLI tool designed to create and restore single-file text snapshots of Git repositories. It is specifically optimized for providing full project context to Large Language Models (LLMs) like Claude, Gemini, and OpenCode.

🎉 **WE ARE BACK ON NPM!** Version 5.4.0 and onwards are officially available via the npm registry.

## 🚀 Quick Start

```bash
# Install globally via npm
npm install -g @xelth/eck-snapshot

# Create a snapshot of your current project
eck-snapshot
```

## ✨ Core Features

- **Skeleton Mode:** Strips function bodies using Tree-sitter and Babel to save massive amounts of context tokens.
- **Delta Updates:** Tracks changes via Git anchors and generates incremental snapshots (`eck-snapshot update`).
- **Royal Court Architecture:** Multi-agent protocol with dedicated modes for Claude Sonnet (JAS), Claude Opus (JAO), and Gemini (JAG).
- **GLM Z.AI Worker Fleet:** Built-in MCP server integration for delegating heavy coding tasks to specialized AI workers.
- **Security:** Built-in `SecretScanner` automatically redacts API keys and sensitive credentials before they hit the LLM context.
- **Context Profiles:** Smart filtering using auto-detected or manual profiles (e.g., `--profile backend`).

---

## 🛠️ The Core Workflow

### 1. Initial Context (Maximum Compression)
Create a lightweight map of your entire project. Bodies of functions are hidden, allowing huge monoliths to fit into the AI's context window.
```bash
eck-snapshot --skeleton
# -> Generates: .eck/snapshots/eck[Name]_[Hash]_sk.md
```

### 2. Lazy Loading (On-Demand Details)
If the AI needs to see the exact implementation of specific files, it can request them on demand.
```bash
eck-snapshot show src/auth.js src/utils/hash.js
```

### 3. Incremental Updates (Delta)
As you apply changes, the AI loses context. Instead of re-sending the full repository, send only what changed since the last snapshot!
```bash
eck-snapshot update
# -> Generates an update snapshot with git diffs and modified files
```

---

## 👑 Royal Court Architecture & GLM Z.AI

`eck-snapshot` is designed to orchestrate a hierarchy of AI agents:

- **Senior Architect:** (You / Gemini / ChatGPT) - Directs the high-level strategy.
- **Junior Architects:**
  - `JAS` (Sonnet 4.5): Fast manager for standard features. Run `eck-snapshot --jas`.
  - `JAO` (Opus 4.5): Deep thinker for critical architecture. Run `eck-snapshot --jao`.
  - `JAG` (Gemini 3 Pro): Massive context handler. Run `eck-snapshot --jag`.

### MCP Server Integration
Delegate heavy coding tasks (>100 lines) to the **GLM Z.AI Worker Fleet** to save expensive context window tokens.

1. Get your API key from [Z.AI](https://z.ai) and export it: `export ZAI_API_KEY="your-key-here"`
2. Setup the MCP servers for Claude Code or OpenCode:
   ```bash
   eck-snapshot setup-mcp --both
   ```
3. Your AI will now have access to specialized tools: `glm_zai_frontend`, `glm_zai_backend`, `glm_zai_qa`, `glm_zai_refactor`, and the `eck_finish_task` commit tool.

---

## 🧩 Context Profiles

If your repository is huge, you can partition it using Context Profiles:

```bash
# Auto-detect profiles using AI
eck-snapshot profile-detect

# List available profiles
eck-snapshot --profile

# Use a specific profile
eck-snapshot --profile backend

# Ad-hoc inclusion/exclusion
eck-snapshot --profile "src/**/*.js,-**/*.test.js"
```

## 🔐 Environment Syncing

Securely share your `.eck/` configuration (profiles, roadmap, AI instructions) between machines without committing them to the public git history:

```bash
# Encrypt and pack .eck/ config files
eck-snapshot env push

# Decrypt and restore on another machine
eck-snapshot env pull
```

## License
MIT License
