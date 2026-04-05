# 📸 eckSnapshot v6.4.5 (AI-Native Edition)

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
| 7 | `eck-snapshot notebook` | NotebookLM: Primary project (Hybrid mode) |
| 7a | `eck-snapshot notebook link 5` | NotebookLM: Linked project (chunked, depth-controlled) |
| 7b | `eck-snapshot notebook scout 3` | NotebookLM: Scouted project (chunked, read-only) |
| 8 | `eck-snapshot booklm` | NotebookLM: Scout mode (fetch generator) |
| 9 | `eck-snapshot notelm` | NotebookLM: Architect mode (experimental) |
| 10 | `eck-snapshot setup-mcp` | Configure MCP servers |
| 10 | `eck-snapshot detect` | Detect project type and active filters |
| 11 | `eck-snapshot doctor` | Check project health and stubs |
| 12 | `eck-snapshot telemetry` | Check telemetry status (also: `enable` / `disable`) |

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
* **🔌 Native MCP Integration:** Instantly spins up Model Context Protocol (MCP) servers (`eck-core` and `glm-zai`) for Claude Code, OpenCode, and Codex. Includes `eck_manifest_edit` for atomic `.eck/` file editing without loading full files into context.
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

## 📚 NotebookLM Integration

Google's NotebookLM provides **free RAG** (Retrieval-Augmented Generation) over up to **50 sources**, making it a perfect companion for your paid Architect LLM. Instead of feeding your entire codebase into Gemini or Grok on every question, you let NotebookLM index it and answer targeted queries.

eckSnapshot exports your repository as semantically packed chunks using a **Brain + Body** architecture:

```
Part 0 (Brain)    — Project metadata, .eck/ manifests, full directory tree. No code.
Part 1 (Body)     — Source code chunk (~2.5MB), grouped by directory.
Part 2 (Body)     — Source code chunk (~2.5MB), grouped by directory.
...
Part N (Body)     — Source code chunk (~2.5MB), grouped by directory.
```

Files from the same directory stay together for better RAG retrieval. The directory tree lives only in Part 0 to avoid wasting tokens across chunks.

### System Prompts

NotebookLM now supports **Custom Instructions** (system prompts) with a 10,000-character limit. eckSnapshot prints a tailored system prompt to your terminal after every export — copy it into NotebookLM's `Chat konfigurieren → Benutzerdefiniert` field. The Brain file no longer embeds role instructions, so the AI won't "forget" them.

### Three Modes

**`notebook` — Hybrid (Primary Project)**
```bash
eck-snapshot notebook
```
The main export for your primary repository. The system prompt instructs NotebookLM to act as a Senior Architect managing a multi-repo ecosystem, distinguishing between Primary sources (editable), Linked sources (cross-project companions), and Scouted sources (read-only reference).

**`booklm` — Scout (Fetch Generator)**
```bash
eck-snapshot booklm
```
NotebookLM becomes a free "code librarian". Ask *"I'm working on fiscalization, which files do I need?"* — it analyzes the codebase via RAG and returns precise fetch commands:
```bash
cd /path/to/project
eck-snapshot fetch "**/FiscalPrinter.kt" "**/TaxCalculator.kt"
```

**`notelm` — Architect (Experimental)**
```bash
eck-snapshot notelm
```
NotebookLM acts as the Senior Architect itself — analyzing architecture, proposing refactoring, designing features.

### Chunked Links & Scouts

Secondary projects (linked companions or external repositories you're scouting) can also be chunked and uploaded to the same NotebookLM project:

```bash
eck-snapshot notebook link 5    # Linked project: skeleton depth, modifiable
eck-snapshot notebook scout 3   # Scouted project: truncated, read-only
```

The depth scale (0–9) from the `scout`/`link` commands applies — depth 0 produces a brain-only export (tree + manifests, no code), depth 5 skeletonizes, depth 9 includes everything. Each secondary project's Part 0 header explicitly labels its role so the AI knows whether it can modify the code or must treat it as read-only reference.

### Quick Start
1. Run `eck-snapshot notebook` inside your primary project
2. Copy the system prompt printed in your terminal into NotebookLM's Custom Instructions
3. Upload all generated `part*.md` files as sources
4. (Optional) Run `eck-snapshot notebook link 5` / `notebook scout 3` for secondary projects and upload those too
5. Start asking questions

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
