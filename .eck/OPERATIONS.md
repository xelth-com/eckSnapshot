# Common Operations

## Development Setup
```bash
# Setup commands
npm install
# or yarn install
```

## Running the Project
```bash
# Development mode
npm run dev

# Production build
npm run build
```

## Testing
```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Deployment
```bash
# Deployment commands
npm run deploy
```

## Troubleshooting
Common issues and their solutions.

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
