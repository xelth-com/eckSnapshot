# Technical Debt

## Active
- [ ] Verify Z.AI honors `cache_control` on the first live GLM delegation — success shows a `cache: N read / M written` usage footer; rejection logs a one-time stderr fallback notice and the worker continues uncached (`scripts/mcp-glm-zai-worker.mjs`)
- [ ] Broaden vitest coverage: fixture-tree tests for `discoverFiles`/`renderFileAtDepth`, `extractMetadata` journal parsing (current suite: 18 tests, parser + builder utilities)
- [ ] (optional, low priority) Replace the argv-mutation double-parse in `cli.js` with first-class commander subcommands — the shorthands themselves stay (they are the human interface, see `ARCHITECTURAL_AUDIT.md` §4)

## Resolved
- [x] 📋 **Architectural Audit (2026-06-10)** — EXECUTED same day across all 4 sections: §1 engine unification COMPLETE (closure decision recorded in audit doc), §2 parser hardened (line-anchored tags fix the `</file>`-in-content defect, attribute-order tolerance, quad-backtick fences), §3 worker upgraded (prompt caching with 400-fallback, usage passthrough, 256KB file guard, `project_root`/`max_tokens` args), §4 shims reframed. See `ARCHITECTURAL_AUDIT.md`.
- [x] `LEGACY_COMMANDS` reframed (2026-06-10) — renamed to `HUMAN_SHORTHANDS`: audit found these are the *primary human interface*, kept as a feature; the lone true-legacy caller (`update-auto` in mcp-server-template) migrated to the JSON payload. Leftover argv double-parse tracked above as optional.
- [x] `src/templates/claude-code/mcp-server-template.js` referenced `eck-snapshot update-auto` — description string AND the execa call migrated to the `eck_update_auto` JSON payload (2026-06-10); positional shim entry kept for previously generated template copies
- [x] **Unified Snapshot Engine**: COMPLETE (2026-06-10) — `src/core/snapshotBuilder.js` is the single pipeline for all commands; createSnapshot's `processFile` render path migrated to `renderFileAtDepth` (secret redaction preserved, now applied to rendered output); recon, updateSnapshot, generateProfileGuide migrated earlier same day. Covered by `test/snapshotBuilder.test.js`.
- [x] Hard-coded ignore lists extracted to shared `GLOBAL_HARD_IGNORE_DIRS`/`GLOBAL_HARD_IGNORE_FILES` constants in `fileUtils.js` (2026-04-12)
- [x] Extension-only binary detection (`is-binary-path`) missed extensionless ELF/SQLite/firmware files — fixed via `isBinaryFile()` magic-byte + null-byte sniff in `fileUtils.js` (2026-05-14)
- [x] Rotated logs (`.log.0`, `.log.gz`, etc.) and core dumps not filtered — fixed via `GLOBAL_HARD_IGNORE_GLOBS` minimatch list in `fileUtils.js` (2026-05-14)
- [x] `ML_EXTENSIONS` auto-bypass caused false positives on raw `.bin` dumps (mitm captures, sniffer output) — fixed via `arguments.ml: true` opt-in flag (2026-05-14)
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
