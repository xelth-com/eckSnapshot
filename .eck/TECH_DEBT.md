# Technical Debt

## Active
- [ ] `claudeCliService.js` is still imported by `fileUtils.js` (line 6) for AI-powered manifest auto-generation — cannot be deleted until that dependency is refactored out
- [ ] `LEGACY_COMMANDS` shim in `cli.js` translates old positional commands to JSON — should be removed once all documentation and muscle memory is updated
- [ ] `src/templates/claude-code/mcp-server-template.js` still references `eck-snapshot update-auto` in description string (non-functional, documentation only)
- [ ] `src/cli/commands/trainTokens.js` was deleted but `generateTrainingCommand()` in `tokenEstimator.js` still generates a JSON command for `eck_train_tokens` which is not wired into the router

## Resolved
- [x] Legacy CLI commands removed — 11 orphaned modules deleted (2026-03-15)
- [x] Internal MCP calls (`mcp-eck-core.js`) migrated to native JSON payloads (2026-03-15)
- [x] All user-facing hints/templates updated to JSON format (2026-03-15)
- [x] `ENVIRONMENT.md` and `CONTEXT.md` are manually maintained (fixed 2026-03-01)
- [x] `opencodeAgentsGenerator.js` template paths are relative to `repoPath` (fixed 2026-03-01)
- [x] `updateSnapshotJson` does not deduplicate `[SYSTEM: EMBEDDED]` marker race (fixed 2026-03-01)
- [x] `js-yaml` missing from package.json (fixed 2026-01-25)
- [x] MiniMax files lingering in repo (all removed during GLM Z.AI migration)
- [x] Binary files not filtered in `updateSnapshot` (fixed 2026-02-28)
