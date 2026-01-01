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

## Hybrid AI Architecture (Supervisor-Worker)

The project utilizes a cost-efficient hybrid model:
1.  **Claude Sonnet (Supervisor):** Acts as the project lead. It maintains the session context, makes decisions, and manages the file system. It avoids reading large file contents directly to save tokens.
2.  **MiniMax M2.1 (Worker):** Accessed via MCP. It performs the "heavy lifting" — reading full file contents and generating code implementations.

**Protocol:** The Supervisor delegates reading/writing tasks to the Worker via `delegate_coding_task`.

## Important Notes
Any crucial information that developers should know when working on this project.
