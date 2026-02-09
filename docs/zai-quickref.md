# Z.AI Quick Reference

## Setup (TL;DR)

```bash
# 1. Set API key
export ZAI_API_KEY="your-key-here"

# 2. Register MCP servers
eck-snapshot setup-mcp

# 3. Restart Claude Code / OpenCode
```

**Full guide:** [AI_INTEGRATION.md](../AI_INTEGRATION.md)

---

## Change API Key (TL;DR)

```bash
# 1. Edit config
nano ~/.bashrc

# 2. Update this line:
export ZAI_API_KEY="YOUR-NEW-KEY-HERE"

# 3. Reload
source ~/.bashrc

# 4. Restart your AI tool

# 5. Verify
echo $ZAI_API_KEY
```

**Full guide:** [docs/zai-change-api-key.md](zai-change-api-key.md)

---

## Common Commands

### Check Status
```bash
# Verify API key
echo $ZAI_API_KEY

# Check MCP servers (Claude Code)
claude mcp list

# Re-register if missing
eck-snapshot setup-mcp
```

### MCP Worker Tools
Inside Claude Code or OpenCode session, workers are available automatically:
- `glm_zai_frontend` - React, Vue, Tailwind, CSS
- `glm_zai_backend` - Node.js, Python, Go, SQL
- `glm_zai_qa` - Testing and edge cases
- `glm_zai_refactor` - Code quality improvements
- `glm_zai_general` - Full-stack generalist

### Task Completion
```
eck_finish_task(status="done", commitMessage="feat: add feature X")
```

---

## Troubleshooting Fast Fixes

```bash
# MCP tools not showing
eck-snapshot setup-mcp
# Then restart Claude Code / OpenCode

# API key not found
export ZAI_API_KEY="your-key"
source ~/.bashrc

# GLM Z.AI API errors
echo $ZAI_API_KEY  # verify key is set
```

---

## File Locations

| What | Where |
|------|-------|
| GLM Z.AI worker | `scripts/mcp-glm-zai-worker.mjs` |
| Eck core (finish task) | `scripts/mcp-eck-core.js` |
| Full MCP server | `src/mcp-server/index.js` |
| Integration guide | `AI_INTEGRATION.md` |
| Change key guide | `docs/zai-change-api-key.md` |

---

**Links:**
- [Full Integration Guide](../AI_INTEGRATION.md)
- [Change API Key Guide](zai-change-api-key.md)
