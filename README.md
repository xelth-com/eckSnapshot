# eck-snapshot

A powerful CLI tool to create, index, and query intelligent snapshots of your codebases. Go beyond simple file dumps and generate context-aware snapshots optimized for Large Language Models (LLMs) like Claude, Gemini, and ChatGPT.

## ✨ What's New in v4.0

- **Intelligent Search**: Instead of creating massive snapshots, you can now index your entire project and use natural language to query for the most relevant code.
- **Vector-Based Context**: Powered by Google Gemini embeddings, `eck-snapshot` performs semantic searches to find the code that's contextually related to your task.
- **Modular Architecture**: A complete internal refactor makes the tool more stable, maintainable, and extensible.

---

## 🚀 Key Features

- **Dual-Mode Operation**:
  - **`create`**: The classic mode to generate a single-file snapshot of an entire project.
  - **`index` & `query`**: The new intelligent mode to perform semantic searches and generate task-specific snapshots.
- **AI-Optimized**: Generates clean, structured output perfect for providing context to LLMs.
- **Local First**: Vector indexes are stored locally in a `.ecksnapshot_index` directory in your project.
- **Highly Configurable**: Smartly ignores `node_modules`, `.git`, and respects your `.gitignore` file.

---

## 📦 Installation & Setup

### 1. Installation

```bash
npm install -g @xelth/eck-snapshot
```

### 2. API Key Setup (Required for New Features)

The new `index` and `query` commands use the Google Gemini API to generate embeddings. 

1.  Obtain an API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2.  Create a `.env` file in your project's root directory.
3.  Add your API key to the `.env` file:
    ```
    GEMINI_API_KEY="YOUR_API_KEY_HERE"
    ```

`eck-snapshot` will automatically load this key. 

---

## 🎯 Usage Workflows

Choose the workflow that best fits your needs.

### Workflow 1: Intelligent Search (Recommended for Large Projects)

This is the most powerful way to use `eck-snapshot`.

**Step A: Index Your Project (One-time per major change)**

Navigate to your project's root directory and run:

```bash
eck-snapshot index
```

This command will scan all your files, break them down into smart segments (functions, classes), generate embeddings for each, and save them to a local `.ecksnapshot_index` folder.

**Step B: Query for Context**

When you have a task (e.g., fixing a bug, adding a feature), ask `eck-snapshot` for the relevant code:

```bash
# Ask for code related to user authentication
eck-snapshot query "user authentication logic"

# Find context for a specific bug
eck-snapshot query "fix bug in the payment processing webhook"

# Generate a snapshot and save it to a specific file
eck-snapshot query "implement a new React component for the dashboard" -o dashboard_context.md
```

The result is a small, highly relevant snapshot file containing only the code you need for your task.

### Workflow 2: Classic Full Snapshot

Useful for smaller projects or when you need a complete picture.

```bash
# Create a snapshot of the current directory
eck-snapshot create

# Specify a path
eck-snapshot create /path/to/your/project

# Create a snapshot and save it to a specific directory
eck-snapshot create . -o ./my_snapshots
```

---

## 📖 Command Reference

### `index`
Indexes a project for semantic search.
`eck-snapshot index [path]`
- `[path]`: (Optional) Path to the project. Defaults to the current directory.

### `query`
Generates a context-aware snapshot from an indexed project.
`eck-snapshot query "<your query>" [options]`
- `"<your query>"`: A description of the code you're looking for.
- `-o, --output <file>`: (Optional) The output file name.
- `-k <number>`: (Optional) Number of results to retrieve. Default: 10.

### `create` (Previously `snapshot`)
Creates a full snapshot of a repository.
`eck-snapshot create [path] [options]`
- Refer to `--help` for all filtering and formatting options.

### `restore`
Restores a project from a snapshot file.
`eck-snapshot restore <snapshot_file> [target_directory] [options]`