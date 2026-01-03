# MiniMax M2.1 Integration Guide

**Current Version:** v5.1.0
**Status:** Production Ready
**Platforms:** Linux, macOS, Windows

## Overview

This guide covers **two ways** to use MiniMax M2.1 with Claude Code:

1. **Supervisor-Worker Mode** (Hybrid): Claude delegates heavy tasks to MiniMax via MCP
2. **Standalone Mode**: Use MiniMax directly as your primary AI assistant

Choose the method that fits your workflow best, or use both!

---

## Method 1: Supervisor-Worker Mode (Hybrid Architecture)

This implements a cost-efficient **Supervisor-Worker** architecture to solve the "context window" problem.

- **Supervisor (Claude Sonnet):** Acts as the Project Lead. It manages the session, makes decisions, and delegates heavy tasks.
- **Worker (MiniMax M2.1):** Acts as the Senior Developer. It is accessed via a specialized tool that reads files internally and generates code/analysis at a fraction of the cost.

### How to Enable This Feature

#### Step 1: Get a MiniMax API Key

1. Register at [MiniMax Platform](https://platform.minimax.io/)
2. Obtain your API key (starts with `sk-cp-...`)

#### Step 2: Create the MCP Worker Script

Create a directory for scripts and add the worker file:

<details>
<summary><b>Linux / macOS</b></summary>

```bash
mkdir -p ~/scripts
cd ~/scripts
npm init -y
npm install @modelcontextprotocol/sdk @anthropic-ai/sdk
```

Create `~/scripts/mcp-minimax-worker.js`:
</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
mkdir $env:USERPROFILE\scripts -Force
cd $env:USERPROFILE\scripts
npm init -y
npm install @modelcontextprotocol/sdk @anthropic-ai/sdk
```

Create `%USERPROFILE%\scripts\mcp-minimax-worker.js`:
</details>

**Worker Script Content** (`mcp-minimax-worker.js`):

```javascript
#!/usr/bin/env node
/**
 * MCP MiniMax Worker - Bridges Claude to MiniMax M2.1
 * Provides a "delegate_to_minimax" tool for heavy code generation tasks
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;

if (!MINIMAX_API_KEY) {
  console.error("ERROR: MINIMAX_API_KEY environment variable is not set");
  process.exit(1);
}

// Initialize Anthropic client pointing to MiniMax endpoint
const client = new Anthropic({
  apiKey: MINIMAX_API_KEY,
  baseURL: "https://api.minimax.io/anthropic",
});

const server = new Server(
  { name: "minimax-worker", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "delegate_to_minimax",
      description: `Delegate a coding task to MiniMax M2.1 (a powerful, cost-effective LLM with 1M token context).

USE THIS TOOL WHEN:
- Generating large amounts of code
- Refactoring entire files or modules
- Analyzing large codebases
- Any task requiring deep code understanding

The worker can read files internally - just specify paths in your prompt.`,
      inputSchema: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "Detailed description of the coding task to perform",
          },
          files: {
            type: "array",
            items: { type: "string" },
            description: "List of file paths to read and include in context",
          },
          max_tokens: {
            type: "number",
            description: "Maximum tokens for response (default: 16000)",
          },
        },
        required: ["task"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "delegate_to_minimax") {
    return {
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const { task, files = [], max_tokens = 16000 } = request.params.arguments;

  // Read requested files
  let fileContents = "";
  for (const filePath of files) {
    try {
      const absolutePath = path.resolve(filePath);
      const content = fs.readFileSync(absolutePath, "utf-8");
      fileContents += `\n--- FILE: ${filePath} ---\n${content}\n`;
    } catch (err) {
      fileContents += `\n--- FILE: ${filePath} ---\nERROR: Could not read file: ${err.message}\n`;
    }
  }

  const prompt = fileContents
    ? `${task}\n\n=== FILES ===\n${fileContents}`
    : task;

  try {
    const response = await client.messages.create({
      model: "MiniMax-M2.1",
      max_tokens: max_tokens,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return {
      content: [{ type: "text", text }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `MiniMax API Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

Make sure `package.json` has `"type": "module"`:

```json
{
  "name": "mcp-minimax-worker",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

#### Step 3: Set Environment Variable & Register MCP Server

<details>
<summary><b>Linux / macOS</b></summary>

```bash
# Add to ~/.bashrc or ~/.zshrc
export MINIMAX_API_KEY="sk-cp-your-key-here"

# Apply changes
source ~/.bashrc

# Register the MCP server
claude mcp add minimax-worker -- node ~/scripts/mcp-minimax-worker.js
```

</details>

<details>
<summary><b>Windows (CMD)</b></summary>

```cmd
:: Set environment variable permanently
setx MINIMAX_API_KEY "sk-cp-your-key-here"

:: Register the MCP server with env variable
claude mcp add minimax-worker -e MINIMAX_API_KEY="%MINIMAX_API_KEY%" -- node %USERPROFILE%\scripts\mcp-minimax-worker.js
```

</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
# Set environment variable permanently
[System.Environment]::SetEnvironmentVariable("MINIMAX_API_KEY", "sk-cp-your-key-here", "User")

# Register the MCP server with env variable
claude mcp add minimax-worker -e MINIMAX_API_KEY="$env:MINIMAX_API_KEY" -- node $env:USERPROFILE\scripts\mcp-minimax-worker.js
```

</details>

#### Step 4: Restart Claude

Restart your `claude` CLI session completely (`exit` then `claude`). The Supervisor mode is now active.

#### Step 5: Verify Installation

```bash
claude mcp list
```

Expected output:
```
minimax-worker: node .../mcp-minimax-worker.js - ✓ Connected
```

### Usage

Once configured, Claude will have access to the `delegate_to_minimax` tool. You can trigger it by saying:

```
Delegate to MiniMax: analyze this file and suggest optimizations
```

Or Claude may automatically delegate heavy tasks when appropriate.

---

## Method 2: Standalone Mode (Direct MiniMax Usage)

If you prefer to use MiniMax M2.1 as your primary AI assistant instead of Claude, you can set up a standalone configuration.

### Why Use Standalone Mode?

- **Lower cost:** MiniMax M2.1 is more cost-effective than Claude for bulk operations
- **Larger context window:** 1M tokens - better for processing entire large projects at once
- **Simpler workflow:** No need for delegation - MiniMax handles everything directly

### Setup Instructions

#### 1. Get a MiniMax API Key

1. Register at [MiniMax Platform](https://platform.minimax.io/)
2. Obtain your API key (starts with `sk-cp-...`)

#### 2. Configure Your Shell

<details>
<summary><b>Linux / macOS (Bash/Zsh)</b></summary>

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

Apply changes:

```bash
source ~/.bashrc  # or source ~/.zshrc
```

</details>

<details>
<summary><b>Windows (Batch Script)</b></summary>

**Step 1:** Set the API key permanently:

```cmd
setx MINIMAX_API_KEY "sk-cp-your-key-here"
```

**Step 2:** Create `minimax.cmd` in a PATH directory (e.g., `%USERPROFILE%\AppData\Roaming\npm\`):

```cmd
@echo off
REM MiniMax M2.1 Standalone Configuration for Windows
REM Usage: minimax [your prompt]

set ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
set ANTHROPIC_AUTH_TOKEN=%MINIMAX_API_KEY%
set API_TIMEOUT_MS=3000000
set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
set ANTHROPIC_MODEL=MiniMax-M2.1
set ANTHROPIC_SMALL_FAST_MODEL=MiniMax-M2.1
set ANTHROPIC_DEFAULT_SONNET_MODEL=MiniMax-M2.1

claude %*
```

**Step 3:** Open a **new terminal** (environment variables apply to new sessions only).

</details>

<details>
<summary><b>Windows (PowerShell Profile)</b></summary>

**Step 1:** Set the API key permanently:

```powershell
[System.Environment]::SetEnvironmentVariable("MINIMAX_API_KEY", "sk-cp-your-key-here", "User")
```

**Step 2:** Add function to your PowerShell profile (`$PROFILE`):

```powershell
# Open profile for editing
notepad $PROFILE
```

Add this function:

```powershell
function minimax {
    $env:ANTHROPIC_BASE_URL = "https://api.minimax.io/anthropic"
    $env:ANTHROPIC_AUTH_TOKEN = $env:MINIMAX_API_KEY
    $env:API_TIMEOUT_MS = "3000000"
    $env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1"
    $env:ANTHROPIC_MODEL = "MiniMax-M2.1"
    $env:ANTHROPIC_SMALL_FAST_MODEL = "MiniMax-M2.1"
    $env:ANTHROPIC_DEFAULT_SONNET_MODEL = "MiniMax-M2.1"

    claude @args
}
```

**Step 3:** Reload profile:

```powershell
. $PROFILE
```

</details>

#### 3. Use MiniMax

Now you can use `minimax` command just like you would use `claude`:

```bash
# Navigate to your project
cd ~/my-project

# Start an interactive session
minimax

# Or run with a prompt
minimax "Analyze this codebase and suggest improvements"

# Pipe a file for analysis
minimax "Summarize this code" < src/main.js
```

---

## Comparison: Standalone vs Supervisor-Worker

| Feature | Standalone Mode | Supervisor-Worker Mode |
|---------|----------------|------------------------|
| **Cost** | Low (MiniMax only) | Moderate (Claude + MiniMax) |
| **Setup Complexity** | Simple (alias/script) | Moderate (MCP server) |
| **Best For** | Bulk refactoring, large analysis | Interactive development, mixed tasks |
| **Context Management** | Manual | Automated (MCP handles file reading) |
| **Flexibility** | Direct control | Intelligent delegation |
| **Model Switching** | Fixed to MiniMax | Claude decides when to delegate |

**Recommendations:**
- Use **Standalone** for batch processing and cost-sensitive operations
- Use **Supervisor-Worker** for interactive development where you want Claude's reasoning with MiniMax's capacity

---

## Troubleshooting

### Supervisor-Worker Mode

| Problem | Solution |
|---------|----------|
| Tool not found after registration | Restart Claude completely (`exit` → `claude`) |
| MiniMax API Error | Verify API key: `echo $MINIMAX_API_KEY` (Linux/macOS) or `echo %MINIMAX_API_KEY%` (Windows) |
| MCP server fails to connect | Check if Node.js is in PATH: `node --version` |
| "MINIMAX_API_KEY not set" error | On Windows, use `-e` flag when registering: `claude mcp add minimax-worker -e MINIMAX_API_KEY="your-key" -- node ...` |

### Standalone Mode

| Problem | Solution |
|---------|----------|
| `minimax: command not found` | Run `source ~/.bashrc` or open new terminal |
| API timeout errors | Already configured with 50min timeout (`API_TIMEOUT_MS=3000000`) |
| Windows: `minimax` not recognized | Ensure `minimax.cmd` is in a PATH directory, or use full path |
| Environment variable not found | On Windows, `setx` only affects NEW terminals |

### Common Issues (Both Modes)

| Problem | Solution |
|---------|----------|
| Authentication failed | Verify API key at [MiniMax Platform](https://platform.minimax.io/) |
| Rate limit exceeded | Wait a few minutes and retry |
| Connection timeout | Check internet connectivity and firewall settings |

---

## Quick Reference

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MINIMAX_API_KEY` | Your MiniMax API key | `sk-cp-abc123...` |
| `ANTHROPIC_BASE_URL` | MiniMax API endpoint | `https://api.minimax.io/anthropic` |
| `ANTHROPIC_MODEL` | Model to use | `MiniMax-M2.1` |
| `API_TIMEOUT_MS` | Request timeout (ms) | `3000000` (50 minutes) |

### MCP Commands

```bash
# List registered MCP servers
claude mcp list

# Add MCP server
claude mcp add <name> -- <command>

# Add with environment variable
claude mcp add <name> -e KEY="value" -- <command>

# Remove MCP server
claude mcp remove <name>
```

---

## Additional Resources

- [MiniMax Official Documentation](https://platform.minimax.io/docs)
- [Claude Code MCP Documentation](https://docs.anthropic.com/claude/docs/mcp)
- [MiniMax API Reference](https://platform.minimax.io/docs/api)

---

*Last updated: 2026-01-03*
