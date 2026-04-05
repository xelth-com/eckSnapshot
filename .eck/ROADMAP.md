# Project Roadmap

## Current Sprint
- [ ] Remove `LEGACY_COMMANDS` shim from `cli.js` once all callers use JSON natively

## Next Phase
- [ ] **Scoped Directory Filtering (Path Б)** — dynamically apply project-specific filters per subdirectory (e.g., Android rules only inside `android/`) instead of global union
- [ ] Web-based snapshot explorer
- [ ] Per-project telemetry isolation (project_id in reports)

## Completed
- [x] **NotebookLM Chunked Export** — `notebook` (hybrid), `notebook link N` (linked project), `notebook scout N` (read-only) with Brain+Body architecture, depth-controlled chunking, and system prompt generation. Fixed depth=0 default and chunk size calculation using post-truncation byte length (v6.4.5, 2026-04-05)
- [x] **Atomic Manifest Editing** — `eck_manifest_edit` MCP tool for token-efficient `.eck/` file editing without reading full files into context (2026-04-04)
- [x] **Anti-Contamination Guardrails** — Cross-project hallucination prevention in AI context generation (2026-04-04)
- [x] **Autonomous AI Protocols** — Context Hygiene (smart bloat detection with severity-based response + manual override code words), Proactive Tech Debt scanning, Boy Scout Rule (forced docstring updates), Zero-Broken-Windows (mandatory test pass before commit). Documented in README and `.eck/CONTEXT.md` (2026-03-28)
- [x] **Polyglot Monorepo Filtering** — `getProjectSpecificFiltering` merges ignore rules from all detected project types (Rust+Android, etc.). Fixed `generateDirectoryTree` substring match bug hiding `build.gradle` files (2026-03-17)
- [x] **v6.2.1: Refined Depth Scale (0-9)** — Granular 10-level depth for both `scout` and `link`: tree → truncated(10/30/60/100) → skeleton → skeleton+docs → full(500/1000/unlimited). Shared via `depthConfig.js`. Skeletonizer now supports `preserveDocs` option (2026-03-16)
- [x] **v6.2: Cross-Context Protocol** — `eck-snapshot link [depth]` generates standalone companion snapshots
- [x] **v6.1: 100% JSON-Native CLI migration** — all commands are JSON payloads
- [x] **Reconnaissance Protocol** — `eck_scout` (tree + depth content) + `eck_fetch` (file extraction by glob) for cross-repo exploration
- [x] **Codex MCP integration** — auto-detect `.codex/` dir, inject TOML config
- [x] **Dead code cleanup** — removed 11 orphaned legacy modules (restore, prune, consilium, etc.)
- [x] **Internal JSON migration** — `mcp-eck-core.js` sends native JSON payloads
- [x] `claudeCliService.js` removed — `fileUtils.js` uses static stub templates (v6.1.0)
- [x] Token training tools restored (`eck_train_tokens`, `eck_token_stats`) in JSON interface
- [x] Empty `eck-snapshot` command defaults to full snapshot (v6.1.3)
- [x] Legacy command shims for backward compatibility (`snapshot`, `update`, `scout`, `fetch`, etc.)
- [x] Improved Incremental Snapshots (tracking deleted files)
- [x] Shannon Entropy check in SecretScanner for better credential detection
- [x] Royal Court Architecture (Senior Architect → Junior Architects → GLM Z.AI Workers)
- [x] GLM Z.AI Worker Swarm via MCP (frontend/backend/qa/refactor/general specialists)
- [x] MiniMax → GLM Z.AI migration (v5.1.0)
- [x] JAZ mode (OpenCode + GLM-4.7 environment)
- [x] JAS/JAO snapshot modes (Claude Code environments)
- [x] MCP integration (eck-core + glm-zai servers)
- [x] Smart Delegation Protocol with intelligent retry
- [x] Skeleton Mode (Babel + Tree-sitter function body stripping)
- [x] Delta Updates with Git anchors and sequential numbering
- [x] Built-in SecretScanner (automatic API key redaction)
- [x] Dynamic `.eck/` manifest loading (v6.0.11)
- [x] Interactive Knowledge Distillation protocol for all agent roles
