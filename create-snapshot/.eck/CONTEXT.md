# Project Overview: eckSnapshot

## Description
This is the eckSnapshot project, a CLI tool to create, index, and query codebase snapshots for AI context.

## Architecture
Node.js CLI tool with modules for parsing (core), database interaction (database), AI services (services), and CLI commands (cli).

## Key Technologies
- Node.js
- PostgreSQL (with simple JSON fallback)
- @xenova/transformers.js (local AI models)
- tree-sitter (multi-language parsing)
- commander.js