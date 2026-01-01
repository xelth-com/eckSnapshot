# MiniMax Hybrid Architecture Integration

**Implemented:** 2026-01-02
**Status:** Active & Verified

## Overview
This project uses a **Supervisor-Worker** AI architecture to optimize costs and context window usage.
- **Supervisor:** Claude Code (Sonnet). Managing, strategy, file system ops.
- **Worker:** MiniMax-M2.1. Heavy lifting, reading large files, generating boilerplate.

## Component Structure

1.  **Bridge Script:** `scripts/mcp-minimax-worker.js`
    - Uses `@anthropic-ai/sdk` with a custom `baseURL` to talk to MiniMax.
    - Handles file reading internally (saving Supervisor tokens).
    - Exposes tool: `delegate_coding_task`.

2.  **Dependencies:**
    - `@modelcontextprotocol/sdk` (MCP Server)
    - `@anthropic-ai/sdk` (Client)

3.  **Operating Rules:** `CLAUDE.md`
    - Instructs Sonnet NOT to read files manually.
    - Enforces delegation for heavy tasks.

## Setup Instructions (Re-creation Guide)

If setting up on a new machine:

1.  **Install Deps:**
    ```bash
    npm install
    ```

2.  **Environment:**
    Add to `~/.bashrc` or `~/.zshrc`:
    ```bash
    export MINIMAX_API_KEY="sk-..."
    ```

3.  **Register MCP:**
    ```bash
    claude mcp add minimax-worker -- node scripts/mcp-minimax-worker.js
    ```

4.  **Verification:**
    Ask Claude: *"Analyze package.json using your delegate tool."*

## Troubleshooting
- **Logs:** If `undefined` is returned, check `minimax_debug.json` (if logging is enabled in script).
- **API Endpoint:** Uses `https://api.minimax.io/anthropic`.
