# EckSnapshot MCP Server Setup

## Automatic Setup (Recommended)

Run this command in your project:

```bash
eck-snapshot setup-claude-mcp
```

This will automatically configure Claude Code to use the EckSnapshot MCP server.

## Manual Setup

### 1. Copy MCP Server

Copy `src/mcp-server/index.js` to your project:

```bash
mkdir -p .eck/mcp-server
cp src/templates/claude-code/mcp-server-template.js .eck/mcp-server/index.js
```

### 2. Update Claude Code Config

Add to your Claude Code config (`~/.claude/config.json` or `~/.config/claude/config.json`):

```json
{
  "mcpServers": {
    "ecksnapshot": {
      "command": "node",
      "args": ["/absolute/path/to/your/project/.eck/mcp-server/index.js"]
    }
  }
}
```

### 3. Restart Claude Code

Restart Claude Code CLI or IDE extension to load the MCP server.

## Quick Settings Commands

You can quickly switch between Claude and MiniMax settings:

```bash
# Apply standard Claude settings (empty config)
eck-snapshot c

# Apply MiniMax proxy settings
eck-snapshot m
```

Both commands write to `~/.claude/settings.json` (or `%USERPROFILE%\.claude\settings.json` on Windows).

## Available Tools

### `eck_finish_task`

Finalizes a completed task by:
1. Updating `.eck/AnswerToSA.md` with status
2. Creating a git commit with proper message
3. Optionally generating an update snapshot

**Parameters:**
- `status` (required): Status message for AnswerToSA.md
- `commitMessage` (required): Git commit message (conventional commits format)
- `includeUpdate` (optional): Generate update snapshot after commit (default: false)

**Example:**

The MCP tool is automatically called by Claude when a task is complete according to CLAUDE.md instructions.

## Troubleshooting

### MCP server not appearing

1. Check Claude Code config path:
   - Linux/Mac: `~/.config/claude/config.json` or `~/.claude/config.json`
   - Windows: `%APPDATA%\Claude\config.json`

2. Verify the absolute path to `index.js` is correct

3. Restart Claude Code completely

### Tool not being called

1. Check that CLAUDE.md mentions `eck_finish_task` tool
2. Verify MCP server is running (check Claude Code logs)
3. Try manually calling the tool in Claude Code

## Template Files

- `mcp-server-template.js`: The MCP server implementation
- `mcp-config-template.json`: Claude Code configuration snippet
- `settings-claude.json`: Standard Claude settings (empty config)
- `settings-minimax.json`: MiniMax proxy settings template
- `README.md`: This file

## Copying to Other Projects

1. Copy the entire `src/templates/claude-code/` directory to your new project
2. Run setup or manually configure as described above
3. Update paths in the configuration to match your new project structure
