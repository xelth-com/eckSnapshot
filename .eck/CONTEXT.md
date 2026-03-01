# Project Overview

## Description
A specialized CLI tool designed to create and restore single-file text snapshots of Git repositories. Optimized for providing full project context to Large Language Models (LLMs). Also serves as the coordination hub for the Royal Court AI architecture.

## Architecture
- **Environment**: Node.js (ESM, `type: "module"`)
- **CLI Framework**: Commander.js
- **Core Features**:
  - **Skeleton Mode**: Strips function bodies using Tree-sitter and Babel to save tokens
  - **Delta Updates**: Tracks changes via Git anchors with sequential numbering (`_up1`, `_up2`, ...)
  - **Multi-Agent Protocol**: Eck-Protocol v2 (Markdown/XML hybrid) for agent communication
  - **Security**: Built-in SecretScanner for automatic redaction of API keys
  - **Telemetry**: Agent execution metrics + adaptive token weight learning via `xelth.com/T/*`

## Key Technologies
- **Babel**: JS/TS parsing and function body transformation
- **Tree-sitter**: Multi-language structural analysis (Rust, Go, Python, C, Java, Kotlin)
- **Execa**: Robust shell command execution
- **Vitest**: Testing suite
- **SQLx + Axum**: Rust telemetry microservice (`eck-telemetry/`)

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

### AI Coding Tools
| Tool | Engine | Usage |
|------|--------|-------|
| **Claude Code** | Sonnet 4.6 / Opus 4.6 | Primary coding agent (JAS/JAO) |
| **OpenCode** | GLM-4.7 (Z.AI Coding Plan) | Alternative coding agent (JAZ) |
| **GLM Z.AI Worker** | GLM-4.7 via MCP | Cost-effective worker for heavy coding tasks |

### Snapshot Modes
| Flag | Purpose | Output |
|------|---------|--------|
| `--jas` | Configure for JAS (Sonnet 4.6) | `CLAUDE.md` with tree + Smart Delegation Protocol |
| `--jao` | Configure for JAO (Opus 4.6) | `CLAUDE.md` with tree + Enhanced verification rules |
| `--jaz` | Configure for JAZ (GLM-4.7, OpenCode) | `AGENTS.md` with YAML frontmatter + GLM swarm config |
| (none) | Standard snapshot | Standalone `.md` for any LLM |

### Smart Delegation Protocol
1. **Token Efficiency**: Tasks solvable in 1-2 tool calls → Do it yourself
2. **Bulk Work**: Complex logic (>100 lines) → Delegate to GLM Z.AI
3. **Failure Handling**: GLM fails → guided retry → Junior Architect takeover → escalate to SA

## Telemetry Hub
- **Service**: `eck-telemetry` (Rust/Axum, port 3203 on `antigravity`, proxied via Nginx)
- **Endpoints**:
  - `POST /T/report` — agent execution metrics
  - `POST /T/tokens/train` — token estimation training points
  - `GET /T/tokens/weights` — global linear regression coefficients per project type
- **Local integration**: `src/utils/telemetry.js`, `src/utils/tokenEstimator.js`
- **CLI**: `eck-snapshot telemetry push` / `eck-snapshot telemetry sync-weights`

## Important Notes
- MCP servers can be restored with `eck-snapshot setup-mcp`
- GLM Z.AI requires `ZAI_API_KEY` environment variable
- Agent reports live at `.eck/lastsnapshot/AnswerToSA.md`
- Use `eck_finish_task` MCP tool (or `eck-snapshot update`) to commit and generate snapshots
