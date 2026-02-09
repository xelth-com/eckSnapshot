# AI Integration Guide

**Current Version:** v5.1.0
**Status:** Production Ready

## Overview

This guide covers how to use eckSnapshot with the available AI coding tools:

1. **Claude Code** (Sonnet 4.5 / Opus 4.6) - Primary interactive coding agent
2. **OpenCode** (GLM-4.7 Z.AI Coding Plan) - Alternative coding agent
3. **GLM Z.AI Worker** (MCP) - Cost-effective worker for heavy coding tasks

All tools share the same MCP infrastructure:
- **eck-core**: `eck_finish_task` tool for committing and snapshotting
- **glm-zai**: `glm_zai_*` tools for delegating coding to GLM-4.7

---

## Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Get a Z.AI API Key
1. Register at [Z.AI](https://z.ai)
2. Get your API key
3. Export it:
   ```bash
   # Linux/Mac
   export ZAI_API_KEY="your-key-here"

   # Windows (PowerShell)
   $env:ZAI_API_KEY = "your-key-here"

   # Windows (CMD)
   set ZAI_API_KEY=your-key-here
   ```

### 3. Register MCP Servers

**For Claude Code:**
```bash
eck-snapshot setup-mcp
```

**For OpenCode:**
```bash
eck-snapshot setup-mcp --opencode
```

**For Both:**
```bash
eck-snapshot setup-mcp --both
```

### 4. Restart Your Tool
Restart Claude Code or OpenCode to load the MCP servers.

---

## Architecture: Supervisor-Worker Mode

```
Junior Architect (Claude Sonnet/Opus or OpenCode GLM-4.7)
    │
    ├─ Direct execution (small tasks, <50 lines)
    │   └─ Read, Edit, Bash tools
    │
    └─ Delegate to GLM Z.AI Worker (heavy tasks, >100 lines)
        ├─ glm_zai_frontend: React/Vue/Tailwind specialist
        ├─ glm_zai_backend: Node.js/API/Auth specialist
        ├─ glm_zai_qa: Test automation engineer
        ├─ glm_zai_refactor: Code quality specialist
        └─ glm_zai_general: Full-stack generalist
```

The supervisor reads files itself for small tasks. For heavy coding (>100 lines),
it delegates to GLM Z.AI workers which read files internally and return code directly.
This saves the supervisor's expensive context window tokens.

---

## Using with Claude Code

### Configure Project Role

```bash
# Standard developer mode (default CLAUDE.md)
eck-snapshot snapshot

# Junior Architect Sonnet - with delegation protocol
eck-snapshot --jas

# Junior Architect Opus - with enhanced verification
eck-snapshot --jao
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `eck_finish_task` | Commit + snapshot (use instead of `git commit`) |
| `glm_zai_backend` | Delegate backend coding to GLM-4.7 |
| `glm_zai_frontend` | Delegate frontend coding to GLM-4.7 |
| `glm_zai_qa` | Delegate test writing to GLM-4.7 |
| `glm_zai_refactor` | Delegate refactoring to GLM-4.7 |
| `glm_zai_general` | Delegate general coding to GLM-4.7 |

### Manual MCP Registration (if setup-mcp doesn't work)

```bash
# Register eck-core (commit + snapshot)
claude mcp add eck-core -- node scripts/mcp-eck-core.js

# Register GLM Z.AI workers
claude mcp add glm-zai -- node scripts/mcp-glm-zai-worker.mjs

# Register full ecksnapshot MCP server (alternative to eck-core)
claude mcp add ecksnapshot -- node src/mcp-server/index.js
```

---

## Using with OpenCode

### Configure Agent

```bash
# Generate AGENTS.md for OpenCode (Sonnet mode)
eck-snapshot --jas

# Generate AGENTS.md for OpenCode (Opus mode)
eck-snapshot --jao
```

This generates `AGENTS.md` with YAML frontmatter that OpenCode reads for agent configuration.

### OpenCode MCP Config

After running `eck-snapshot setup-mcp --opencode`, the config is saved to `.opencode/mcp.json`:

```json
{
  "mcpServers": {
    "eck-core": {
      "command": "node",
      "args": ["<path>/scripts/mcp-eck-core.js"]
    },
    "glm-zai": {
      "command": "node",
      "args": ["<path>/scripts/mcp-glm-zai-worker.mjs"]
    }
  }
}
```

---

## Token Economy (Smart Delegation)

### When NOT to Delegate
Tasks where explanation costs more tokens than execution:
- Reading a config file (1 tool call)
- Fixing a typo (1 tool call)
- Writing <50 lines of code

**Rule:** If you can solve it in 1-2 tool calls, DO IT YOURSELF.

### When to Delegate to GLM Z.AI
- Implementing complex business logic (>100 lines)
- Refactoring entire modules
- Writing comprehensive test suites
- Generating boilerplate code

### Failure Handling
1. GLM Z.AI fails → Analyze why, retry with better guidance (up to 2 attempts)
2. Still fails → Take over and do it yourself
3. You fail → Escalate to Senior Architect

---

## Task Completion Protocol

### 1. Write Report
Before finishing, create/update `.eck/lastsnapshot/AnswerToSA.md`:

```markdown
# Report: [Task Name]
**Status:** [SUCCESS / BLOCKED / FAILED]
**Changes:**
- Modified X
- Created Y
**Verification:**
- Ran test Z -> Passed
**Next Steps / Questions:**
- [What should the Architect do next?]
```

### 2. Use eck_finish_task
Call the `eck_finish_task` MCP tool with:
- `status`: Brief status message
- `commitMessage`: Conventional commits format (e.g., "feat: add user auth")

This automatically:
1. Updates `.eck/lastsnapshot/AnswerToSA.md`
2. Stages all changes
3. Creates a git commit
4. Generates a delta snapshot

---

## Troubleshooting

### MCP tools not showing up
```bash
# Re-register all MCP servers
eck-snapshot setup-mcp

# Then restart your AI tool
```

### GLM Z.AI API errors
```bash
# Check your API key
echo $ZAI_API_KEY  # Linux/Mac
echo %ZAI_API_KEY% # Windows CMD
```

### eck_finish_task fails
- Check that you have uncommitted changes
- Check that git is initialized in the project
- Run `eck-snapshot doctor` for diagnostics

---

## Additional Resources

- [eckSnapshot GitHub Repository](https://github.com/xelth-com/eckSnapshot)
- [Z.AI Platform](https://z.ai)
- [Claude Code MCP Documentation](https://docs.anthropic.com/claude/docs/mcp)
