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
  concurrency: 10,
  
  // Environment-aware AI instructions (NEW in v3.0.0+)
  environments: {
    local_dev: {
      name: "Local Development",
      description: "Local development environment with full GUI and development tools available",
      hasGUI: true,
      allowedCommands: [
        "npm install", "npm run dev", "npm run build", "npm test",
        "git commands", "file operations", "IDE/editor commands",
        "browser automation", "GUI applications", "electron apps"
      ],
      prohibitedCommands: [],
      detectionPatterns: {
        NODE_ENV: ["development", "dev"],
        USER: ["developer", "dev", "admin"],
        checkDisplayVariable: true
      }
    },
    production_server: {
      name: "Production Server",
      description: "Headless production server environment without GUI capabilities",
      hasGUI: false,
      allowedCommands: [
        "npm install --production", "npm run start", "npm run build",
        "systemctl commands", "docker commands", "file operations",
        "database operations", "API testing", "log analysis"
      ],
      prohibitedCommands: [
        "GUI applications", "electron apps", "browser automation",
        "IDE/editor launching", "display-dependent commands",
        "npm run dev", "development servers with hot reload"
      ],
      detectionPatterns: {
        NODE_ENV: ["production", "prod"],
        USER: ["root", "app", "deploy", "ubuntu", "ec2-user"],
        HOSTNAME: ["*-server", "*-prod", "*production*"],
        checkDisplayVariable: false
      }
    },
    ci_cd: {
      name: "CI/CD Pipeline",
      description: "Continuous integration/deployment environment",
      hasGUI: false,
      allowedCommands: [
        "npm ci", "npm run build", "npm test", "npm run lint",
        "docker build", "docker push", "deployment scripts",
        "artifact generation", "static analysis tools"
      ],
      prohibitedCommands: [
        "interactive commands", "GUI applications", "development servers",
        "watch modes", "interactive prompts", "browser automation"
      ],
      detectionPatterns: {
        CI: ["true"],
        GITHUB_ACTIONS: ["true"],
        JENKINS_URL: ["*"],
        GITLAB_CI: ["true"],
        TRAVIS: ["true"],
        checkDisplayVariable: false
      }
    }
  }
};
```

### Environment Self-Detection Protocol

**NEW in v3.0.0+**: eckSnapshot embeds a self-detection protocol in AI snapshots that instructs AI agents to determine their execution environment at runtime. This prevents common issues like AI agents trying to run GUI commands on headless servers.

**How It Works:**
1. **Configuration**: Define environments with `detectionPatterns` in your config
2. **Snapshot Generation**: The protocol is embedded in the AI instruction header
3. **Runtime Detection**: AI agents run detection commands (`whoami`, `echo $NODE_ENV`, etc.)
4. **Pattern Matching**: Agents compare output to patterns and identify their environment
5. **Constraint Enforcement**: Agents follow environment-specific allowed/prohibited commands

**Detection Patterns:**
- **Environment Variables**: `NODE_ENV`, `USER`, `HOSTNAME`, `CI`, `GITHUB_ACTIONS`, etc.
- **Display Availability**: `checkDisplayVariable` detects GUI availability via `DISPLAY` or `WAYLAND_DISPLAY`
- **Wildcard Support**: Hostname patterns like `*-server`, `*-prod`, `*production*`

**Benefits:**
- **Portable Snapshots**: Same snapshot works across different environments
- **Automatic Adaptation**: AI agents adapt behavior based on their runtime context
- **Error Prevention**: Avoids GUI commands on servers, interactive prompts in CI, etc.
- **Flexible Configuration**: Easily add new environments and detection rules

## 🤖 Agent Environment Awareness

**NEW in v3.0.0+**: Advanced environment detection and code ownership protocols ensure AI agents operate safely and appropriately in any execution context.

### Environment Configuration

Define execution environments in your `.ecksnapshot.config.js`:

```javascript
environments: {
  local_dev: {
    name: "Local Development Environment",
    description: "Local development machine with full GUI and development tools",
    capabilities: [
      "Full GUI access", "Browser automation", "IDE/editor launching",
      "Interactive development", "File system access", "Network access"
    ],
    uniqueSignature: "AGENT_ENV_LOCAL_DEV",
    detectionPatterns: {
      USER: ["xelth", "developer", "dev", "admin"],
      NODE_ENV: ["development", "dev", ""],
      DISPLAY: ["*"],
      checkDisplayVariable: true,
      operatingSystem: ["Windows_NT", "Darwin", "Linux"]
    },
    allowedOperations: [
      "npm install", "npm run dev", "git operations", 
      "browser automation", "interactive prompts"
    ],
    prohibitedOperations: [
      "systemctl", "service commands", "production deployments"
    ]
  },
  web_server: {
    name: "Web Server Environment", 
    description: "Headless web server without GUI capabilities",
    capabilities: [
      "Command line operations", "File system access", "Network access",
      "Package installation", "Process management", "Database operations"
    ],
    uniqueSignature: "AGENT_ENV_WEB_SERVER",
    detectionPatterns: {
      USER: ["root", "www-data", "nginx", "ubuntu", "ec2-user"],
      NODE_ENV: ["production", "prod", "staging"],
      checkDisplayVariable: false,
      operatingSystem: ["Linux"]
    },
    allowedOperations: [
      "npm install --production", "systemctl", "docker", 
      "database commands", "log analysis"
    ],
    prohibitedOperations: [
      "GUI applications", "browser automation", "interactive prompts",
      "development servers", "npm run dev"
    ]
  }
}
```

### Code Ownership Protocol

Configure code boundary markers and ownership rules:

```javascript
codeOwnership: {
  boundaryMarkers: {
    start: "AGENT_BOUNDARY_START",
    end: "AGENT_BOUNDARY_END"
  },
  ownershipRules: {
    respectExisting: true,
    requireConfirmation: true,
    trackChanges: true
  }
}
```

**Benefits:**
- **Safe Multi-Agent Collaboration**: Multiple AI agents can work on the same codebase without conflicts
- **Change Tracking**: Clear attribution of code modifications
- **Ownership Respect**: Agents check for existing boundaries before making changes
- **Confirmation Requirements**: Critical changes require explicit approval

## 🧠 LLM Consilium Workflow

**NEW in v3.0.0+**: Generate structured requests for multi-LLM collaboration on complex tasks requiring diverse expertise.

### Consilium Configuration

Define expert roles and capabilities:

```javascript
consilium: {
  defaultMembers: {
    architect: {
      role: "System Architect",
      expertise: ["system design", "architecture patterns", "scalability"],
      preferredModel: "claude-3.5-sonnet"
    },
    security: {
      role: "Security Specialist", 
      expertise: ["security vulnerabilities", "authentication", "data protection"],
      preferredModel: "gpt-4"
    },
    performance: {
      role: "Performance Engineer",
      expertise: ["optimization", "caching", "database performance"],
      preferredModel: "claude-3.5-sonnet"
    },
    ux: {
      role: "UX/UI Specialist",
      expertise: ["user experience", "interface design", "accessibility"],
      preferredModel: "gpt-4"
    }
  },
  taskComplexityThresholds: {
    lowComplexity: ["bug fixes", "simple features", "documentation"],
    mediumComplexity: ["feature implementation", "refactoring", "integration"],
    highComplexity: ["architecture changes", "system redesign", "security implementation"]
  }
}
```

### Using the Consilium Command

Generate structured collaboration requests:

```bash
# Generate consilium request for complex architectural task
eck-snapshot consilium "Design a real-time notification system with WebSocket support" \
  --file src/server.js --file package.json \
  --complexity high \
  --output ./consilium_request.json

# Specify particular expert members
eck-snapshot consilium "Optimize database query performance" \
  --members architect performance \
  --file src/database.js \
  --complexity medium

# Simple task requiring minimal expertise
eck-snapshot consilium "Add input validation to user registration" \
  --members security \
  --complexity low
```

### Consilium Workflow

1. **Generate Request**: Use the `consilium` command to create a structured JSON request
2. **Distribute to LLMs**: Share the JSON with your chosen AI tools/models
3. **Collect Responses**: Each LLM responds as their assigned expert role
4. **Analyze Consensus**: Review all expert opinions and recommendations
5. **Implement Solution**: Execute the agreed-upon approach

**Example Generated Request Structure:**
```json
{
  "request_type": "consilium_request",
  "task": {
    "description": "Design a real-time notification system",
    "complexity": "high",
    "domain": "backend"
  },
  "consilium_members": [
    {
      "member_id": "architect",
      "role": "System Architect",
      "expertise_areas": ["system design", "architecture patterns"],
      "preferred_model": "claude-3.5-sonnet"
    }
  ],
  "response_requirements": {
    "format": "structured_json",
    "response_sections": [
      "analysis", "recommendations", "implementation_steps",
      "risks_and_considerations", "success_metrics"
    ]
  }
}
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

### Consilium Command

```bash
eck-snapshot consilium [options] <task_description>
```

**Core Options:**
- `-f, --file <files...>` - Specific files to include in consilium context
- `-o, --output <path>` - Output path for consilium request JSON (default: ./consilium_request.json)
- `--members <members...>` - Specify members: architect, security, performance, ux
- `--complexity <level>` - Task complexity: low, medium, high (default: medium)
- `--config <path>` - Path to configuration file

**Examples:**
```bash
# Generate consilium for architectural task
eck-snapshot consilium "Design microservices architecture" --complexity high

# Include specific files for context
eck-snapshot consilium "Optimize API performance" --file src/api.js --members architect performance

# Output to custom location
eck-snapshot consilium "Implement authentication" --members security --output ./auth_consilium.json
```

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