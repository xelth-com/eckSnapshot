# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

eck-snapshot is a CLI tool for creating and restoring single-file text snapshots of Git repositories. The tool generates comprehensive text files containing directory structure and file contents, optimized for providing context to Large Language Models.

## Key Commands

### Development
- `npm test` - Run tests (currently returns error - no test framework configured)
- `node index.js` - Run the CLI tool locally
- `npm pack` - Create a package tarball for distribution

### CLI Usage
- `eck-snapshot` - Create snapshot of current directory (default command)
- `eck-snapshot /path/to/repo` - Create snapshot of specified repository
- `eck-snapshot restore snapshot.txt` - Restore files from snapshot
- `eck-snapshot --help` - Show all available options

### Common Options
- `-o, --output <dir>` - Output directory for snapshots
- `--no-tree` - Exclude directory tree from snapshot
- `-v, --verbose` - Show detailed processing information
- `--compress` - Create gzipped output
- `--format json` - Output in JSON format instead of plain text

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
- `createRepoSnapshot()` - Core snapshot creation logic in index.js:257
- `restoreSnapshot()` - Snapshot restoration logic in index.js:513
- `processFile()` - Individual file processing in index.js:189
- `generateDirectoryTree()` - Tree structure generation in index.js:143

### Configuration System
The tool uses `.ecksnapshot.config.js` for customization:
- `filesToIgnore` - Patterns for files to skip
- `extensionsToIgnore` - File extensions to exclude
- `dirsToIgnore` - Directories to exclude
- Size limits and concurrency settings

### File Processing Flow
1. Git file listing via `git ls-files`
2. .gitignore pattern loading
3. Configuration-based filtering
4. Parallel file processing with progress tracking
5. Content aggregation and output generation

## Repository Structure

- Single-file architecture with all logic in `index.js`
- ES modules (type: "module" in package.json)
- No build step required - direct Node.js execution
- Snapshots saved to `snapshots/` directory (ignored by Git)

## Configuration

The tool respects both .gitignore patterns and custom configuration. Configuration is loaded from `.ecksnapshot.config.js` with fallbacks to `.ecksnapshot.config.mjs` and `ecksnapshot.config.js`.

## Testing

Currently no test framework is configured. The package.json test script returns an error indicating tests need to be set up.