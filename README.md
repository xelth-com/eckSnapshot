# eck-snapshot

### A Note from the Creator

Hello! `eck-snapshot` is a tool I originally created for my own needs while "vibecoding" my first project, eckWms, and its initial module, ecKasse. As I delved deeper into the project, new ideas and requirements for this tool began to emerge.

Today, the development "team" consists of:
- **The Client** (that's you!)
- **The Software Architect** (Gemini)
- **The Coder** (a Claude Code agent)

We've also added a "Consilium" feature. When the Architect faces a particularly tough problem, it can issue a request to all the top-tier models you have access to, forming a council of experts to find the best solution.

### Contributing & Ideas

I'm always open to hearing your ideas for improving `eck-snapshot`. If you have a suggestion that aligns with my workflow, there's a good chance it will be implemented quickly—not in days, but in hours.

Special thanks to those who can also bring their own ideas to life. Contributions are welcome! Please feel free to submit a Pull Request.

---

## ✨ What's New in v4.0: The Road to Infinite Context

My own project, the original inspiration for this tool, eventually outgrew Gemini's 1M token context window. This challenge sparked the evolution to v4.0.

- **Intelligent Search**: Instead of creating massive snapshots, you can now index your entire project and use natural language to query for the most relevant code. This feature is new and will be actively improved, but it's the future for working with truly large codebases.
- **Vector-Based Context**: Powered by Google Gemini embeddings, `eck-snapshot` performs semantic searches to find the code that's contextually related to your task.
- **Modular Architecture**: A complete internal refactor makes the tool more stable, maintainable, and extensible.

For smaller projects (under ~700k tokens), the classic snapshot mode works just as it always has. We've also added multi-agent support, allowing you to orchestrate agents across different environments (e.g., one local instance, another on a web server). You can configure all of this to fit your needs in the `setup.json` file.

---

## 🚀 Key Features

- **Dual-Mode Operation**:
  - **`snapshot`**: The classic mode to generate a single-file snapshot of an entire project.
  - **`index` & `query`**: The new intelligent mode to perform semantic searches and generate task-specific snapshots.
- **AI-Driven Philosophy**: Generates clean, structured output perfect for providing context to LLMs and is built to be used in an AI-assisted workflow.
- **Local First**: Vector indexes are stored locally in a `.ecksnapshot_index` directory in your project.
- **Deeply Configurable**: Smartly ignores `node_modules`, `.git`, and respects your `.gitignore` file. Nearly all behavior can be customized via `setup.json`.

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

This command will scan your files, break them into smart segments, generate embeddings for each, and save them to a local `.ecksnapshot_index` folder.

**Step B: Query for Context**

When you have a task (e.g., fixing a bug, adding a feature), ask `eck-snapshot` for the relevant code:

```bash
# Ask for code related to user authentication
eck-snapshot query "user authentication logic"

# Generate a snapshot and save it to a specific file
eck-snapshot query "implement a new React component for the dashboard" -o dashboard_context.md
```

The result is a small, highly relevant snapshot file containing only the code you need for your task.

### Workflow 2: Classic Full Snapshot

Useful for smaller projects or when you need a complete picture.

```bash
# Create a snapshot of the current directory
eck-snapshot snapshot

# Specify a path
eck-snapshot snapshot /path/to/your/project

# Create a snapshot and save it to a specific directory
eck-snapshot snapshot . -o ./my_snapshots
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

### `snapshot`
Creates a full snapshot of a repository.
`eck-snapshot snapshot [path] [options]`
- Refer to `--help` for all filtering and formatting options.

### `restore`
Restores a project from a snapshot file.
`eck-snapshot restore <snapshot_file> [target_directory] [options]`