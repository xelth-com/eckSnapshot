# Common Operations

## Development Setup
```bash
npm install
```

## Running the Project (JSON Interface)

All commands use JSON payloads. Human-friendly shims are available for common operations.

```bash
# Create a standard snapshot
node index.js '{"name": "eck_snapshot"}'
# Or use the shim:
node index.js snapshot

# Create a skeleton snapshot (compressed)
node index.js '{"name": "eck_snapshot", "arguments": {"skeleton": true}}'

# Update snapshot (incremental delta)
node index.js '{"name": "eck_update"}'
# Or use the shim:
node index.js update

# Detect project type
node index.js '{"name": "eck_detect"}'
# Or use the shim:
node index.js detect

# Health check
node index.js '{"name": "eck_doctor"}'
```

## Royal Court Architecture Snapshots
```bash
# JAS: Configure for Junior Architect Sonnet (Sonnet 4.6)
node index.js '{"name": "eck_snapshot", "arguments": {"jas": true}}'

# JAO: Configure for Junior Architect Opus (Opus 4.6)
node index.js '{"name": "eck_snapshot", "arguments": {"jao": true}}'

# JAZ: Configure for Junior Architect GLM (OpenCode)
node index.js '{"name": "eck_snapshot", "arguments": {"jaz": true}}'

# With profile filtering
node index.js '{"name": "eck_snapshot", "arguments": {"profile": "backend", "jas": true}}'
```

## Cross-Context Protocol (Linked Projects)
```bash
# Generate a standalone linked snapshot of the current project
# Run this INSIDE the target project directory
eck-snapshot link        # Depth 0: tree only
eck-snapshot link 3      # Depth 3: truncated (100 lines per file)
eck-snapshot link 5      # Depth 5: skeleton mode
eck-snapshot link 8      # Depth 8: full content

# JSON equivalent:
node index.js '{"name": "eck_snapshot", "arguments": {"isLinkedProject": true, "linkDepth": 5}}'
```

**Depth Scale (0-10):**
| Depth | Mode | Description |
|-------|------|-------------|
| 0 | Tree only | Directory structure, no file contents |
| 1-3 | Truncated | 20 / 50 / 100 lines per file |
| 4-6 | Skeleton | Function signatures only (Babel + Tree-sitter) |
| 7-10 | Full | Complete file contents |

Output: `link_*.md` in the `snapshots/` directory. Upload alongside main project snapshot.

## Reconnaissance Protocol (Cross-Repo Exploration)
```bash
# Scout: Generate directory tree of external repo
# (Run in the target repo's directory)
node index.js '{"name": "eck_scout"}'
# Or: node index.js scout

# Fetch: Extract specific file contents
node index.js '{"name": "eck_fetch", "arguments": {"patterns": ["src/**/*.js", "README.md"]}}'
# Or: node index.js fetch "src/**/*.js" "README.md"
```

Output saved to `.eck/recon/` directory.

## MCP Setup / Restoration
```bash
# Setup MCP servers for Claude Code (auto-detects Codex too)
node index.js '{"name": "eck_setup_mcp"}'
# Or: node index.js setup-mcp

# Setup for OpenCode
node index.js '{"name": "eck_setup_mcp", "arguments": {"opencode": true}}'

# Setup for all platforms
node index.js '{"name": "eck_setup_mcp", "arguments": {"both": true}}'
```

### MCP Config Locations
| Platform | Config File | Format |
|----------|-------------|--------|
| Claude Code | `.mcp.json` | JSON |
| OpenCode | `opencode.json` | JSON |
| Codex | `.codex/config.toml` | TOML |

Codex config is auto-detected during `setup-mcp` and snapshot creation if `.codex/` directory exists.

## Testing
```bash
npm test
npm run test:ui
```

## Smart Delegation Protocol

### When NOT to Delegate
**DO NOT delegate tasks where explanation costs more tokens than execution.**
- Reading/modifying a config file → Use `Read`/`Edit` tool directly
- Fixing a typo → Use `Edit` tool directly
- Writing < 50 lines of glue code

**Rule:** If you can solve it in 1-2 tool calls, DO IT YOURSELF.

### When to Delegate to GLM Z.AI
For bulk work where delegation saves expensive context:
- Implementing complex business logic (> 100 lines)
- Refactoring entire modules
- Writing comprehensive test suites
- Generating boilerplate code

**Action:** Use `glm_zai_backend`, `glm_zai_frontend`, `glm_zai_qa`, or `glm_zai_refactor`.

## Reporting Protocol

At the end of every task, agents **MUST** call `eck_finish_task` MCP tool (or manual fallback to `.eck/lastsnapshot/AnswerToSA.md`).

### Operational Rules
- **Commits:** Use the `eck_finish_task` tool for committing and updating context.
- **Manifests:** If you see [STUB] in .eck/ files, update them.
- **Reporting:** NEVER finish a session without writing `.eck/lastsnapshot/AnswerToSA.md`.
