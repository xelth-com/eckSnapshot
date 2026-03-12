# Project Roadmap

## Current Sprint
- [ ] Deploy `eck-telemetry` Rust service to production (`deploy_telemetry.sh`)
- [ ] NotebookLM-optimized snapshot profiles

## Next Phase
- [ ] Web-based snapshot explorer
- [ ] Per-project telemetry isolation (project_id in reports)

## Completed
- [x] Improved Incremental Snapshots (tracking deleted files)
- [x] Shannon Entropy check in SecretScanner for better credential detection
- [x] Project initialization
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
- [x] Rust, Go, C, Python, Java, Kotlin support in Skeletonizer
- [x] Agent Report embedding in snapshots (AnswerToSA.md)
- [x] Identity Trace Protocol (Executor field in all reports)
- [x] eck-telemetry Rust microservice (agent_runs + token_training tables)
- [x] Telemetry push client (auto-push on `update` and `update-auto`)
- [x] Global token weights sync (`GET /T/tokens/weights` with linear regression)
- [x] `eck-snapshot telemetry push` and `sync-weights` commands
- [x] Claude Code + OpenCode environment isolation
- [x] Dynamic `.eck/` manifest loading (v6.0.11) — all `.md` files auto-discovered
- [x] Interactive Knowledge Distillation protocol for all agent roles
- [x] Auto-generate ENVIRONMENT.md and CONTEXT.md out of setup.json
