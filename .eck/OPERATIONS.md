# Common Operations

## Development Setup
```bash
npm install
```

## Running the Project
```bash
# Create a standard snapshot
node index.js snapshot

# Create a skeleton snapshot (compressed)
node index.js --skeleton

# Update snapshot (incremental)
node index.js update
```

## Royal Court Architecture Snapshots
```bash
# JAG: Full snapshot for Junior Architect Gemini (Gemini 3 Pro)
# Use for: Massive context tasks (>50 files changes)
node index.js --jag

# JAS: Configure for Junior Architect Sonnet (Sonnet 4.5)
# Use for: Standard features, refactoring
# Output: Updates CLAUDE.md with Smart Delegation Protocol + Directory Tree
node index.js --jas

# JAO: Configure for Junior Architect Opus (Opus 4.5)
# Use for: Critical architecture, security, complex logic
# Output: Updates CLAUDE.md with Enhanced verification rules + Directory Tree
node index.js --jao
```

## Testing
```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui
```

## Documentation
```bash
# Auto-generate command reference
npm run docs:auto
```

## Browser Automation & E2E Testing

**Status:** Active & Verified (Chrome MCP)

This project supports browser automation via the `local_dev` agent. This allows for:
- End-to-End (E2E) testing
- Visual regression checks
- DOM inspection and data extraction

### ⚠️ Critical Usage Protocol
**Direct Execution Only:** Browser tasks MUST be delegated directly to the interactive agent.
- **DO NOT** use: `eck-snapshot ask-claude "Navigate to..."` (Subprocess lacks MCP context)
- **DO USE**: Natural language instructions in the agent session (e.g., "Please use your browser tool to test the login flow...")

### Example Task
```json
{
  "objective": "Verify login page UI",
  "instructions": "Navigate to http://localhost:3000/login. Take a screenshot. Verify that the 'Submit' button is visible."
}
```
