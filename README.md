
# eck-snapshot

[](https://www.google.com/search?q=https://www.npmjs.com/package/%40xelth/eck-snapshot)
[](https://opensource.org/licenses/MIT)

**`eck-snapshot` is a local-first, AI-powered intelligence platform for your codebase. It transforms any code repository into a sophisticated, queryable database, enabling a new workflow for AI-assisted development called "Vibecoding".**

## The Philosophy: What is Vibecoding?

Modern AI development tools often fail because they operate on a narrow context, forcing the AI to guess and hallucinate. **Vibecoding** is a developer workflow focused on maintaining a creative flow by providing AI agents with a near-perfect, holistic understanding of the entire codebase.

Instead of manually feeding snippets of code to an AI, `eck-snapshot` allows you to ask high-level questions and receive a comprehensive, context-aware "snapshot" that includes all semantically and structurally relevant code. This allows the developer to act as the **Architect**, guiding the project's vision, while the AI acts as a flawless **Executor**.

## Key Features

  - **🧠 Multi-Language Intelligence:** Deeply understands your code using advanced parsers for **JavaScript/TypeScript** (Babel), **Python**, and **Android (Java/Kotlin)** (Tree-sitter).
  - **🗄️ Hybrid Database Backend:** Creates a powerful local knowledge base using **PostgreSQL**, combining:
      - **Vector Search** (`pgvector`) for finding code by semantic meaning.
      - **Graph Database** (`Apache AGE`) for understanding the structural relationships between code.
  - **🔐 Local-First AI:** All AI models for code analysis (summarization) and indexing (embeddings) run **100% locally** on your machine via `Transformers.js`. Your code never leaves your computer.
  - **🤖 Hybrid RAG Search:** A powerful `query` command that combines vector and graph search to produce incredibly rich, context-aware code snapshots for your LLM.
  - **📸 Classic Snapshot Mode:** The original `snapshot` command is still available for creating single-file snapshots of smaller projects.

## How It Works

`eck-snapshot` implements a sophisticated pipeline to analyze and index your code:

`[Codebase] -> [Multi-Language Parsers] -> [Local AI Enrichment (Summaries & Embeddings)] -> [PostgreSQL (Vectors + Graph)] -> [Hybrid RAG Query]`

## Installation

```bash
npm install -g @xelth/eck-snapshot
```

## Setup

`eck-snapshot` uses a powerful local database and AI models. Follow these steps for the initial setup.

### Step 1: Set up PostgreSQL

A running PostgreSQL instance with the `pgvector` and `Apache AGE` extensions is required. The easiest way to get this running is with Docker.

1.  Create a `docker-compose.yml` file in an empty directory:
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
2.  Run `docker-compose up -d` in that directory. This will start your database.

### Step 2: Configure Environment

`eck-snapshot` needs to know how to connect to your database.

1.  Find the `eck-snapshot` installation directory.
2.  Copy the `.env.example` file to a new file named `.env` in that same directory.
3.  Edit the `.env` file with the database credentials you set in `docker-compose.yml`.
    ```dotenv
    # PostgreSQL Connection Details
    DB_HOST=127.0.0.1
    DB_PORT=5432
    DB_USER=myuser
    DB_PASSWORD=mypassword
    DB_DATABASE=eck_snapshot_db
    ```

### Step 3: AI Model Caching

The first time you run the `index` command, `Transformers.js` will automatically download the open-source AI models (several GBs). This is a one-time process; the models will be cached for all future use.

## Usage Workflow

### Step 1: Index Your Project

Navigate to your project's root directory and run the `index` command. This will kick off the full analysis pipeline.

```bash
# This will scan, parse, analyze, and store your entire project in PostgreSQL.
# This may take a long time on the first run.
eck-snapshot index .
```

### Step 2: Query Your Codebase

Once your project is indexed, you can ask questions in natural language.

```bash
# Ask for all code related to user authentication
eck-snapshot query "user authentication logic"

# Ask for code related to scanner functionality, getting more results
eck-snapshot query "scanner functionality" -k 15
```

This will perform the hybrid vector-and-graph search and generate a `rag_snapshot_... .md` file in your current directory, containing all the relevant code needed for your task.

## Command Reference

  - `eck-snapshot index [path]`: Scans and indexes a repository into the PostgreSQL database.
  - `eck-snapshot query "<your query>"`: Performs a hybrid search and generates a context-aware RAG snapshot.
  - `eck-snapshot snapshot [path]`: Creates a classic single-file snapshot of an entire project.
  - `eck-snapshot detect [path]`: Detects the project type and configuration.

For more options on any command, run it with the `--help` flag.

## Contributing

Contributions are welcome\! This project was built with the help of AI and is a testament to a new way of building software. Please feel free to submit a Pull Request or open an issue on our GitHub repository.

## License

This project is licensed under the MIT License. See the [LICENSE](https://www.google.com/search?q=https://github.com/xelth-com/eckSnapshot/blob/main/LICENSE) file for details.