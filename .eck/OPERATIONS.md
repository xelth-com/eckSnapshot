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

## 4. Advanced Autonomous Protocols

### 4.1 Token Economy (Smart Delegation Protocol)

**Core Principle:** Optimize token usage by delegating appropriately.

#### When NOT to Delegate
**DO NOT delegate tasks where explanation costs more tokens than execution.**

Examples:
- Reading a config file → Use `Read` tool directly
- Checking if file exists → Use `Bash test -f` or `Read`
- Fixing a typo → Use `Edit` tool directly
- Writing < 50 lines of glue code

**Rule:** If you can solve it in 1-2 tool calls, DO IT YOURSELF.

#### When to Delegate to MiniMax
For bulk work where delegation saves expensive context:

Examples:
- Implementing complex business logic (> 100 lines)
- Refactoring entire modules
- Writing comprehensive test suites
- Generating boilerplate code

**Action:** Use `minimax_backend`, `minimax_frontend`, `minimax_qa`, or `minimax_refactor`.

### 4.2 The Ralph Wiggum Protocol (Deterministic Persistence)

**Core Directive:** You are "deterministically persistent". Failures are expected, giving up is not.

#### 1. Iterative Correction Loop
- If a build fails or tests turn red: **DO NOT STOP**
- **Read** the error message
- **Think** about the cause
- **Fix** the code
- **Retry** the verification command
- **Repeat** this loop up to 3-4 times

#### 2. Intelligent Retry (MiniMax Supervision)
If a MiniMax worker produces bad code:
- **DON'T** repeat the same prompt
- **Analyze WHY** it failed (missing context? wrong import?)
- **Guide** the worker: "Previous attempt failed because X. Try again using pattern Y."
- **Takeover:** If MiniMax fails twice, **DO IT YOURSELF**

#### 3. Definition of Done
- A task is ONLY done when the verification command (e.g., `npm test`) exits with code 0
- If you cannot achieve green tests after max retries, produce a detailed report of *why* it is blocked

### 4.3 Feedback Loop (Reporting Protocol)

**CRITICAL:** At the end of your task, you **MUST** create or overwrite the file `.eck/AnswerToSA.md`.

This file communicates results back to the Senior Architect (Gemini).

#### Required Format
```markdown
# Report: [Task Name]
**Status:** [SUCCESS / BLOCKED / FAILED]
**Changes:**
- Modified X
- Created Y
**Verification:**
- Ran test Z -> Passed
**Next Steps / Questions:**
- [What should the Architect do next?]
```

#### Operational Rules
- **Commits:** Use the structured commit workflow provided in commands (/eck:commit)
- **Manifests:** If you see [STUB] in .eck/ files, update them
- **Reporting:** NEVER finish a session without writing `.eck/AnswerToSA.md`
