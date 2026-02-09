# How to Change Z.AI API Key

## Quick Guide

### 1. Edit your shell configuration

**Linux/Mac:**
```bash
nano ~/.bashrc  # or ~/.zshrc
```

**Windows (PowerShell profile):**
```powershell
notepad $PROFILE
```

### 2. Find and update the API key

Look for this line:
```bash
export ZAI_API_KEY="old-key-here..."
```

Replace with your new key:
```bash
export ZAI_API_KEY="NEW-KEY-HERE"
```

### 3. Apply changes

**Linux/Mac:**
```bash
source ~/.bashrc
```

**Windows PowerShell:**
```powershell
. $PROFILE
```

**Windows CMD:**
```cmd
set ZAI_API_KEY=NEW-KEY-HERE
```

### 4. Restart your AI tool

For MCP workers to pick up the new key:
- Exit Claude Code / OpenCode completely
- Start a new session

### 5. Verify

```bash
# Check the key is loaded
echo $ZAI_API_KEY

# Test MCP server status (Claude Code)
claude mcp list | grep glm-zai
```

---

## What Gets Updated?

When you change `ZAI_API_KEY`, it affects:

1. **GLM Z.AI MCP Worker Tools** (`glm_zai_frontend`, `glm_zai_backend`, etc.)
   - Used by `scripts/mcp-glm-zai-worker.mjs`
   - Requires AI tool restart

2. **OpenCode** (if configured to use Z.AI)

---

## Security Best Practices

1. **Never commit API keys to git**
2. **Rotate keys regularly** - Get new keys from https://z.ai
3. **Use environment variables** - Always reference `$ZAI_API_KEY`
4. **Check for leaks:**
   ```bash
   git grep -i "ZAI_API_KEY"
   ```

---

**Back to:** [AI Integration Guide](../AI_INTEGRATION.md) | [Main README](../README.md)
