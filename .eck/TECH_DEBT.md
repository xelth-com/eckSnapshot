# Technical Debt

## Active

## Resolved
- [x] `ENVIRONMENT.md` and `CONTEXT.md` are manually maintained (fixed 2026-03-01)
- [x] `opencodeAgentsGenerator.js` template paths are relative to `repoPath` (fixed 2026-03-01)
- [x] `updateSnapshotJson` does not deduplicate `[SYSTEM: EMBEDDED]` marker race (fixed 2026-03-01)
- [x] Token estimation ignores `estimatedTokens` in regression calculation (fixed 2026-03-01)
- [x] `eck-telemetry` linear regression is stateless / lacks caching (fixed 2026-03-01)
- [x] `js-yaml` missing from package.json (fixed 2026-01-25)
- [x] MiniMax files lingering in repo (all removed during GLM Z.AI migration)
- [x] `agentReport` undefined bug in `updateSnapshot` (fixed 2026-01-25)
- [x] File duplication in snapshot body from `alwaysIncludePatterns` (fixed 2026-01-25)
- [x] Binary files not filtered in `updateSnapshot` (fixed 2026-02-28)
