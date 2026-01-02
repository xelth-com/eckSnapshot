# MiniMax M2.1 Standalone Setup

This guide shows how to configure MiniMax M2.1 as a standalone AI assistant using the Claude Code CLI.

## Shell Configuration (`.bashrc` or `.zshrc`)

Add these lines to your shell configuration file:

```bash
# MiniMax API Key
export MINIMAX_API_KEY="sk-cp-your-actual-key-here"

# MiniMax Standalone Alias
# This redirects the 'claude' command to use MiniMax's API endpoint
alias minimax='ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic" \
ANTHROPIC_AUTH_TOKEN="$MINIMAX_API_KEY" \
API_TIMEOUT_MS="3000000" \
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
ANTHROPIC_MODEL="MiniMax-M2.1" \
ANTHROPIC_SMALL_FAST_MODEL="MiniMax-M2.1" \
ANTHROPIC_DEFAULT_SONNET_MODEL="MiniMax-M2.1" \
claude'
```

## How It Works

The alias works by:
1. **Overriding the API endpoint:** `ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic"`
   - Redirects requests from Anthropic's servers to MiniMax's compatible endpoint

2. **Using your MiniMax key:** `ANTHROPIC_AUTH_TOKEN="$MINIMAX_API_KEY"`
   - Authenticates with MiniMax instead of Anthropic

3. **Setting timeouts:** `API_TIMEOUT_MS="3000000"`
   - Allows 50 minutes for processing large files (MiniMax has a huge context window)

4. **Forcing model selection:** All model references point to `MiniMax-M2.1`
   - Ensures even fallback models use MiniMax

5. **Disabling telemetry:** `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
   - Reduces overhead for faster responses

## Installation Steps

1. **Edit your shell config:**
   ```bash
   nano ~/.bashrc  # or ~/.zshrc for zsh users
   ```

2. **Paste the configuration** (see above)

3. **Replace the placeholder key:**
   ```bash
   export MINIMAX_API_KEY="sk-cp-YOUR_ACTUAL_KEY_HERE"
   ```

4. **Save and reload:**
   ```bash
   source ~/.bashrc  # or source ~/.zshrc
   ```

5. **Test it:**
   ```bash
   minimax "Hello, are you MiniMax?"
   ```

## Usage Examples

### Interactive Mode
```bash
minimax
# Starts an interactive session with MiniMax M2.1
```

### One-Shot Commands
```bash
minimax "Explain the eckSnapshot architecture"
```

### Processing Snapshots
```bash
# Create a snapshot
eck-snapshot

# Analyze it with MiniMax
minimax "Review this codebase for security issues" < .eck/snapshots/*_snapshot_*.md
```

### Refactoring Tasks
```bash
minimax "Refactor all API handlers to use async/await" < .eck/snapshots/backend_snapshot.md
```

## Benefits Over Standard Claude

1. **Cost:** MiniMax M2.1 is significantly cheaper per token
2. **Context Window:** Can handle larger projects in a single request
3. **Speed:** Fast processing even with massive context
4. **Compatibility:** Works with all `claude` CLI commands and flags

## Limitations

- No official Claude Code features (MCP servers work only with real Claude)
- Quality may vary compared to Claude Opus/Sonnet for complex reasoning
- Best suited for coding tasks, refactoring, and analysis

## Combining with Supervisor-Worker Mode

You can use **both** setups:
- Keep the `minimax` alias for standalone batch work
- Use `claude` with MCP for interactive Supervisor-Worker sessions

This gives you maximum flexibility!

## Troubleshooting

**Issue:** `minimax: command not found`
- **Fix:** You didn't reload the shell config. Run `source ~/.bashrc`

**Issue:** API errors or authentication failures
- **Fix:** Check your API key: `echo $MINIMAX_API_KEY`

**Issue:** Slow responses on small tasks
- **Fix:** Normal - MiniMax is optimized for large context, not small queries

---

**Back to:** [MiniMax Integration Guide](../MINIMAX_INTEGRATION.md) | [Main README](../README.md)
