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

- **Intelligent Search**: Instead of creating massive snapshots, you can now index your entire project and use natural language to query for the most relevant code. This is the future for working with truly large codebases.
- **Vector-Based Context**: Powered by Google Gemini embeddings, `eck-snapshot` performs semantic searches to find the code that's contextually related to your task.
- **Smart Mode**: Automatically detects large projects and uses vector indexing instead of single-file snapshots to provide the most relevant context without overwhelming the AI.

For smaller projects, the classic snapshot mode works just as it always has.

---

## 🚀 Key Features

- **Dual-Mode Operation**:
  - **`index` & `query`**: The new intelligent mode to perform semantic searches and generate task-specific, context-aware snapshots.
  - **`snapshot`**: The classic mode to generate a single-file snapshot of an entire project.
- **Portable Indexes**: Export the entire vector index into a single, shareable file. Run queries offline or on different machines without needing an API key.
- **AI-Driven Philosophy**: Generates clean, structured output perfect for providing context to LLMs and is built to be used in an AI-assisted workflow.
- **Local First**: Vector indexes are stored locally in a `.ecksnapshot_index` directory in your project. You own your data.
- **Deeply Configurable**: Smartly ignores `node_modules`, `.git`, and respects your `.gitignore` file. Nearly all behavior can be customized via `setup.json`.

---

## 📦 Installation & Setup

### 1. Installation

```bash
npm install -g @xelth/eck-snapshot
```

### 2. API Key Setup (Required for `index` command)

The `index` command uses the Google Gemini API to generate embeddings.

1.  Obtain an API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2.  Create a `.env` file in your project's root directory.
3.  Add your API key to the `.env` file:
    ```
    GEMINI_API_KEY="YOUR_API_KEY_HERE"
    ```

`eck-snapshot` will automatically load this key.

---

## 🎯 Usage Workflows

Choose the workflow that best fits your project's size and your needs.

### Workflow 1: Intelligent Search (Recommended for Large Projects)

This is the most powerful way to use `eck-snapshot`.

**Step A: Index Your Project (One-time per major change)**

Navigate to your project's root directory and run:

```bash
eck-snapshot index
```

This command scans your files, breaks them into smart segments (functions, classes), generates embeddings for each, and saves them to a local `.ecksnapshot_index` folder.

**Step B: Query for Context**

When you have a task (e.g., "fixing a bug in the user authentication flow"), ask `eck-snapshot` for the relevant code:

```bash
# Ask for code related to user authentication
eck-snapshot query "user authentication logic"

# The result is a small, highly relevant snapshot file containing only the code you need.
```

### Workflow 2: Classic Full Snapshot (For Smaller Projects)

Useful for smaller projects or when you need a complete picture.

```bash
# Create a snapshot of the current directory
eck-snapshot snapshot

# This command automatically detects project size. If it's too large,
# it will run the 'index' command for you.
```

### Workflow 3: Portable Indexes (For Collaboration & Offline Use)

**Step A: Create a Portable Index**

After indexing, create a shareable JSON file of your vector database.

```bash
# This runs a sync and then exports the result
eck-snapshot index --export
# Creates a file like: YourProject_2025-08-17_22-30-00_vectors.json
```

**Step B: Query Using the Portable Index**

Anyone can now use this file to perform queries without needing an API key.

```bash
# The --import flag tells the query command to use the file
eck-snapshot query "database connection logic" --import YourProject_..._vectors.json
```

---

## 📖 Command Reference

### `index`
Indexes a project for semantic search. It uses a smart sync mechanism to only update what has changed.
`eck-snapshot index [path] [options]`
- `[path]`: (Optional) Path to the project. Defaults to the current directory.
- `--export [filename]`: (Optional) Export the synchronized index to a JSON file. If no filename is given, a default one is generated.

### `query`
Generates a context-aware snapshot from an indexed project.
`eck-snapshot query "<your query>" [options]`
- `"<your query>"`: A description of the code you're looking for.
- `-o, --output <file>`: (Optional) The output file name for the RAG snapshot.
- `-k <number>`: (Optional) Number of results to retrieve. Default: 10.
- `--import <filename>`: (Optional) Use a portable index file for the query. No API key is needed when using this flag.

### `snapshot`
Creates a full snapshot of a repository. Automatically switches to `index` mode for large projects.
`eck-snapshot snapshot [path] [options]`
- Refer to `--help` for all filtering and formatting options.

### `restore`
Restores a project from a classic snapshot file.
`eck-snapshot restore <snapshot_file> [target_directory] [options]`

---

## ⚙️ Configuration

All configuration is now centralized in the `setup.json` file in the project root. Here you can configure:
- `tokenThreshold`: The project size at which to automatically switch to vector indexing.
- `autoExportOnIndex`: Set to `true` to automatically create a portable index file after every successful sync.
- File filtering rules, performance settings, and more.