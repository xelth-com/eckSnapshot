# Technical Debt

## Active
- [ ] `LEGACY_COMMANDS` shim in `cli.js` translates old positional commands to JSON — should be removed once all documentation and muscle memory is updated
- [ ] `src/templates/claude-code/mcp-server-template.js` still references `eck-snapshot update-auto` in description string (non-functional, documentation only)
- [ ] **Unified Snapshot Engine**: Extract file collection, filtering, and metadata extraction logic into a shared service (e.g., `src/core/snapshotBuilder.js`). Current duplication between `createSnapshot.js` and `recon.js` leads to logic drift (fixed for ML models, but still risky).
- [x] Hard-coded ignore lists extracted to shared `GLOBAL_HARD_IGNORE_DIRS`/`GLOBAL_HARD_IGNORE_FILES` constants in `fileUtils.js` (2026-04-12)

## Resolved
- [x] `claudeCliService.js` removed — `fileUtils.js` now uses static stub templates (2026-03-15)
- [x] `trainTokens.js` re-created with JSON-native interface, wired into router (2026-03-15)
- [x] Legacy CLI commands removed — 11 orphaned modules deleted (2026-03-15)
- [x] Internal MCP calls (`mcp-eck-core.js`) migrated to native JSON payloads (2026-03-15)
- [x] All user-facing hints/templates updated to JSON format (2026-03-15)
- [x] `ENVIRONMENT.md` and `CONTEXT.md` are manually maintained (fixed 2026-03-01)
- [x] `opencodeAgentsGenerator.js` template paths are relative to `repoPath` (fixed 2026-03-01)
- [x] `js-yaml` missing from package.json (fixed 2026-01-25)
- [x] MiniMax files lingering in repo (all removed during GLM Z.AI migration)
- [x] Binary files not filtered in `updateSnapshot` (fixed 2026-02-28)
