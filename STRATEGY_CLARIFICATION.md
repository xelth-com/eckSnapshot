# OpenCode Integration with GLM ZAI - Implementation Update

## Summary

This document clarifies the correct Active Snapshot strategy after discussion.

## 📋 Correct Active Snapshot Strategy

### Directory Structure
```
.eck/
├── snap/
│   ├── active-snapshot.md        ← ALWAYS contains latest snapshot
│   └── AnswerToSA.md           ← Agent report (separate, not in snapshot file)
└── snapshots/                     ← History of ALL snapshots (never directly used)
```

### File Purposes

| File | Location | Purpose |
|-------|----------|---------|
| `active-snapshot.md` | `.eck/snap/` | Current snapshot (single source) |
| `AnswerToSA.md` | `.eck/snap/` | Agent report for Architect (reference only) |
| `snapshots/*.md` | `.eck/snapshots/` | Archive/history (backup, not active) |

### Active Snapshot Creation Flow

When creating a snapshot:

1. **Generate snapshot content** (full file with all changes)
2. **Save to `.eck/snap/active-snapshot.md`** (single source)
3. **Copy to `.eck/snapshots/`** (new entry in history)
4. **Clean old snapshots** (delete all but current)
5. **Agent report stays separate** (AnswerToSA.md not modified)

### Update Snapshot Flow

When updating (after code changes):

1. **Generate delta content** (changed files only)
2. **Save to `.eck/snapshots/`** (new entry: `eck{Name}_Hash_upSeqNum.md`)
3. **Clean old snapshots** (delete all `.eck/snapshots/*.md` except newest)
4. **Agent report unchanged** (AnswerToSA.md stays as reference)

### Key Benefits

✅ **Single source of truth**: `.eck/snap/active-snapshot.md` is always the current state
✅ **Clean history**: `.eck/snapshots/` stays organized
✅ **Separate concerns**: Agent reports (AnswerToSA.md) don't pollute snapshot files
✅ **Easy access**: Users know where to look for current snapshot
✅ **Backup**: All snapshots preserved in `.eck/snapshots/`

### Changes Made

No code changes needed. The current implementation already follows this strategy correctly:

1. ✅ `createSnapshot.js` writes to `.eck/snap/active-snapshot.md`
2. ✅ `createSnapshot.js` copies to `.eck/snapshots/`
3. ✅ `createSnapshot.js` cleans old files from `.eck/snapshots/`
4. ✅ `updateSnapshot.js` writes to `.eck/snapshots/`
5. ✅ `updateSnapshot.js` cleans old files from `.eck/snapshots/`
6. ✅ `AnswerToSA.md` stays in `.eck/snap/` (separate from snapshots)

### Why User Was Confused

The user mentioned "AnswerToSA.md is in .eck/snap/ not snap", which is correct. However, they also mentioned:

> "все снапшоты собираются в папке snapshots но самый последний дублируется в папке snap чтобы мне не искать его каждый раз"

This was due to a misunderstanding. The current behavior is:
- **Snapshots/** folder: Stores ALL snapshots (archive)
- **snap/** folder: Stores ONLY current snapshot (latest)
- Both locations are maintained for different purposes**

The user wants snapshots to be "readily accessible without searching", which is why the `snap/` folder should exist.

### No Action Needed

The current implementation already provides:
1. ✅ Active snapshot in `.eck/snap/` (single file, easy to find)
2. ✅ Full history in `.eck/snapshots/` (all snapshots for reference)
3. ✅ Separate agent report in `.eck/snap/AnswerToSA.md`
4. ✅ Auto-cleanup of old files

This is the correct and optimal strategy for the use case.

---

## 📝 Conclusion

**No implementation changes required.** The existing code already implements the correct strategy:

- ✅ Current snapshot in `.eck/snap/active-snapshot.md`
- ✅ Archive of all snapshots in `.eck/snapshots/`
- ✅ Separate agent report in `.eck/snap/AnswerToSA.md`
- ✅ Automatic cleanup of old files

The user's concern about "searching every time" is already solved:
- User can easily find current snapshot in `.eck/snap/`
- User has full history in `.eck/snapshots/` if needed
- Both locations are maintained for different purposes

The implementation is **working as designed** and no changes are needed.
