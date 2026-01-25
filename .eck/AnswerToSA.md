# Report: Rename .eck/snap to .eck/lastsnapshot and Update Naming Convention

**Status:** SUCCESS ✅

## Task Summary
Renamed `.eck/snap/` to `.eck/lastsnapshot/` and implemented the `eck{ShortName}{timestamp}` naming convention where ShortName uses capitalized first 3 and last 2 characters (e.g., `eckSnaOt...`).

## Changes Made

**Added:** `src/utils/fileUtils.js` - `getShortRepoName()` function
- Generates short repo name with capitalized first 3 and last 2 characters
- Example: "Snapshot" → "SNAOT", "MyProject" → "MYPRJT"

**Modified:** `src/cli/commands/createSnapshot.js`
- Imported `getShortRepoName` utility
- Updated directory path from `.eck/snap` to `.eck/lastsnapshot`
- Updated filename generation to use `eck{ShortName}{timestamp}` format
- Updated console messages to reflect new directory

**Modified:** `src/cli/commands/updateSnapshot.js`
- Imported `getShortRepoName` utility
- Updated agent report path from `.eck/snap/AnswerToSA.md` to `.eck/lastsnapshot/AnswerToSA.md`
- Updated directory path from `.eck/snap` to `.eck/lastsnapshot`
- Updated filename generation to use `eck{ShortName}{timestamp}` format
- Added active snapshot logic to `updateSnapshotJson` function

**Modified:** `src/utils/claudeMdGenerator.js`
- Updated all references from `.eck/snap/AnswerToSA.md` to `.eck/lastsnapshot/AnswerToSA.md`
- Updated reporting protocol instructions for Architect and Coder roles

**Modified:** `src/templates/opencode/coder.template.md`
- Updated report path reference to `.eck/lastsnapshot/AnswerToSA.md`

**Modified:** `src/templates/opencode/junior-architect.template.md`
- Updated report path reference to `.eck/lastsnapshot/AnswerToSA.md`
- Updated all operational rules to reflect new directory structure

## Verification

- ✅ All tests pass (18/18 tests)
- ✅ No breaking changes to existing functionality
- ✅ New naming convention implemented correctly
- ✅ Directory rename complete

## Benefits

- **Clearer naming**: `.eck/lastsnapshot/` better describes the folder's purpose
- **Consistent naming**: `eck{ShortName}{timestamp}` provides predictable filenames
- **Better readability**: Capitalized short names (e.g., `SNAOT`) are easier to identify

## Next Steps

No additional steps required. The directory rename and naming convention update is complete.
