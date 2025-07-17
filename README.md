# eck-snapshot

[![npm version](https://badge.fury.io/js/%40xelth%2Feck-snapshot.svg)](https://www.npmjs.com/package/@xelth/eck-snapshot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/xelth-com/eckSnapshot/blob/main/LICENSE)

A CLI tool to create and restore single-file text snapshots of a Git repository. It generates a single `.txt` file containing the directory structure and the content of all text-based files, which is ideal for providing context to Large Language Models (LLMs).

## Why eck-snapshot?

When working with Large Language Models (LLMs), providing the full context of your project is crucial for getting accurate results. Manually copying and pasting dozens of files is tedious and inefficient.

eck-snapshot automates this by generating a single, comprehensive text file of your entire repository. This is particularly effective with models that support large context windows (like Google's Gemini), as it often allows the entire project snapshot to be analyzed at once—a task that can be challenging with smaller context windows.

## Key Features

  * **Git Integration**: Automatically includes all files tracked by Git.
  * **Intelligent Ignoring**: Respects `.gitignore` rules and has its own configurable ignore lists for files, extensions, and directories.
  * **Advanced Restore**: Powerful `restore` command with filtering, dry-run mode, and parallel processing.
  * **Directory Tree**: Generates a clean, readable tree of the repository structure at the top of the snapshot.
  * **Multiple Formats**: Supports both plain text and JSON output formats.
  * **Configurable**: Customize behavior using an `.ecksnapshot.config.js` file.
  * **Progress and Stats**: Provides a progress bar and a detailed summary of what was included and skipped.
  * **Compression**: Supports gzipped (`.gz`) snapshots for smaller file sizes.
  * **Security**: Built-in path validation to prevent directory traversal attacks during restore.

## Demo

Here's an example of `eck-snapshot` in action:

```
🚀 Starting snapshot for repository: /path/to/your/project
✅ .gitignore patterns loaded
📊 Found 152 total files in the repository
🌳 Generating directory tree...
📝 Processing files...
Progress |██████████████████████████████| 100% | 152/152 files

📊 Snapshot Summary
==================================================
🎉 Snapshot created successfully!
📄 File saved to: /path/to/your/project/snapshots/project_snapshot_...txt
📈 Included text files: 130 of 152
⏭️  Skipped files: 22
...
==================================================
```

The beginning of the generated file will look like this:

```text
Directory Structure:

├── .github/
│   └── workflows/
│       └── publish.yml
├── src/
│   ├── utils/
│   │   └── formatters.js
│   └── index.js
├── .gitignore
├── package.json
└── README.md


--- File: /src/index.js ---

#!/usr/bin/env node
import { Command } from 'commander';
// ... rest of the file content

--- File: /package.json ---

{
  "name": "eck-snapshot",
  "version": "2.1.0",
  // ... rest of the file content
```

## Installation

To install the tool globally, run the following command:

```bash
npm install -g @xelth/eck-snapshot
```

## Usage

Once installed, you can run the tool from any directory in your terminal.

### Creating a Snapshot

```bash
# Create a snapshot of the current directory
eck-snapshot

# Specify a path to another repository
eck-snapshot /path/to/your/other/project

# Save the snapshot to a different directory and exclude the tree view
eck-snapshot --output ./backups --no-tree

# Create a compressed JSON snapshot
eck-snapshot --format json --compress

# Include hidden files and set custom size limits
eck-snapshot --include-hidden --max-file-size 5MB --max-total-size 50MB
```

### Restoring from a Snapshot

```bash
# Basic restore to current directory
eck-snapshot restore ./snapshots/project_snapshot_...txt

# Restore to a specific directory without confirmation
eck-snapshot restore snapshot.txt ./restored-project --force

# Preview what would be restored (dry run)
eck-snapshot restore snapshot.txt --dry-run

# Restore only specific files using patterns
eck-snapshot restore snapshot.txt --include "*.js" "*.json"

# Restore everything except certain files
eck-snapshot restore snapshot.txt --exclude "*.log" "node_modules/*"

# Restore with custom concurrency and verbose output
eck-snapshot restore snapshot.txt --concurrency 20 --verbose

# Restore compressed snapshots
eck-snapshot restore project_snapshot.txt.gz ./restored
```

## Configuration

You can create a `.ecksnapshot.config.js` file in your project's root directory to customize the tool's behavior.

**Example `.ecksnapshot.config.js`:**

```javascript
export default {
  // Files to ignore by name or pattern
  filesToIgnore: [
    'package-lock.json',
    '*.log',
  ],
  // File extensions to ignore
  extensionsToIgnore: [
    '.sqlite3',
    '.env',
  ],
  // Directories to ignore (must have a trailing slash)
  dirsToIgnore: [
    'node_modules/',
    '.git/',
    'dist/',
  ],
  // Size and performance settings
  maxFileSize: '10MB',
  maxTotalSize: '100MB',
  maxDepth: 10,
  concurrency: 10
};
```

## Advanced Features

### Restore Command Options

The restore command offers powerful filtering and control options:

- **`--dry-run`**: Preview what files would be restored without actually writing them
- **`--include <patterns>`**: Only restore files matching the specified patterns (supports wildcards)
- **`--exclude <patterns>`**: Skip files matching the specified patterns (supports wildcards)
- **`--concurrency <number>`**: Control how many files are processed simultaneously (default: 10)
- **`--force`**: Skip confirmation prompts and overwrite existing files
- **`--verbose`**: Show detailed information about each file being processed

### Supported Formats

- **Plain Text** (`.txt`): Human-readable format, ideal for LLM context
- **JSON** (`.json`): Structured format with metadata and statistics
- **Compressed** (`.gz`): Any format can be gzipped for smaller file sizes

### Security Features

- **Path Validation**: Prevents directory traversal attacks during restore operations
- **File Sanitization**: Validates file paths and names for security
- **Confirmation Prompts**: Requires user confirmation before overwriting files (unless `--force` is used)

## Command Reference

### Snapshot Command
```bash
eck-snapshot [options] [repoPath]
```

**Options:**
- `-o, --output <dir>`: Output directory for snapshots
- `--no-tree`: Exclude directory tree from output
- `-v, --verbose`: Show detailed processing information
- `--max-file-size <size>`: Maximum individual file size (e.g., 10MB)
- `--max-total-size <size>`: Maximum total snapshot size (e.g., 100MB)
- `--max-depth <number>`: Maximum directory depth for tree generation
- `--config <path>`: Path to custom configuration file
- `--compress`: Create gzipped output
- `--include-hidden`: Include hidden files (starting with .)
- `--format <type>`: Output format: txt or json

### Restore Command
```bash
eck-snapshot restore [options] <snapshot_file> [target_directory]
```

**Options:**
- `-f, --force`: Force overwrite without confirmation
- `-v, --verbose`: Show detailed processing information
- `--dry-run`: Preview without actually writing files
- `--include <patterns>`: Include only matching files
- `--exclude <patterns>`: Exclude matching files
- `--concurrency <number>`: Number of concurrent operations

## License

This project is licensed under the MIT License.