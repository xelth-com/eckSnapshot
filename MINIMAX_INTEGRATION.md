# 🤖 MiniMax M2.1 Integration Guide

**Current Version:** v5.0.0
**Status:** Production Ready

## Overview

This guide covers **two ways** to use MiniMax M2.1 with eckSnapshot:

1. **Supervisor-Worker Mode** (Hybrid): Claude delegates heavy tasks to MiniMax via MCP
2. **Standalone Mode**: Use MiniMax directly as your primary AI assistant

Choose the method that fits your workflow best, or use both!

---

## Method 1: Supervisor-Worker Mode (Hybrid Architecture)

This implements a cost-efficient **Supervisor-Worker** architecture to solve the "context window" problem.

- **Supervisor (Claude Sonnet):** Acts as the Project Lead. It manages the session, makes decisions, and delegates heavy tasks.
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

**GitHub Reference:**
- Full implementation: [`scripts/mcp-minimax-worker.js`](https://github.com/xelth-com/eckSnapshot/blob/main/scripts/mcp-minimax-worker.js)
- Project guidelines: [`CLAUDE.md`](https://github.com/xelth-com/eckSnapshot/blob/main/CLAUDE.md)

---

## Method 2: Standalone Mode (Direct MiniMax Usage)

If you prefer to use MiniMax M2.1 as your primary AI assistant instead of Claude, you can set up a standalone configuration.

### Why Use Standalone Mode?

- **Lower cost:** MiniMax M2.1 is more cost-effective than Claude for bulk operations
- **Larger context window:** Better for processing entire large projects at once
- **Simpler workflow:** No need for delegation - MiniMax handles everything directly

### Setup Instructions

#### 1. Get a MiniMax API Key
1. Register at [MiniMax Platform](https://platform.minimax.io/)
2. Obtain your API key (starts with `sk-cp-...`)

#### 2. Configure Shell Alias

Add this to your `~/.bashrc` or `~/.zshrc`:

```bash
# MiniMax M2.1 Standalone Configuration
export MINIMAX_API_KEY="sk-cp-your-key-here"

alias minimax='ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic" \
ANTHROPIC_AUTH_TOKEN="$MINIMAX_API_KEY" \
API_TIMEOUT_MS="3000000" \
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
ANTHROPIC_MODEL="MiniMax-M2.1" \
ANTHROPIC_SMALL_FAST_MODEL="MiniMax-M2.1" \
ANTHROPIC_DEFAULT_SONNET_MODEL="MiniMax-M2.1" \
claude'
```

#### 3. Apply Changes

```bash
source ~/.bashrc  # or source ~/.zshrc
```

#### 4. Use MiniMax

Now you can use `minimax` command just like you would use `claude`:

```bash
# Navigate to your project
cd ~/my-project

# Create a snapshot
eck-snapshot

# Use MiniMax to analyze it
minimax "Analyze this codebase and suggest improvements" < .eck/snapshots/my-project_snapshot_*.md

# Or start an interactive session
minimax
```

### Standalone vs Hybrid: Which to Choose?

| Feature | Standalone Mode | Supervisor-Worker Mode |
|---------|----------------|------------------------|
| **Cost** | Low | Moderate (Claude + MiniMax) |
| **Setup Complexity** | Simple (just an alias) | Moderate (MCP setup required) |
| **Best For** | Bulk refactoring, large analysis | Interactive development, mixed tasks |
| **Context Management** | Manual (you manage snapshots) | Automated (MCP handles file reading) |
| **Flexibility** | Direct control | Intelligent delegation |

**Recommendation:**
- Use **Standalone** for batch processing and cost-sensitive operations
- Use **Supervisor-Worker** for interactive development where you want Claude's interface with MiniMax's power

**GitHub Reference:**
- Example shell configuration: [`.bashrc` alias setup](https://github.com/xelth-com/eckSnapshot/blob/main/docs/minimax-standalone-setup.md)

---

## Troubleshooting

### Supervisor-Worker Mode

**Problem:** Tool not found after registration
- **Solution:** Restart Claude Code session completely (`exit` then `claude`)

**Problem:** MiniMax API Error
- **Solution:** Verify `MINIMAX_API_KEY` is exported: `echo $MINIMAX_API_KEY`

### Standalone Mode

**Problem:** `minimax: command not found`
- **Solution:** Run `source ~/.bashrc` or open a new terminal

**Problem:** API timeout errors
- **Solution:** The alias already includes `API_TIMEOUT_MS="3000000"` for large requests

---

## Additional Resources

- [How to Change API Key](docs/minimax-change-api-key.md) - Step-by-step guide for updating your MiniMax API key
- [MiniMax Official Documentation](https://platform.minimax.io/docs)
- [Claude Code MCP Documentation](https://docs.anthropic.com/claude/docs/mcp)
- [eckSnapshot GitHub Repository](https://github.com/xelth-com/eckSnapshot)
