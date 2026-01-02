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

## AI Infrastructure

- **Supervisor:** Claude Sonnet 4.5 (High Reasoning, Team Lead)
- **Worker:** MiniMax M2.1 (High Context / Low Cost, via MCP)
- **Consultant:** Claude Opus 4.5 (Available via Consilium for critical decisions)

**Delegation Policy:** Controlled via `setup.json` -> `delegationStrategy`. Current mode determines how aggressively tasks are offloaded to MiniMax.

### Modes
| Mode | Threshold | Use Case |
|------|-----------|----------|
| `aggressive` | 50 lines | Maximum token savings |
| `balanced` | 200 lines | Default, good balance |
| `precise` | 1000 lines | Maximum quality, minimal delegation |

## Important Notes
Any crucial information that developers should know when working on this project.
