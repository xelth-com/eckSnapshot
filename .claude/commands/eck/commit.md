---
allowed-tools: Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(echo:*), Bash(cat:*), Bash(mv:*)
description: Commits staged changes with structured journaling.
args:
  - name: type
    description: "The type of change (feat, fix, refactor, docs, chore)"
  - name: scope
    description: "The scope of the change (e.g., workflow, ui, api)"
  - name: summary
    description: "A short summary of the change"
  - name: details
    description: "A detailed description for the journal"
---

## Your Task

Based on the provided arguments, you must perform the following steps precisely:

1.  **Stage all current changes** to ensure they are included in the commit.
2.  **Create a YAML Frontmatter block** for the journal entry. It must be in the following format:
    ```yaml
    ---
    task_id: {unique-task-id-from-context}
    date: {current-iso-date}
    type: {arg1}
    scope: {arg2}
    --- 
    ```
3.  **Create a Markdown body** for the journal entry with the summary as a heading and details below it.
4.  **Prepend the complete journal entry** (YAML and Markdown) to the `.eck/JOURNAL.md` file. Do not overwrite the file.
5.  **Create a conventional commit message** in the format: `{arg1}({arg2}): {arg3}`.
6.  **Execute the commit** with the generated message.

Execute these steps using Bash tools. Do not send any other text or messages besides the necessary tool calls.