# 📸 eckSnapshot v6.0

A specialized, AI-native CLI tool designed to create and restore single-file text snapshots of Git repositories. Optimized for providing full project context to Large Language Models (LLMs) and serving as the coordination hub for Multi-Agent AI Architectures.

## 🌟 Key Features

* **🧠 Multi-Agent Protocol (Royal Court):** Built-in support for the "Royal Court" architecture. Delegate tasks from a Senior Architect (Claude/Gemini/Grok. *Note: ChatGPT works but is slower with large context and requires a specific prompt*) to Junior Managers, who orchestrate a swarm of specialized GLM-4.7 workers.
* **☠️ Skeleton Mode:** Uses `Tree-sitter` and `Babel` to strip function bodies, drastically reducing token count while preserving structural context. Supports JS/TS, Rust, Go, Python, C, Java, and Kotlin.
* **🔄 Smart Delta Updates:** Tracks incremental changes via Git anchors with sequential numbering. Now accurately tracks and reports deleted files to prevent LLM hallucinations.
* **🛡️ Security (SecretScanner):** Automatically redacts API keys and credentials before sending context to LLMs. Features both Regex matching and **Shannon Entropy** analysis for catching non-standard hardcoded secrets.
* **📊 Telemetry Hub:** Integrated with a Rust-based microservice (`eck-telemetry`) for tracking agent execution metrics, auto-syncing token estimation weights via linear regression, and in-memory caching.
* **🔌 Native MCP Integration:** Instantly spins up Model Context Protocol (MCP) servers (`eck-core` for context sync and `glm-zai` for worker swarms) for Claude Code and OpenCode.

## 🚀 Quick Start

### Installation
```bash
npm install -g @xelth/eck-snapshot
```

### Basic Usage
```bash
# Create a standard full snapshot
eck-snapshot snapshot

# Create a highly compressed skeleton snapshot
eck-snapshot snapshot --skeleton

# Create an incremental update (only changed/deleted files)
eck-snapshot update
```

## 🤖 AI Swarm Setup (GLM Z.AI)

eckSnapshot v6 acts as the bridge between your primary AI IDE (Claude Code or OpenCode) and a cost-effective GLM-4.7 worker swarm.

1. **Get an API Key:** Register at [Z.AI](https://z.ai) and set `export ZAI_API_KEY="your-key"`.
2. **Setup MCP Servers:**
   ```bash
   eck-snapshot setup-mcp --both
   ```
3. **Initialize Project Manifests:**
   ```bash
   # Generates smart instructions (CLAUDE.md / AGENTS.md)
   eck-snapshot snapshot --jas  # For Claude Code (Sonnet 4.5)
   eck-snapshot snapshot --jaz  # For OpenCode (GLM-4.7)
   ```

## 📁 The `.eck/` Manifest Directory

eckSnapshot automatically maintains a `.eck/` directory in your project to provide deep context to AI agents:
- `CONTEXT.md` - High-level architecture (Auto-generated)
- `ENVIRONMENT.md` - Runtime specifics (Auto-generated)
- `ROADMAP.md` & `TECH_DEBT.md` - Strategic planning
- `RUNTIME_STATE.md` - Live port/process status

*Note: The tool automatically filters confidential files like `SERVER_ACCESS.md` from snapshots to ensure security.*

## 📈 Token Estimation

Train the local estimator to perfectly predict token counts for your specific project:
```bash
# Manually push agent telemetry
eck-snapshot telemetry push

# Sync global token weights from the Telemetry Hub
eck-snapshot telemetry sync-weights
```

## License
MIT © xelth-com
