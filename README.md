# eck-snapshot

A CLI tool that packs your entire Git repository into a single text file optimized for LLMs. Give any AI full project context in one copy-paste.

```bash
npm install -g @xelth/eck-snapshot
```

## Recommended AI Setup

For best results, we recommend splitting roles between models:

- **Architect** (large context window): Gemini, Grok Fast, ChatGPT — upload the full snapshot, design the architecture, plan tasks
- **Coder** (execution): Claude (via Claude Code), GLM (via OpenCode) — receive tasks from the architect, write and fix code

eck-snapshot generates tailored instructions (`CLAUDE.md`, `AGENTS.md`) for each role automatically.

## Core Workflow

### 1. Full Snapshot

Run `eck-snapshot` in your project root. It scans every tracked file, filters out noise (lock files, build artifacts, secrets), and produces a single `.md` file ready for an AI chat.

```bash
eck-snapshot
# -> .eck/snapshots/eckMyProject_26-02-15_12-00_abc1234.md
```

Upload the file to your architect AI and start working.

### 2. Incremental Update

After you make changes, don't re-send the entire project. Send only what changed since the last full snapshot:

```bash
eck-snapshot update
# -> .eck/snapshots/eckMyProject_26-02-15_14-30_abc1234_up1.md
```

This uses a Git anchor (saved automatically during full snapshot) to detect all modified files and includes their full content. No redundant diffs, no wasted tokens.

## Context Profiles

Large repositories waste tokens on irrelevant code. Profiles let you partition the codebase so the AI only sees what matters.

### Auto-Detection

Let AI scan your directory tree and generate profiles automatically:

```bash
eck-snapshot profile-detect
# -> Saves profiles to .eck/profiles.json
```

### Manual Guide

For very large repos where auto-detection is too slow, generate a prompt guide, paste it into a powerful Web LLM (Gemini, ChatGPT), and save the resulting JSON:

```bash
eck-snapshot generate-profile-guide
# -> .eck/profile_generation_guide.md (paste into AI, get profiles back)
```

### Using Profiles

```bash
eck-snapshot --profile                            # List all available profiles
eck-snapshot --profile backend                    # Use a named profile
eck-snapshot --profile backend --skeleton         # Profile + skeleton mode
eck-snapshot --profile "src/**/*.rs,-**/test_*"   # Ad-hoc glob filtering
```

Profiles work with both full snapshots and incremental updates.

## Smart Filtering

eck-snapshot automatically detects your project type (Rust, Node.js, Android, Python, etc.) and excludes language-specific noise:

- **Rust**: `Cargo.lock`, `target/`
- **Node.js**: `package-lock.json`, `node_modules/`
- **Android**: build artifacts, generated code
- **All projects**: `.git/`, IDE configs, binary files

The built-in `SecretScanner` also redacts API keys, tokens, and credentials before they reach the AI.

## Multi-Agent Architecture

eck-snapshot generates tailored `CLAUDE.md` instructions for different AI agent roles:

```bash
eck-snapshot --jas    # Junior Architect Sonnet - fast, standard features
eck-snapshot --jao    # Junior Architect Opus - deep, critical architecture
eck-snapshot --jag    # Junior Architect Gemini - massive context tasks
```

### Chinese Delegation (`--zh`)

For GLM Z.AI workers (trained on Chinese data), the `--zh` flag instructs the architect to formulate all worker tasks in Chinese, improving output quality:

```bash
eck-snapshot --jas --zh    # Claude Code: delegate to GLM workers in Chinese
eck-snapshot --zh          # OpenCode/GLM: generate AGENTS.md with Chinese protocol
```

The architect still communicates with you in your language. Only the `instruction` parameter sent to GLM workers switches to Chinese. Code, variable names, and commit messages stay in English.

### MCP Server Integration

Delegate coding tasks to the GLM Z.AI Worker Fleet via MCP:

```bash
export ZAI_API_KEY="your-key"
eck-snapshot setup-mcp --both    # Setup for Claude Code + OpenCode
```

This gives your AI access to specialized workers: `glm_zai_frontend`, `glm_zai_backend`, `glm_zai_qa`, `glm_zai_refactor`, and the `eck_finish_task` commit tool.

## Skeleton Mode & Lazy Loading

For extremely large projects, skeleton mode strips function bodies and keeps only signatures, types, and structure:

```bash
eck-snapshot --skeleton
```

When using skeleton mode, the AI can request full content of specific files on demand:

```bash
eck-snapshot show src/auth.rs src/handlers/sync.rs
```

Useful for initial orientation in massive codebases, but full snapshots with profiles are usually more practical.

## Other Commands

```bash
eck-snapshot restore <snapshot>    # Restore files from a snapshot to disk
eck-snapshot prune <snapshot>      # AI-powered snapshot size reduction
eck-snapshot doctor                # Check project health
eck-snapshot env push              # Encrypt and sync .eck/ config between machines
eck-snapshot env pull              # Restore .eck/ config on another machine
```

## Changelog

### v5.8.1
- Improved Android project parsing by ignoring boilerplate and vector graphics.
- Removed duplicate `ecksnapshot` MCP server and fixed JSON parsing in `update-auto`.

## License

MIT
