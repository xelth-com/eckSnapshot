# 🤖 Hybrid AI Architecture: Supervisor-Worker Integration

**Current Version:** v5.0.0
**Status:** Production Ready

## Overview

This project implements a cost-efficient **Supervisor-Worker** architecture to solve the "context window" problem.

- **Supervisor (Claude Sonnet):** Acts as the Project Lead. It manages the session, makes decisions, and delegates heavy tasks. It is configured to **never read large files directly**.
- **Worker (MiniMax M2.1):** Acts as the Senior Developer. It is accessed via a specialized tool that reads files internally and generates code/analysis at a fraction of the cost.

## 🚀 How to Enable This Feature

If you have cloned this repository and want to use the Hybrid mode, follow these steps:

### 1. Install Dependencies
```bash
npm install
```

### 2. Get a MiniMax API Key
1. Register at [MiniMax Platform](https://platform.minimax.io/).
2. Get your API Key.
3. Export it in your shell (`~/.bashrc` or `~/.zshrc`):
   ```bash
   export MINIMAX_API_KEY="sk-..."
   ```

### 3. Register the Worker Tool
Run this command in the project root to connect the MCP server to Claude:
```bash
claude mcp add minimax-worker -- node scripts/mcp-minimax-worker.js
```

### 4. Restart Claude
Restart your `claude` CLI session. The Supervisor mode is now active.

## Architecture Details

The integration is handled by:
- `scripts/mcp-minimax-worker.js`: An MCP server that bridges the Anthropic SDK to MiniMax's compatible API endpoint (`https://api.minimax.io/anthropic`).
- `CLAUDE.md`: System instructions that enforce the delegation protocol.
- `package.json`: Contains the `@modelcontextprotocol/sdk` and `@anthropic-ai/sdk` dependencies.
