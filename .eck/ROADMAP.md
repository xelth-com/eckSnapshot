# Project Roadmap

## Current Sprint
- [ ] NotebookLM-optimized snapshot profiles
- [ ] Remove `claudeCliService.js` dependency from `fileUtils.js` (last legacy service)
- [ ] Remove `LEGACY_COMMANDS` shim from `cli.js` once all callers use JSON natively

## Next Phase
- [ ] Web-based snapshot explorer
- [ ] Per-project telemetry isolation (project_id in reports)

## Completed
- [x] **v6.1: 100% JSON-Native CLI migration** — all commands are JSON payloads
- [x] **Reconnaissance Protocol** — `eck_scout` (tree) + `eck_fetch` (file extraction) for cross-repo exploration
- [x] **Codex MCP integration** — auto-detect `.codex/` dir, inject TOML config
- [x] **Dead code cleanup** — removed 11 orphaned legacy modules (restore, prune, consilium, etc.)
- [x] **Internal JSON migration** — `mcp-eck-core.js` sends native JSON payloads
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
