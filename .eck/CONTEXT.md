# Project Overview

## Description
A specialized, AI-native CLI tool that creates single-file text snapshots of Git repositories for LLM context windows. As of v6.2, the CLI operates as a **100% JSON/MCP bridge** — all commands are JSON payloads, with human-friendly shims for convenience.

Also serves as the coordination hub for the Royal Court AI architecture and provides the Reconnaissance Protocol for cross-repo exploration and the Cross-Context Protocol for linked multi-project snapshots.

## Architecture
- **Environment**: Node.js (ESM, `type: "module"`)
- **CLI Framework**: Commander.js (single JSON argument router)
- **Interface**: Pure JSON/MCP payloads (`{"name": "tool_name", "arguments": {...}}`)
- **Legacy Shims**: Old positional commands (`snapshot`, `update`, `scout`, `fetch`) auto-translate to JSON
- **Core Features**:
  - **Skeleton Mode**: Strips function bodies using Tree-sitter and Babel to save tokens
  - **Delta Updates**: Tracks changes via Git anchors with sequential numbering (`_up1`, `_up2`, ...)
  - **Reconnaissance Protocol**: `eck_scout` (directory tree) + `eck_fetch` (file extraction) for cross-repo exploration
  - **Cross-Context Protocol**: `eck-snapshot link [depth]` generates standalone `link_*.md` companion snapshots with 0-10 depth scale
  - **Security**: Built-in SecretScanner for automatic redaction of API keys (regex + Shannon entropy)

## Key Technologies
- **Babel**: JS/TS parsing and function body transformation
- **Tree-sitter**: Multi-language structural analysis (Rust, Go, Python, C, Java, Kotlin)
- **Execa**: Robust shell command execution
- **Vitest**: Testing suite
- **Micromatch**: Glob pattern matching (used by recon fetch)

## CLI Router (`src/cli/cli.js`)

All tools are dispatched via a single JSON payload argument:

| JSON Tool Name | Function | Source |
|---------------|----------|--------|
| `eck_snapshot` | Full context snapshot | `createSnapshot.js` |
| `eck_update` | Delta snapshot | `updateSnapshot.js` |
| `eck_update_auto` | Silent delta (JSON output) | `updateSnapshot.js` |
| `eck_scout` | Recon: directory tree | `recon.js` |
| `eck_fetch` | Recon: fetch file contents | `recon.js` |
| `eck_setup_mcp` | Configure MCP servers | `setupMcp.js` |
| `eck_detect` | Detect project type | `detectProject.js` |
| `eck_doctor` | Project health check | `doctor.js` |
| `eck_train_tokens` | Calibrate token estimator | `trainTokens.js` |
| `eck_token_stats` | Show estimation accuracy | `trainTokens.js` |

Legacy positional commands are intercepted via `LEGACY_COMMANDS` map in `cli.js` and translated to JSON before reaching the router. Includes `link` shim for cross-context snapshots.

**Default behavior:** Running `eck-snapshot` without arguments defaults to a full snapshot (`eck_snapshot`).

## AI Infrastructure: "Royal Court" Architecture

### Hierarchy
```
Senior Architect (any powerful LLM — ChatGPT, Gemini, Claude Opus)
    ↓ delegates via eck-snapshot context packages
Junior Architects (Managers, Claude Code)
    ├─ JAS (Sonnet 4.6): Fast manager for standard features
    ├─ JAO (Opus 4.6): Deep thinker for critical architecture
    └─ JAZ (GLM-4.7, OpenCode): Cost-effective orchestrator for Z.AI swarm
        ↓ delegate heavy lifting via MCP
GLM Z.AI Worker Fleet (MCP: glm-zai server)
    ├─ glm_zai_frontend: React/Vue/Tailwind specialist
    ├─ glm_zai_backend: Node.js/API/Auth specialist
    ├─ glm_zai_qa: Test automation engineer
    ├─ glm_zai_refactor: Code quality specialist
    └─ glm_zai_general: Full-stack generalist
```

### Supported AI Coding Tools
| Tool | Engine | MCP Config |
|------|--------|------------|
| **Claude Code** | Sonnet/Opus 4.6 | `.mcp.json` (JSON) |
| **OpenCode** | GLM-4.7 (Z.AI) | `opencode.json` (JSON) |
| **Codex** | GPT models | `.codex/config.toml` (TOML) |

### Dynamic .eck/ Manifest Loading
`loadProjectEckManifest` dynamically scans the `.eck/` directory for all `.md` files. Well-known files (CONTEXT, OPERATIONS, JOURNAL, ROADMAP, TECH_DEBT, ENVIRONMENT) map to dedicated keys; additional `.md` files are collected into `dynamicFiles`.

Excluded from scanning: files containing `secret`, `credential`, `server_access` in the name, and `profile_generation_guide.md`.

### Snapshot Modes (JSON arguments)
| Argument | Purpose | Output |
|----------|---------|--------|
| `{"jas": true}` | Configure for JAS (Sonnet 4.6) | `CLAUDE.md` with tree + Smart Delegation Protocol |
| `{"jao": true}` | Configure for JAO (Opus 4.6) | `CLAUDE.md` with Enhanced verification rules |
| `{"jaz": true}` | Configure for JAZ (GLM-4.7) | `AGENTS.md` with YAML frontmatter + GLM swarm config |
| `{"isLinkedProject": true, "linkDepth": N}` | Cross-context companion snapshot | Standalone `link_*.md` with depth-scaled content |
| (none) | Standard coder snapshot | Standalone `.md` for any LLM |

## Important Notes
- MCP servers can be restored with `eck-snapshot '{"name": "eck_setup_mcp"}'`
- GLM Z.AI requires `ZAI_API_KEY` environment variable
- Agent reports live at `.eck/lastsnapshot/AnswerToSA.md`
- Internal MCP calls (`mcp-eck-core.js`) use native JSON payloads to invoke the CLI
