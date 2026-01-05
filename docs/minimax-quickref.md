# MiniMax Quick Reference

## Change API Key (TL;DR)

```bash
# 1. Edit config
nano ~/.bashrc

# 2. Find and update this line:
export MINIMAX_API_KEY="sk-cp-YOUR-NEW-KEY-HERE"

# 3. Save (Ctrl+O, Enter, Ctrl+X)

# 4. Reload
source ~/.bashrc

# 5. Restart Claude Code
# (exit and start again)

# 6. Test
echo $MINIMAX_API_KEY
./test-minimax.sh
```

**Full guide:** [docs/minimax-change-api-key.md](minimax-change-api-key.md)

---

## Common Commands

### Check Status
```bash
# Verify API key
echo "Key: ${MINIMAX_API_KEY:0:20}..."

# Check MCP server
claude mcp list

# Run full test
./test-minimax.sh
```

### Standalone Mode
```bash
# Interactive session
minimax

# One-shot command
minimax "Your question here"

# Process file
minimax "Analyze this" < file.txt
```

### MCP Worker Mode
Inside Claude Code session, workers are available automatically:
- `minimax_frontend` - React, Vue, Tailwind, CSS
- `minimax_backend` - Node.js, Python, Go, SQL
- `minimax_qa` - Testing and edge cases
- `minimax_refactor` - Code quality improvements

---

## Troubleshooting Fast Fixes

```bash
# Key not found
source ~/.bashrc

# MCP not working
# Exit and restart Claude Code

# Alias not found
type minimax  # should show the alias
source ~/.bashrc

# Old key still used
grep MINIMAX_API_KEY ~/.bashrc  # verify new key
source ~/.bashrc
```

---

## File Locations

| What | Where |
|------|-------|
| Shell config | `~/.bashrc` or `~/.zshrc` |
| MCP worker | `scripts/mcp-minimax-worker.js` |
| Test script | `test-minimax.sh` |
| Full docs | `MINIMAX_INTEGRATION.md` |
| Change key guide | `docs/minimax-change-api-key.md` |

---

**Links:**
- 📖 [Full Integration Guide](../MINIMAX_INTEGRATION.md)
- 🔑 [Change API Key Guide](minimax-change-api-key.md)
- 🏗️ [Standalone Setup](minimax-standalone-setup.md)
