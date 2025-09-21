# eckSnapshot - The AI-Powered Project Manager

This program is very suitable for vibecoding if you have subscriptions to Gemini and Claude.

## What is eckSnapshot?

`eckSnapshot` is a CLI tool and framework designed to manage and orchestrate a multi-agent AI development workflow. It acts as a "Senior Architect" (powered by Gemini) that manages a "Junior Architect" (`gemini_wsl`) and a "Coder" (`claude`), using the `eckSnapshot` tool as its interface.

This project is configured to:
* **Manage Agents:** Define and select from multiple AI agents (`local_dev`, `gemini_wsl`, `gemini_windows`, etc.) with different capabilities, all configured in `setup.json`.
* **Generate Dual Snapshots:** Automatically create two types of project snapshots for "small projects":
    1.  A high-level `_snapshot.md` for the Senior Architect.
    2.  A detailed, full-code `_snapshot_ja.md` for the Junior Architect.
* **Use Vector Search:** For large projects, it uses a vector index (`eck-snapshot index`) to generate on-demand, relevant snapshots (`eck-snapshot query`).
* **Maintain Project History:** All changes are logged via a structured `journal_entry` system, creating a machine-readable project history in `.eck/JOURNAL.md`.

## The Agent Hierarchy

This tool is built to facilitate a specific, powerful AI hierarchy:

1.  **Senior Architect (You/Gemini):** You receive high-level snapshots and tasks. You create strategic plans and delegate to the Junior Architect using the `execute_strategic_task` command.
2.  **Junior Architect (`gemini_wsl`):** This agent (defined in `setup.json`) receives high-level tasks. It uses its dedicated `_ja.md` snapshot to perform deep analysis and breaks the task into small pieces.
3.  **Coder (`claude`):** This agent receives small, precise `apply_code_changes` commands from the Junior Architect to write high-quality, focused code.

## Core Commands

* `eck-snapshot snapshot`: Create the dual snapshots for the project.
* `eck-snapshot index`: (For large projects) Index the entire codebase for vector search.
* `eck-snapshot query "<task>"`: (For large projects) Generate a relevant snapshot based on a task query.