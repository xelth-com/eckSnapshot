# eck-snapshot

[![npm version](https://badge.fury.io/js/%40xelth%2Feck-snapshot.svg)](https://www.npmjs.com/package/@xelth/eck-snapshot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/xelth-com/eckSnapshot/blob/main/LICENSE)

A powerful CLI tool to create and restore single-file text snapshots of Git repositories and directories. Generate comprehensive snapshots containing directory structure and file contents, optimized for providing context to Large Language Models (LLMs) like Claude, Gemini, and ChatGPT.

## ✨ What's New in v3.0.0

🎯 **Universal Directory Support**: Works with any directory, not just Git repositories  
🤖 **Enhanced AI Instructions**: Improved headers with detailed guidance for AI assistants  
⚡ **Auto-Detection**: Automatically switches to directory mode when Git isn't available  
🧹 **Clean Mode**: Option to create snapshots without AI instructions  

## Why eck-snapshot?

When working with Large Language Models (LLMs), providing complete project context is crucial for accurate results. Manually copying and pasting dozens of files is tedious and error-prone.

eck-snapshot automates this by generating a single, comprehensive text file of your entire project. This is particularly effective with models that support large context windows (like Gemini 2.0 Pro with 1M tokens), allowing the entire project to be analyzed at once.

## 🚀 Key Features

### 📁 **Universal Compatibility**
- **Git Repositories**: Leverages `git ls-files` and respects `.gitignore`
- **Any Directory**: Recursively scans any folder structure
- **Auto-Detection**: Automatically switches modes based on Git availability

### 🤖 **AI-Optimized**
- **Structured Headers**: Detailed instructions for AI assistants
- **Clean Mode**: Option to skip AI headers for general use
- **LLM-Ready Format**: Optimized for Claude, Gemini, ChatGPT, and other models

### ⚡ **Advanced Features**
- **Multiple Formats**: Plain text (Markdown) and JSON output
- **Compression**: Built-in gzip support for smaller files
- **Smart Filtering**: Configurable ignore patterns and size limits
- **Restore Capability**: Recreate entire project structures from snapshots
- **Progress Tracking**: Real-time progress bars and detailed statistics

### 🔒 **Security & Performance**
- **Path Validation**: Prevents directory traversal attacks
- **Parallel Processing**: Concurrent file handling for speed
- **Memory Efficient**: Handles large projects without memory issues

## 📦 Installation

```bash
npm install -g @xelth/eck-snapshot
```

## 🎯 Quick Start

### Create Snapshots

```bash
# Git repository (default mode)
eck-snapshot

# Any directory (auto-detects non-git folders)
eck-snapshot /path/to/any/folder

# Force directory mode (ignores git)
eck-snapshot --dir .

# Clean snapshot without AI instructions
eck-snapshot --no-ai-header

# Compressed JSON format
eck-snapshot --format json --compress
```

### Restore from Snapshots

```bash
# Basic restore
eck-snapshot restore snapshot.md

# Restore to specific directory
eck-snapshot restore snapshot.md ./restored-project

# Preview without writing files
eck-snapshot restore snapshot.md --dry-run

# Restore only specific files
eck-snapshot restore snapshot.md --include "*.js" "*.json"
```

## 📋 Usage Examples

### For AI Development

```bash
# Create AI-optimized snapshot for Gemini/Claude
eck-snapshot --format md --compress
# Result: project_snapshot_2025-01-19_12-00-00.md.gz

# Clean snapshot for general documentation
eck-snapshot --no-ai-header --output ./docs
```

### Project Backup & Migration

```bash
# Full project backup
eck-snapshot --include-hidden --format json --compress

# Selective restore
eck-snapshot restore backup.json.gz --exclude "node_modules/*" --include "src/*"
```

### Cross-Platform Development

```bash
# Create snapshot on Windows
eck-snapshot --output ./transfer

# Restore on Linux/Mac
eck-snapshot restore transfer/project_snapshot.md ./project
```

## ⚙️ Configuration

Create `.ecksnapshot.config.js` in your project root:

```javascript
export default {
  // Files to ignore by name or pattern
  filesToIgnore: [
    'package-lock.json',
    '*.log',
    '*.tmp'
  ],
  
  // File extensions to ignore
  extensionsToIgnore: [
    '.sqlite3',
    '.env',
    '.DS_Store',
    '.ico',
    '.png',
    '.jpg'
  ],
  
  // Directories to ignore
  dirsToIgnore: [
    'node_modules/',
    '.git/',
    'dist/',
    'build/',
    'coverage/'
  ],
  
  // Size and performance limits
  maxFileSize: '10MB',
  maxTotalSize: '100MB',
  maxDepth: 10,
  concurrency: 10
};
```

## 📖 Command Reference

### Snapshot Command

```bash
eck-snapshot [options] [path]
```

**Core Options:**
- `-o, --output <dir>` - Output directory (default: ./snapshots)
- `-d, --dir` - Directory mode: scan any folder recursively
- `--no-ai-header` - Skip AI instruction header (clean mode)
- `-v, --verbose` - Show detailed processing information

**Format & Compression:**
- `--format <type>` - Output format: md (default) or json
- `--compress` - Create gzipped output (.gz extension)
- `--no-tree` - Exclude directory tree from output

**Filtering:**
- `--include-hidden` - Include hidden files (starting with .)
- `--max-file-size <size>` - Maximum individual file size (e.g., 5MB)
- `--max-total-size <size>` - Maximum total snapshot size (e.g., 50MB)
- `--config <path>` - Path to custom configuration file

### Restore Command

```bash
eck-snapshot restore [options] <snapshot_file> [target_directory]
```

**Control Options:**
- `-f, --force` - Skip confirmation prompts
- `--dry-run` - Preview without writing files
- `-v, --verbose` - Show detailed processing information

**Filtering:**
- `--include <patterns>` - Include only matching files (wildcards supported)
- `--exclude <patterns>` - Exclude matching files (wildcards supported)
- `--concurrency <number>` - Number of concurrent operations (default: 10)

## 🎭 Working with AI Models

### For Gemini 2.0 Pro (1M context)
```bash
# Create comprehensive snapshot with AI instructions
eck-snapshot --format md --compress
```
The generated file includes detailed instructions for Gemini to analyze your project and provide structured commands for Claude Code.

### For Claude Code
```bash
# Clean, focused snapshot
eck-snapshot --no-ai-header --max-total-size 200MB
```

### For ChatGPT/Other Models
```bash
# Standard snapshot with moderate size limits
eck-snapshot --max-total-size 50MB --no-ai-header
```

## 🔧 Advanced Use Cases

### Monorepo Support
```bash
# Snapshot specific package in monorepo
eck-snapshot ./packages/core --dir --output ./snapshots/core

# Multiple packages
eck-snapshot ./packages/api --dir && eck-snapshot ./packages/web --dir
```

### CI/CD Integration
```bash
# Create release snapshot
eck-snapshot --format json --compress --output ./artifacts

# Documentation generation
eck-snapshot --no-ai-header --format md --output ./docs/snapshots
```

### Migration & Archival
```bash
# Complete project archive
eck-snapshot --include-hidden --format json --compress --max-total-size 1GB

# Selective migration
eck-snapshot restore archive.json.gz --include "src/*" "docs/*" --exclude "*.test.*"
```

## 📊 Output Formats

### Markdown Format (Default)
- Human-readable structure
- AI instruction headers (optional)
- Directory tree visualization
- File content with clear delimiters

### JSON Format
- Structured metadata
- Programmatic processing friendly
- Includes statistics and file information
- Perfect for automation workflows

## 🛡️ Security Features

- **Path Validation**: Prevents directory traversal during restore
- **File Sanitization**: Validates all file paths and names
- **Confirmation Prompts**: Requires approval before overwriting files
- **Size Limits**: Protects against extremely large operations

## 🚀 Performance

- **Parallel Processing**: Concurrent file operations for speed
- **Progress Tracking**: Real-time progress bars for long operations
- **Memory Efficient**: Streams large files to avoid memory issues
- **Smart Caching**: Optimized for repeated operations

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/xelth-com/eckSnapshot/issues)
- **Documentation**: This README and `--help` commands
- **Examples**: See the examples directory in the repository