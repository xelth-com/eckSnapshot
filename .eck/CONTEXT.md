# Project Overview

## Description
A specialized, AI-native CLI tool that creates single-file text snapshots of Git repositories for LLM context windows. As of v6.2, the CLI operates as a **100% JSON/MCP bridge** — all commands are JSON payloads, with human-friendly shims for convenience.

Also serves as the coordination hub for the Royal Court AI architecture and provides the Scout Protocol for cross-repo exploration and the Cross-Context Protocol for linked multi-project snapshots.

## Architecture
- **Environment**: Node.js (ESM, `type: "module"`)
- **CLI Framework**: Commander.js (single JSON argument router)
- **Interface**: Pure JSON/MCP payloads (`{"name": "tool_name", "arguments": {...}}`)
- **Legacy Shims**: Old positional commands (`snapshot`, `update`, `scout`, `fetch`) auto-translate to JSON
- **Core Features**:
  - **Skeleton Mode**: Strips function bodies using Tree-sitter and Babel to save tokens
  - **Delta Updates**: Tracks changes via Git anchors with sequential numbering (`_up1`, `_up2`, ...)
  - **Scout Protocol**: `eck_scout` (directory tree + optional depth content) + `eck_fetch` (file extraction by glob) for cross-repo exploration
  - **Cross-Context Protocol**: `eck-snapshot link [depth]` generates standalone `link_*.md` companion snapshots
  - **Shared Depth Scale (0-9)**: Used by both `scout` and `link` — tree-only → truncated → skeleton → skeleton+docs → full
  - **Security**: Built-in SecretScanner for automatic redaction of API keys (regex + Shannon entropy)
  - **Polyglot Monorepo Filtering**: `detectProjectType` returns all detected types via `allDetections`; `getProjectSpecificFiltering` accepts `string[]` and merges ignore rules from all stacks (e.g., Rust + Android). Helper `getAllDetectedTypes(detection)` extracts the full type list

## Key Technologies
- **Depth Config** (`src/core/depthConfig.js`): Shared 0-9 depth scale for `scout` and `link`, returns mode/truncation/skeleton settings
- **Skeletonizer** (`src/core/skeletonizer.js`): Strips function bodies via Babel (JS/TS) and Tree-sitter (Rust, Go, Python, C, Java, Kotlin). Supports `preserveDocs` option (depth 5 strips docs, depth 6 keeps them)
- **Babel**: JS/TS parsing and function body transformation
- **Tree-sitter**: Multi-language structural analysis (Rust, Go, Python, C, Java, Kotlin)
- **Execa**: Robust shell command execution
- **Vitest**: Testing suite
- **Micromatch**: Glob pattern matching (used by scout fetch)

## CLI Router (`src/cli/cli.js`)

All tools are dispatched via a single JSON payload argument:

| JSON Tool Name | Function | Source |
|---------------|----------|--------|
| `eck_snapshot` | Full context snapshot | `createSnapshot.js` |
| `eck_update` | Delta snapshot | `updateSnapshot.js` |
| `eck_update_auto` | Silent delta (JSON output) | `updateSnapshot.js` |
| `eck_scout` | Scout: tree + content at depth 0-9 | `recon.js` |
| `eck_fetch` | Scout: fetch files by glob pattern | `recon.js` |
| `eck_setup_mcp` | Configure MCP servers | `setupMcp.js` |
| `eck_detect` | Detect project type | `detectProject.js` |
| `eck_doctor` | Project health check | `doctor.js` |
| `eck_train_tokens` | Calibrate token estimator | `trainTokens.js` |
| `eck_token_stats` | Show estimation accuracy | `trainTokens.js` |

Legacy positional commands are intercepted via `LEGACY_COMMANDS` map in `cli.js` and translated to JSON before reaching the router. Includes `link` and `scout` shims with depth argument support.

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

### Task Context Separation (`<eck_task>` Protocol)

Execution agents (Coders, Junior Architects) receive instructions from two sources:
1. **AI Architect** — formal tasks wrapped in `<eck_task id="repo:description">` XML tags (e.g., `<eck_task id="ecksnapshot:fix-auth-crash">`).
2. **Human User** — conversational messages without tags.

**Behavior rules:**
- Architect task (`<eck_task>`) → execute, verify, call `eck_finish_task` automatically with task `id` in the report.
- Human request (no tag) → apply changes and reply naturally. Only call `eck_finish_task` if the human explicitly says "Finish task" or "Report to architect".

**ID format:** `repoName:short-task-description` — provides visual project identification when multiple agent windows are open.

This protocol is implemented in all agent instruction templates:
- `claudeMdGenerator.js` (CODER_INSTRUCTIONS + getArchitectInstructions)
- `coder.template.md` (OpenCode coder)
- `junior-architect.template.md` (OpenCode JA)
- `architect-prompt.template.md` (Senior Architect command format examples)
- `aiHeader.js` (commandFormats for snapshot-embedded Architect prompts)

### Autonomous AI Protocols (injected via `multiAgent.md`)
The Architect prompt includes four autonomous behavioral protocols:
1. **Context Hygiene** — On every full snapshot, the Architect evaluates the directory tree for bloat. Massive bloat → dedicated cleanup task + fresh snapshot request. Minor bloat → appends `.eckignore` update to current task. Manual override via `[EXECUTE HYGIENE]` / `[ВРЕМЯ УБОРКИ]` code words.
2. **Proactive Tech Debt** — Scans for `TODO`/`FIXME`/`HACK` comments, compares against implementation, and autonomously deletes obsolete ones, fixes quick issues, or documents real debt in `.eck/TECH_DEBT.md`.
3. **Boy Scout Rule** — Whenever the AI touches a function, it must create or update its JSDoc/docstring to explain *why* the code exists (not just *what*).
4. **Zero-Broken-Windows (Reliability)** — Blind commits forbidden. The AI must run the test suite and ensure all tests pass before calling `eck_finish_task`.

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
