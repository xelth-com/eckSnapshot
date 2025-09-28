# eck-snapshot

**`eck-snapshot` is a local-first, AI-powered intelligence platform for your codebase. It transforms any code repository into a sophisticated, queryable database, enabling a new workflow for AI-assisted development called "Vibecoding".**

## The Philosophy: What is Vibecoding?

This workflow is focused on providing AI agents with a near-perfect, holistic understanding of the entire codebase. This allows the developer to act as the **Senior Architect**, guiding the project's vision, while a hierarchy of AI agents act as flawless **Executors**.

## Key Features

* **🧠 Multi-Language Intelligence:** Deeply understands your code using advanced parsers for **JavaScript/TypeScript** (Babel), **Python**, and **Android (Java/Kotlin)** (Tree-sitter).
* **🗄️ Hybrid Database Backend:** Creates a powerful local knowledge base using **PostgreSQL**, combining:
    * **Vector Search** (`pgvector`) for finding code by semantic meaning.
    * **Graph Database** (`Apache AGE`) for understanding the structural relationships between code.
* **🤖 Multi-Agent Hierarchy:** A built-in system (defined in `setup.json`) for orchestrating multiple AI agents:
    * **Senior Architect (Gemini):** You, the user, guiding the high-level strategy.
    * **Junior Architect (`gemini_wsl`):** An autonomous agent with a full-code snapshot (`_ja.md`) that analyzes complex tasks.
    * **Coder (`claude`):** A specialized agent that receives precise JSON-based coding instructions from the Junior Architect.
* **📸 Dual Snapshot System:** The `snapshot` command automatically generates two snapshots for small projects: a high-level one for the Architect and a detailed `_ja.md` for the Junior Architect.
* **🔐 Local-First AI:** All AI models for code analysis (summarization) and indexing (embeddings) run **100% locally** on your machine via `Transformers.js`. Your code never leaves your computer.

## How It Works

`eck-snapshot` implements two distinct workflows depending on your project's size.

### Small Projects (Vibecoding Workflow)

1.  **`eck-snapshot snapshot`**: Generates a high-level (`_snapshot.md`) and detailed (`_ja.md`) snapshot.
2.  **Senior Architect (You)** gives a high-level `execute_strategic_task` command to the Junior Architect.
3.  **Junior Architect (`gemini_wsl`)** reads its `_ja.md` snapshot, analyzes the task, and formulates a low-level `apply_code_changes` JSON command.
4.  **Coder (`claude`)** receives the JSON command and executes the code change.

### Large Projects (Vector RAG Workflow)

1.  **`eck-snapshot index`**: Scans, parses, analyzes, and stores your entire project in the PostgreSQL database.
2.  **`eck-snapshot query "task"`**: Performs a hybrid vector-and-graph search and generates a `rag_snapshot_... .md` file, containing only the relevant code for your task.

## Installation & Setup

(This section assumes you have `npm` and `Docker` installed.)

### 1. Install the CLI

```bash
npm install -g @xelth/eck-snapshot
```

### 2. Start the Database

A running PostgreSQL instance with `pgvector` and `Apache AGE` is required. The easiest way is with Docker. Create a `docker-compose.yml`:

```yaml
version: '3.8'
services:
  postgres-db:
    image: ivans-big-data/pg-vector-and-graph:16
    container_name: eck-snapshot-db
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=myuser
      - POSTGRES_PASSWORD=mypassword
      - POSTGRES_DB=eck_snapshot_db
    volumes:
      - ./pg_data:/var/lib/postgresql/data
```

Run `docker-compose up -d`.

### 3. Configure Environment

`eck-snapshot` needs to connect to this database. Copy the `.env.example` file in the package directory to `.env` and fill in the credentials from your `docker-compose.yml`.

## Advanced Usage: Filtering with Profiles

The `--profile` flag is a powerful way to control which files are included in a snapshot. It accepts a comma-separated list of profile names and ad-hoc glob patterns.

### Recommended Workflow

1.  **Detect Available Profiles**: Run `eck-snapshot detect` to see a list of pre-configured profiles (e.g., `backend`, `frontend`, `database`). These are defined in `.eck/profiles.json` or `setup.json`.

2.  **Create a Snapshot**: Use the profile names and combine them with ad-hoc glob patterns for fine-tuned filtering.

### Combining Profiles and Patterns

You can mix and match profile names and glob patterns. Use a `-` prefix to exclude a profile or a pattern.

**Examples:**

* **Use the `backend` profile but exclude all test files:**
    ```bash
    eck-snapshot --profile "backend,-**/tests/**,-**/*.test.js"
    ```

* **Include the `frontend` profile and also all `.md` files from the `docs` directory:**
    ```bash
    eck-snapshot --profile "frontend,docs/**/*.md"
    ```

* **Start with all files, but exclude the `node_modules` directory and all `.log` files (note: `node_modules` is usually ignored by default, this is just an example):**
    ```bash
    eck-snapshot --profile "-node_modules/**,-**/*.log"
    ```

This system provides maximum flexibility, allowing you to use well-defined profiles for common tasks and ad-hoc patterns for specific, one-off snapshots.

## License

This project is licensed under the MIT License.
