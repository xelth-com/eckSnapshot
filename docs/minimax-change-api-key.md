# How to Change MiniMax API Key

## Quick Guide

### 1. Edit your shell configuration

Open `.bashrc` (or `.zshrc` if you use zsh):
```bash
nano ~/.bashrc
```

### 2. Find and update the API key

Look for this line near the end of the file:
```bash
export MINIMAX_API_KEY="sk-cp-old-key-here..."
```

Replace the old key with your new one:
```bash
export MINIMAX_API_KEY="sk-cp-NEW-KEY-HERE"
```

**Important:** The standalone `minimax` alias should reference the variable (NOT hardcode the key):
```bash
alias minimax='ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic" \
ANTHROPIC_AUTH_TOKEN="$MINIMAX_API_KEY" \
...
```

### 3. Apply changes

**Option A:** Reload shell config (current terminal only):
```bash
source ~/.bashrc
```

**Option B:** Open a new terminal window (recommended)

### 4. Restart Claude Code

For MCP workers to pick up the new key:
```bash
# Exit Claude Code completely, then restart
claude
```

### 5. Verify

Check that everything works:

```bash
# 1. Verify the key is loaded
echo "Key: ${MINIMAX_API_KEY:0:20}..."

# 2. Test MCP server status
claude mcp list | grep minimax

# 3. Test standalone mode
minimax "Say hello"
```

Or run the automated test:
```bash
./test-minimax.sh
```

---

## What Gets Updated?

When you change `MINIMAX_API_KEY`, it affects:

1. ✅ **MCP Worker Tools** (`minimax_frontend`, `minimax_backend`, etc.)
   - Used by `scripts/mcp-minimax-worker.js`
   - Requires Claude Code restart

2. ✅ **Standalone Alias** (`minimax` command)
   - Uses `$MINIMAX_API_KEY` variable
   - Requires shell reload

---

## Troubleshooting

### Problem: Old key still being used

**Cause:** Shell or Claude Code hasn't reloaded the config

**Solution:**
```bash
# 1. Verify .bashrc has the new key
grep MINIMAX_API_KEY ~/.bashrc

# 2. Reload shell
source ~/.bashrc

# 3. Verify environment
echo $MINIMAX_API_KEY

# 4. Restart Claude Code completely
```

### Problem: Key works in terminal but not in Claude Code

**Cause:** Claude Code needs restart to reload MCP servers

**Solution:**
- Exit Claude Code completely (not just the session)
- Start a new Claude Code session
- Check: `claude mcp list`

### Problem: `minimax` alias uses old key

**Cause:** The alias has a hardcoded key instead of using `$MINIMAX_API_KEY`

**Fix:**
```bash
# Edit .bashrc
nano ~/.bashrc

# Find the alias line and make sure it says:
ANTHROPIC_AUTH_TOKEN="$MINIMAX_API_KEY"

# NOT:
ANTHROPIC_AUTH_TOKEN="sk-cp-hardcoded-key..."

# Save and reload
source ~/.bashrc
```

---

## Security Best Practices

1. **Never commit API keys to git**
   - `.bashrc` is in your home directory (safe)
   - Don't hardcode keys in project files

2. **Rotate keys regularly**
   - Get new keys from: https://platform.minimax.io/

3. **Use environment variables**
   - Always reference `$MINIMAX_API_KEY` in aliases/scripts
   - Define the key once in `.bashrc`

4. **Check for leaks**
   ```bash
   # Make sure your key isn't in git history
   git grep -i "sk-cp-"
   ```

---

## File Locations Reference

- **Shell config:** `~/.bashrc` or `~/.zshrc`
- **MCP worker script:** `scripts/mcp-minimax-worker.js`
- **Test script:** `test-minimax.sh`
- **Documentation:** `docs/minimax-standalone-setup.md`

---

**Need help?** Check the main guide: [MINIMAX_INTEGRATION.md](../MINIMAX_INTEGRATION.md)
