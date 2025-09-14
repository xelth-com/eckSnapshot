---
task_id: create-eck-commit-command-v1
date: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
type: feat
scope: workflow
---

## Create custom /eck:commit claude-code command

Added a custom slash command to automate the new structured journaling and conventional commit process. This command takes structured input (type, scope, summary, details) and uses it to update JOURNAL.md and create a git commit, enforcing our new workflow.


# Development Journal

## Recent Changes
Track significant changes, decisions, and progress here.

---

### YYYY-MM-DD - Project Started
- Initial project setup
- Added basic structure
