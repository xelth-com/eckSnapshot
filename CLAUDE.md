# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

eck-snapshot is a CLI tool for creating and restoring single-file text snapshots of Git repositories and directories. The tool generates comprehensive text files containing directory structure and file contents, optimized for providing context to Large Language Models. Version 3.0.0 adds universal directory support with auto-detection and enhanced AI instructions.

## Key Commands

### Development
- `npm test` - Run tests (currently returns error - no test framework configured)
- `node index.js` - Run the CLI tool locally for development
- `npm pack` - Create a package tarball for distribution

### CLI Usage
- `eck-snapshot` - Create snapshot of current directory (Git mode or auto-detects directory mode)
- `eck-snapshot /path/to/repo` - Create snapshot of specified repository
- `eck-snapshot --dir /path` - Force directory mode (scan any folder recursively)
- `eck-snapshot restore snapshot.md` - Restore files from snapshot
- `eck-snapshot restore snapshot.md --dry-run` - Preview restore without writing files
- `eck-snapshot --help` - Show all available options

### Common Snapshot Options
- `-o, --output <dir>` - Output directory for snapshots (default: ./snapshots)
- `-d, --dir` - Directory mode: scan any folder recursively (auto-enabled if no git repo found)
- `--no-ai-header` - Skip AI instruction header (create clean snapshot)
- `--no-tree` - Exclude directory tree from snapshot
- `-v, --verbose` - Show detailed processing information
- `--compress` - Create gzipped output (.gz extension)
- `--format <type>` - Output format: md (default) or json
- `--max-file-size <size>` - Maximum individual file size (default: 10MB)
- `--max-total-size <size>` - Maximum total snapshot size (default: 100MB)
- `--include-hidden` - Include hidden files starting with .

### Common Restore Options
- `-f, --force` - Skip confirmation prompts and overwrite files
- `--include <patterns>` - Only restore files matching patterns (wildcards supported)
- `--exclude <patterns>` - Skip files matching patterns (wildcards supported)
- `--concurrency <number>` - Control parallel file operations (default: 10)

## Architecture

### Core Files
- `index.js` - Main entry point containing all CLI logic and functionality
- `package.json` - NPM configuration with dependencies and scripts
- `.ecksnapshot.config.js` - Default configuration for file filtering

### Key Dependencies
- `commander` - CLI argument parsing and command structure
- `execa` - Git command execution
- `ignore` - .gitignore pattern processing
- `is-binary-path` - Binary file detection
- `cli-progress` - Progress bar display
- `inquirer` - User prompts for restore operations
- `p-limit` - Concurrency control for file processing

### Main Functions
- `createRepoSnapshot()` - Core snapshot creation logic in index.js:441
- `restoreSnapshot()` - Snapshot restoration logic in index.js:617
- `processFile()` - Individual file processing in index.js:333
- `generateDirectoryTree()` - Tree structure generation in index.js:293
- `scanDirectoryRecursively()` - Directory scanning for non-git folders in index.js:268
- `parseSnapshotContent()` - Parses file content from snapshots in index.js:773
- `generateSnapshotHeader()` - Creates AI instruction header with optional mode in index.js:42
- `checkGitRepository()` - Git detection for auto-mode switching in index.js:259

### Configuration System
The tool uses `.ecksnapshot.config.js` for customization:
- `filesToIgnore` - Patterns for files to skip
- `extensionsToIgnore` - File extensions to exclude
- `dirsToIgnore` - Directories to exclude
- Size limits and concurrency settings

### File Processing Flow
1. **Mode Detection**: Check if directory is a Git repository (unless `--dir` forced)
2. **File Discovery**: 
   - Git mode: `git ls-files` + `.gitignore` patterns
   - Directory mode: Recursive scanning with config-based filtering
3. Configuration-based filtering (extensions, patterns, directories)
4. Binary file detection using `is-binary-path`
5. Parallel file processing with progress tracking using `p-limit`
6. Content aggregation with optional AI instruction header
7. Output generation with optional compression

### Snapshot Format
- **Markdown (default)**: Plain text with AI instruction header, directory tree, and file contents
- **JSON**: Structured format with metadata, statistics, and content
- **Compression**: Both formats support gzip compression (.gz extension)

## Repository Structure

- Single-file architecture with all logic in `index.js`
- ES modules (type: "module" in package.json)
- No build step required - direct Node.js execution
- Snapshots saved to `snapshots/` directory (ignored by Git)
- Configuration in `.ecksnapshot.config.js` using ES module exports

## Configuration

The tool respects both .gitignore patterns and custom configuration. Configuration is loaded from `.ecksnapshot.config.js` with fallbacks to `.ecksnapshot.config.mjs` and `ecksnapshot.config.js`. The config file uses ES module syntax (`export default {}`).

## Testing

Currently no test framework is configured. The package.json test script returns an error indicating tests need to be set up.

## Important Implementation Notes

- Version 3.0.0 adds universal directory support with auto-detection
- Uses ES modules exclusively throughout the codebase
- All file paths are normalized to use forward slashes for cross-platform compatibility
- Security features include path validation to prevent directory traversal attacks
- Progress tracking with detailed statistics and error reporting
- Restore command includes dry-run mode and pattern-based filtering
- AI instruction header is optional (`--no-ai-header` for clean snapshots)
- Auto-mode switching: Git repository detection with fallback to directory mode
- Enhanced AI instructions specifically designed for Gemini + Claude Code workflow