# Technical Debt

## Active

### Medium Priority

**`updateSnapshotJson` does not deduplicate `[SYSTEM: EMBEDDED]` marker race**
- If two `update-auto` runs happen simultaneously, both may embed the report before the marker is appended
- Impact: Duplicate agent report sections in snapshot
- Fix: Use atomic file rename or lock file

**Token estimation ignores `estimatedTokens` in regression**
- `addTrainingPoint` stores `estimatedTokens` in `trainingPoints[]` but regression only uses `actualTokens` vs `fileSizeBytes`
- The error tracking in `showEstimationStats` uses `estimatedTokens` from the stored point, which is the value at training time (may drift)
- Fix: Recalculate estimate from current coefficients at display time

**`eck-telemetry` linear regression is stateless (no caching)**
- `GET /T/tokens/weights` re-runs the full query + regression on every request
- Fine for now (table is small), but will degrade at scale
- Fix: Cache coefficients in-memory with TTL (e.g., 5 min), invalidate on new `POST /T/tokens/train`

### Low Priority

**`ENVIRONMENT.md` and `CONTEXT.md` are manually maintained**
- Out-of-date model versions (still says "Sonnet 4.5" in some places)
- Fix: Auto-generate from `setup.json` during `eck-snapshot` run

## Resolved
- [x] `opencodeAgentsGenerator.js` template paths are relative to `repoPath` with `../..` hacks (fixed 2026-03-01)
- [x] `js-yaml` missing from package.json (was already declared as ^4.1.0)
- [x] MiniMax files lingering in repo (all removed during GLM Z.AI migration)
- [x] `agentReport` undefined bug in `updateSnapshot` (fixed 2026-01-25)
- [x] File duplication in snapshot body from `alwaysIncludePatterns` (fixed 2026-01-25)
- [x] Binary files not filtered in `updateSnapshot` (fixed 2026-02-28)
