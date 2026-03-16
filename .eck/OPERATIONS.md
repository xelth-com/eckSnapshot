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
eck-snapshot link 3      # Depth 3: truncated (60 lines per file)
eck-snapshot link 5      # Depth 5: skeleton mode
eck-snapshot link 9      # Depth 9: full content

# JSON equivalent:
node index.js '{"name": "eck_snapshot", "arguments": {"isLinkedProject": true, "linkDepth": 5}}'
```

## Reconnaissance Protocol (Cross-Repo Exploration)
```bash
# Scout: Generate directory tree (with optional depth for file contents)
eck-snapshot scout       # Depth 0: tree only (default)
eck-snapshot scout 3     # Depth 3: tree + truncated file contents
eck-snapshot scout 5     # Depth 5: tree + skeleton
eck-snapshot scout 9     # Depth 9: tree + full content

# Fetch: Extract specific files by glob pattern
eck-snapshot fetch "src/**/*.js" "README.md"
```

Scout/Link output saved to `.eck/recon/` and `snapshots/` respectively.
Fetch output saved to `.eck/recon/`.

## Depth Scale (0-9) — shared by `scout` and `link`
| Depth | Mode | Description |
|-------|------|-------------|
| 0 | Tree only | Directory structure, no file contents |
| 1 | Truncated 10 | 10 lines per file (imports/header) |
| 2 | Truncated 30 | 30 lines per file |
| 3 | Truncated 60 | 60 lines per file |
| 4 | Truncated 100 | 100 lines per file |
| 5 | Skeleton | Function/class signatures only |
| 6 | Skeleton + docs | Signatures + docstrings/comments |
| 7 | Full (compact) | Full content, truncated at 500 lines |
| 8 | Full (standard) | Full content, truncated at 1000 lines |
| 9 | Full (unlimited) | Everything, no limits |

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

## Release & Publish

### Standard release (patch/minor changes)
```bash
npm version patch --no-git-tag-version   # or: minor
# Update version in README.md header too
git add package.json README.md && git commit -m "chore: bump X.Y.Z" && git push
npm publish --access public
```

### Self-snapshot update (only on MINOR version bumps, e.g. 6.3.0)
The repo includes `ecksnapshot-context.md` — a snapshot of itself, linked from README as a download demo.
Rebuild it when the minor version changes (new features that alter architecture):
```bash
# 1. Generate fresh snapshot
eck-snapshot snapshot

# 2. Copy to repo root
cp .eck/snapshots/eck*.md ecksnapshot-context.md

# 3. Create GitHub release with asset (forces download instead of browser render)
TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill 2>/dev/null | grep password | cut -d= -f2)

# Create release
curl -s -X POST "https://api.github.com/repos/xelth-com/eckSnapshot/releases" \
  -H "Authorization: token $TOKEN" -H "Content-Type: application/json" \
  -d '{"tag_name":"vX.Y.0","name":"vX.Y.0","body":"Release notes here"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['id'])"

# Upload asset (replace RELEASE_ID)
curl -s -X POST "https://uploads.github.com/repos/xelth-com/eckSnapshot/releases/RELEASE_ID/assets?name=ecksnapshot-context.md" \
  -H "Authorization: token $TOKEN" -H "Content-Type: text/markdown" \
  --data-binary @ecksnapshot-context.md

# 4. Update download link in README.md to point to new release tag
# 5. Commit, push, npm publish
```

**Why release assets?** GitHub raw links open `.md` in browser. Release assets send `Content-Disposition: attachment` → forced download.

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
