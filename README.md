
# eckSnapshot

A CLI tool to create a single-file text snapshot of a Git repository. It generates a single `.txt` file containing the directory structure and the content of all text-based files, which is ideal for providing context to Large Language Models (LLMs) like GPT or Claude.

## Features

-   **Git Integration**: Automatically includes all files tracked by Git.
-   **Intelligent Ignoring**: Respects `.gitignore` rules and has its own configurable ignore lists for files, extensions, and directories.
-   **Directory Tree**: Generates a clean, readable tree of the repository structure at the top of the snapshot.
-   **Configurable**: Customize behavior using an `.ecksnapshot.config.js` file.
-   **Progress and Stats**: Provides a progress bar and a detailed summary of what was included and skipped.

## Installation

To install the tool globally, run the following command:

```bash
npm install -g @username/eck-snapshot
````

*(Note: Replace `@username/eck-snapshot` with the actual package name you publish to npm).*

## Usage

Once installed, you can run the tool from any directory in your terminal. While the project is named `eckSnapshot`, the command-line tool is invoked as **`eck-snapshot`** to follow standard CLI conventions.

**Generate a snapshot of the current directory:**

```bash
eck-snapshot
```

**Specify a path to another repository:**

```bash
eck-snapshot /path/to/your/other/project
```

**Common Options:**

  - `-o, --output <dir>`: Specify a different output directory for the snapshot file.
  - `-v, --verbose`: Show detailed processing information, including skipped files.
  - `--no-tree`: Exclude the directory tree from the snapshot.
  - `--config <path>`: Use a configuration file from a specific path.

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
  // Maximum size for individual files
  maxFileSize: '10MB',
};
```

## License

This project is licensed under the MIT License.
