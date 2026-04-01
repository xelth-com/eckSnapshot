# 📸 eckSnapshot v6.3.2 (AI-Native Edition)

A specialized, AI-native CLI tool that creates single-file text snapshots of entire Git repositories and feeds them directly into LLM context windows. Instead of letting AI agents guess which files to read, eckSnapshot force-feeds the complete project into the model's context — giving it a "university degree" in your codebase from the very first prompt.

It also serves as the coordination hub for multi-agent AI coding workflows: generating role-specific instructions (`CLAUDE.md`, `AGENTS.md`), maintaining project manifests (`.eck/` directory), and providing MCP integration for automatic context sync after every code change.

> **Want to see it in action?** This project snapshots itself.
> [**Download ecksnapshot-context.md**](https://github.com/xelth-com/eckSnapshot/releases/download/v6.2.3/ecksnapshot-context.md) (364 KB), drop it into [Gemini](https://gemini.google.com/), ChatGPT, or any LLM with a large context window — and ask anything in your language — the AI will answer you natively while keeping code-level discussions in English. It becomes a Senior Architect who built this tool.

---

## 📦 Installation

```bash
npm install -g @xelth/eck-snapshot
```

---

## 🎯 The Battle-Tested Workflow

### 1. Initial Context (Full Snapshot)
Take a full snapshot and feed it to a powerful **Web LLM** — the **Senior Architect**.

```bash
eck-snapshot
```

The generated `.md` file goes into the chat of your chosen Architect model. The Architect analyzes the full codebase and produces a detailed technical plan.

*(For massive monorepos, slice the context using profiles: `eck-snapshot '{"name": "eck_snapshot", "arguments": {"profile": "frontend"}}'`)*

### 2. Direct Execution
Pass the Architect's technical plan to your local **Coder agent** (Claude Code / OpenCode / Codex). The Coder implements the changes directly in your repository.

### 3. Auto-Updates
When the Coder agent finishes a task, it automatically calls the built-in MCP tool (`eck_finish_task`), which commits the code and generates an incremental delta update snapshot. Feed that update back to the Architect to keep it in sync.

> **Custom base:** Use `eck-snapshot update --base <snapshot.md>` to generate a delta relative to any past snapshot file. Pass the filename (e.g. `eckRepo26-04-01_f2e1bd4_up1_29kb.md`) — the anchor hash is extracted automatically. This doesn't disturb the automatic sequence counter — custom-base snapshots get a `_upcustom` suffix. A raw git hash (7+ hex chars) also works.

---

## 🧠 Which Models to Use

### Senior Architect (Web LLM — reads the snapshot)

The Architect needs a **massive context window** and strong reasoning to digest the full codebase snapshot:

| Model | Context Window | Notes |
|-------|---------------|-------|
| **Grok 4 Fast** | **2M tokens** | Largest context available. Can swallow even the biggest monorepos whole. |
| **Gemini 3.1 Pro** | 1M tokens | Excellent for large projects. Handles huge snapshots effortlessly. *(Author's choice)* |
| **ChatGPT (GPT-5.4 via web)** | 1M tokens | Works, but can be stubborn with instructions. You **MUST** paste the specific prompt provided at the end of the snapshot output as your first message — otherwise ChatGPT will act as a generic code reviewer instead of assuming the Architect role. |

### Coder Agent (Local — executes the plan)

The Coder needs **tool access** (file editing, terminal, MCP) and works locally in your repository:

| Tool | Engine | Best For |
|------|--------|----------|
| **Claude Code** | Claude Sonnet/Opus 4.6 (1M context) | Primary choice. Deep tool integration, native MCP support, context compaction for long sessions. |
| **OpenCode** | GLM-4.7 / any model | Cost-effective alternative. AGENTS.md support, GLM Z.AI worker swarm via MCP. |
| **Codex CLI** | GPT models | OpenAI's coding agent. Auto-configured via `.codex/config.toml`. |

### MCP Setup (One-Time)
Register the MCP servers so your Coder agent can auto-commit and sync context:
```bash
eck-snapshot setup-mcp
```

---

## 🤖 The AI-Native JSON Interface (New in v6.1)

`eck-snapshot` is a **100% pure JSON/MCP bridge**. AI agents interact with the CLI by passing a single JSON payload:

```bash
eck-snapshot '{"name": "eck_snapshot", "arguments": {"profile": "backend", "jas": true}}'
eck-snapshot '{"name": "eck_update"}'
```

### 🧑‍💻 Human Shorthands (Ranked by Usage)
For humans typing in the terminal, short commands work too:

| # | Command | Description |
|---|---------|-------------|
| 1 | `eck-snapshot snapshot` | Full project snapshot |
| 2 | `eck-snapshot update` | Delta update (changed files only). Supports `--base <snapshot.md>` to compare against an old snapshot file. |
| 3 | `eck-snapshot profile [name]` | Snapshot filtered by profile (no arg = list profiles) |
| 4 | `eck-snapshot scout [0-9]` | Scout external repo (see depth scale below) |
| 5 | `eck-snapshot fetch "src/**/*.rs"` | Fetch specific files by glob |
| 6 | `eck-snapshot link [0-9]` | Linked companion snapshot |
| 7 | `eck-snapshot booklm` | Export for NotebookLM — Scout mode (see below) |
| 8 | `eck-snapshot notelm` | Export for NotebookLM — Architect mode (see below) |
| 9 | `eck-snapshot setup-mcp` | Configure MCP servers |
| 10 | `eck-snapshot detect` | Detect project type and active filters |
| 11 | `eck-snapshot doctor` | Check project health and stubs |

Running `eck-snapshot` with no arguments defaults to a full snapshot.

### ✉️ Feedback & Telemetry
```bash
eck-snapshot -e "Great tool, but scout could be faster"   # Normal feedback
eck-snapshot -E "Crash on Windows when path has spaces"   # Urgent bug report
eck-snapshot telemetry disable                             # Opt out completely
eck-snapshot telemetry enable                              # Opt back in
eck-snapshot telemetry                                     # Check current status
```

Feedback is saved locally to `.eck/telemetry_queue.json` and will be sent to developers during the next telemetry sync.

#### 🔒 Datenschutz / Privacy
By default, eck-snapshot collects **anonymous usage counts** and **crash logs** to improve the tool. **NO source code or sensitive data is ever sent.** Each CLI instance is identified by a random UUID stored in `~/.eck/cli-config.json`. You can completely disable telemetry at any time with `eck-snapshot telemetry disable`.

---

## 🔗 Cross-Context: Scouts & Links (Working with External Projects)

When your AI is working on **Project A** but needs awareness of **Project B** (a shared backend, a component library, a microservice), feeding it a standard snapshot of Project B will cause "context pollution" — the AI forgets which project it's supposed to edit.

eckSnapshot solves this with two complementary tools that share a **unified depth scale (0-9)** for controlling how much content is included:

### `scout` — Quick Exploration (read-only)
Run inside the external repository:
```bash
cd ../project-b
eck-snapshot scout        # depth 0: tree only (fast overview)
eck-snapshot scout 3      # depth 3: tree + 60 lines per file
eck-snapshot scout 5      # depth 5: tree + function signatures
```
*Result:* Generates `.eck/scouts/scout_tree_...md` — a directory tree (and optionally file contents) with strict instructions telling the AI **NOT** to edit this code. Feed it to your AI, and it can request specific files via `eck-snapshot fetch "src/**/*.js"`.

### `link` — Deep Cross-Context Snapshot (companion file)
Run inside the companion project:
```bash
cd ../project-b
eck-snapshot link 5       # skeleton: function signatures
eck-snapshot link 9       # full: complete file contents
```
*Result:* Generates a standalone `link_*.md` file saved to `.eck/links/` with a read-only cross-context header. Upload it alongside your main project snapshot. The AI will automatically receive instructions to **not edit** the linked project and will be given `eck_fetch` commands to drill deeper if needed.

### `fetch` — Targeted File Extraction (by glob pattern)
```bash
eck-snapshot fetch "src/core/parser.js" "docs/**/*.md"
```
*Result:* Generates `.eck/scouts/scout_data_...md` containing only the requested file contents, perfectly formatted for reading without losing the primary role.

### Shared Depth Scale (0-9)
Both `scout` and `link` use the same depth scale to control content granularity:

| Depth | Mode | Use Case |
|-------|------|----------|
| **0** | Tree only | "Just show me the folder structure" |
| **1** | Truncated (10 lines) | Imports and file headers only |
| **2** | Truncated (30 lines) | Quick surface scan |
| **3** | Truncated (60 lines) | API surface overview |
| **4** | Truncated (100 lines) | Detailed surface scan |
| **5** | Skeleton | Function/class signatures only (no docs) |
| **6** | Skeleton + docs | Signatures with JSDoc/docstrings preserved |
| **7** | Full (compact) | Full content, truncated at 500 lines per file |
| **8** | Full (standard) | Full content, truncated at 1000 lines per file |
| **9** | Full (unlimited) | Everything, no limits |

---

## 🌟 Core Features

* **🔄 Smart Delta Updates:** Tracks incremental changes via Git anchors. Accurately tracks and reports deleted files to prevent LLM hallucinations.
* **🛡️ Security (SecretScanner):** Automatically redacts API keys and credentials before sending context to LLMs. Features both Regex matching and **Shannon Entropy** analysis.
* **🔌 Native MCP Integration:** Instantly spins up Model Context Protocol (MCP) servers (`eck-core` and `glm-zai`) for Claude Code, OpenCode, and Codex.
* **📁 The `.eck/` Manifest:** Automatically maintains project context files (`CONTEXT.md`, `ROADMAP.md`, `TECH_DEBT.md`). Dynamic scanning — any `.md` file you add to `.eck/` is automatically included in snapshots.
* **☠️ Skeleton Mode:** Uses Tree-sitter and Babel to strip function bodies, drastically reducing token count for huge codebases.
* **📚 NotebookLM Export:** Semantic chunking for Google's NotebookLM with "Brain + Body" architecture (see below).
* **🧠 Multi-Agent Protocol:** Junior Architect delegation system for multi-agent coding workflows (see below).

### 🤖 Autonomous AI Protocols
`eckSnapshot` automatically injects strict behavioral protocols into the AI Architect's prompt (`multiAgent.md`) to ensure high code quality and prevent context degradation:
1. **Context Hygiene Protocol:** The AI actively monitors the directory tree for bloat (logs, DB dumps, binaries). If detected, it autonomously constructs an `.eckignore` file to hide the garbage, saving tokens and context space.
2. **Proactive Tech Debt:** The AI scans for `TODO`, `FIXME`, and `HACK` comments, evaluating them against the actual code. It will autonomously delete obsolete comments, fix quick bugs, or document major issues in `.eck/TECH_DEBT.md`.
3. **The Boy Scout Rule:** Whenever the AI modifies or creates a function, it is forced to write or update its JSDoc/Docstring to explain *why* the code exists, keeping documentation perfectly synced.
4. **Zero-Broken-Windows (Reliability):** Blind commits are strictly forbidden. The AI must run the project's test suite (e.g., `npm test`, `cargo test`) and ensure all tests pass before calling the task completion tool.

---

## 📚 NotebookLM Integration (New in v6.3 — Testing)

> **Status:** Active testing. The core chunking works, prompt tuning is ongoing.

### The Problem
Your project is 2M+ tokens. Your Architect (Gemini/Grok) has a limited context window and costs money per query. You can't afford to feed the full codebase on every question.

### The Solution: Free RAG via NotebookLM
Google's NotebookLM supports up to **50 sources** and uses **RAG** (Retrieval-Augmented Generation) to search across them for free. eckSnapshot splits your codebase into semantically packed chunks that NotebookLM can index and search.

### Architecture: Brain + Body

```
Part 0 (Brain)    — Instructions, .eck/ manifests, full directory tree. No code.
Part 1 (Body)     — Source code chunk (~2.5MB), grouped by directory.
Part 2 (Body)     — Source code chunk (~2.5MB), grouped by directory.
...
Part N (Body)     — Source code chunk (~2.5MB), grouped by directory.
```

Files are packed using a **directory-aware bin packing** algorithm: files from the same folder stay together for better RAG retrieval. The directory tree lives only in Part 0 to avoid duplication across chunks.

### Two Modes

**`booklm` — The Scout (Primary Use Case)**
```bash
eck-snapshot booklm
```
NotebookLM becomes a free "code librarian" for your paid Architect. Ask it: *"I'm working on fiscalization, which files do I need?"* — it analyzes the entire codebase via RAG and returns precise `eck-snapshot fetch` commands:
```bash
cd /path/to/project
eck-snapshot fetch "**/FiscalPrinter.kt" "**/TaxCalculator.kt" "**/receipt_config.json"
```
You run the fetch command locally, get a tiny focused snapshot, and hand *that* to your real Architect. This saves money and context window.

**`notelm` — The Architect (Experimental)**
```bash
eck-snapshot notelm
```
Same chunking, but Part 0 instructs NotebookLM to act as the Senior Architect itself — analyzing architecture, proposing refactoring, designing features. This is experimental and results vary.

### Quick Start
1. Run `eck-snapshot booklm` (or `notelm`) inside your project
2. Upload all generated `part*.md` files as sources in a new NotebookLM project
3. Paste the **Starter Prompt** (printed in your terminal) as your first message
4. Start asking questions

---

## 🧠 Multi-Agent Protocol: Junior Architects (Testing)

> **Status:** Active testing. The delegation protocol works, prompt optimization is ongoing.

### The Concept
For large projects, a single AI can't hold the full context AND write code efficiently. eckSnapshot implements a **Royal Court** hierarchy:

```
Senior Architect (Gemini/Grok — Web LLM, huge context)
    │
    ├── Junior Architect Sonnet (jas) — Claude Code with Sonnet 4.6
    ├── Junior Architect Opus  (jao) — Claude Code with Opus 4.6
    ├── Junior Architect GLM   (jaz) — OpenCode with GLM-4.7
    │       │
    │       └── GLM Z.AI Workers (MCP) — cheap bulk coding
    │
    └── Coder (default) — standard developer mode
```

The Senior Architect reads the full snapshot, plans the work, and delegates tasks via the Eck-Protocol v2. Junior Architects receive filtered snapshots with role-specific `CLAUDE.md` / `AGENTS.md` instructions and execute the plan locally.

### Usage
```bash
eck-snapshot '{"name": "eck_snapshot", "arguments": {"jas": true}}'   # Sonnet mode
eck-snapshot '{"name": "eck_snapshot", "arguments": {"jao": true}}'   # Opus mode
eck-snapshot '{"name": "eck_snapshot", "arguments": {"jaz": true}}'   # GLM/OpenCode mode
```

Each mode generates a snapshot with tailored AI headers and updates the corresponding agent config file (`CLAUDE.md` for jas/jao, `AGENTS.md` for jaz).

---

## 💡 The Philosophy: Why force a full snapshot?

LLMs work like humans who have memorized a textbook. Giving an AI a "file search" tool is like putting a beginner next to a bookshelf — they have to guess what to look for. Forcing a complete project snapshot into the LLM's massive context window is like giving it a university degree in your specific codebase. That is what `eck-snapshot` does.

## Ethical Automation Policy

This project respects the Terms of Service of AI providers. We do not implement browser automation to bypass or spoof web chat interfaces intended for human use. All AI integrations use official APIs.

## License
MIT © xelth-com
<div align="right"><sup>made in Eschborn</sup></div>
