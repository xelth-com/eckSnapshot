# Project Overview

## Description
A specialized CLI tool designed to create and restore single-file text snapshots of Git repositories. It is specifically optimized for providing full project context to Large Language Models (LLMs) like Claude and Gemini.

## Architecture
- **Environment**: Node.js
- **CLI Framework**: Commander.js
- **Core Features**:
    - **Skeleton Mode**: Strips function bodies using Tree-sitter and Babel to save tokens.
    - **Delta Updates**: Tracks changes via Git anchors.
    - **Multi-Agent Protocol**: Uses Eck-Protocol v2 (Markdown/XML hybrid) for agent communication.
    - **Security**: Built-in SecretScanner for automatic redaction of API keys.

## Key Technologies
- **Babel**: For JS/TS parsing and transformation.
- **Tree-sitter**: For multi-language structural analysis (Rust, Go, Python, C, Java, Kotlin).
- **Execa**: For robust shell command execution.
- **Vitest**: For the testing suite.

## AI Infrastructure: "Royal Court" Architecture

### Hierarchy
```
Senior Architect (Gemini 3 Pro)
    ↓ delegates strategic tasks
Junior Architects (Managers)
    ├─ JAS (Sonnet 4.5): Fast manager for standard features
    ├─ JAO (Opus 4.5): Deep thinker for critical architecture
    └─ JAG (Gemini 3 Pro): Massive context handler (>50 files)
        ↓ delegate heavy lifting
MiniMax Worker Swarm (MCP)
    ├─ minimax_frontend: React/Vue/Tailwind specialist
    ├─ minimax_backend: Node.js/API/Auth specialist
    ├─ minimax_qa: Test automation engineer
    └─ minimax_refactor: Code quality specialist
```

### Smart Delegation Protocol
Junior Architects follow intelligent delegation:
1. **Token Efficiency**: Tasks solvable in 1-2 tool calls → Do it yourself
2. **Bulk Work**: Complex logic (>100 lines) → Delegate to MiniMax
3. **Failure Handling**:
   - MiniMax fails → Intelligent retry (2-4 attempts with analysis)
   - Progress visible → Continue retrying
   - No progress → Junior Architect takes over
   - Junior Architect fails → Escalate to Senior Architect

### Snapshot Modes
| Flag | Purpose | Output |
|------|---------|--------|
| `--jag` | Full snapshot for JAG (Gemini 3 Pro) | `_jag.md` snapshot + CLAUDE.md |
| `--jas` | Configure for JAS (Sonnet 4.5) | CLAUDE.md with tree + Smart Delegation Protocol |
| `--jao` | Configure for JAO (Opus 4.5) | CLAUDE.md with tree + Enhanced verification rules |
| (none) | Standard snapshot | Standard snapshot for any LLM |

## Important Notes
Any crucial information that developers should know when working on this project.
