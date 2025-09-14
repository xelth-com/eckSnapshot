# Claude Code Autonomous Setup

To enable fully autonomous operation of the `claude-code` agent without requiring manual confirmation for file edits or commands, you must configure its global settings.

## Procedure

1.  **Locate the configuration directory:** This is typically `~/.claude/` in your home directory.

2.  **Create or edit the settings file:** Inside this directory, create a file named `settings.json`.

3.  **Add the following content:**

    ```json
    {
      "permissions": {
        "defaultMode": "acceptEdits"
      }
    }
    ```

This setting instructs `claude-code` to automatically accept all proposed actions, streamlining the development workflow.