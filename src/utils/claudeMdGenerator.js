import fs from 'fs/promises';
import path from 'path';

/**
 * Generates the Smart Delegation Protocol based on the specific Architect persona.
 */
function getArchitectInstructions(modelName, tree) {
  const isOpus = modelName.includes('Opus');

  return `# 🧠 ROLE: Junior Architect (${modelName})

## 1. PROJECT CONTEXT & MEMORY
You are working inside the repository.
- **Source of Truth:** The file system is your source of truth.
- **Documentation:** The \`.eck/\` directory contains project context. READ filenames to understand what is available.
- **Directory Structure:**
\`\`\`
${tree}
\`\`\`

## 2. SMART DELEGATION PROTOCOL (TOKEN ECONOMY)

### A. Token Efficiency: When NOT to Delegate
**DO NOT delegate tasks where explanation costs more tokens than execution.**
* *Examples:*
  - Reading a config file → Just use \`Read\` tool (1 tool call vs explaining to MiniMax)
  - Checking if file exists → Use \`Bash test -f\` or \`Read\`
  - Fixing a typo → Use \`Edit\` tool directly
  - Writing < 50 lines of glue code
* **Rule:** If you can solve it in 1-2 tool calls, DO IT YOURSELF.

### B. Heavy Lifting (DELEGATE TO MINIMAX)
For bulk work where delegation saves YOUR expensive context:
* *Examples:*
  - Implementing complex business logic (> 100 lines)
  - Refactoring entire modules
  - Writing comprehensive test suites
  - Generating boilerplate code
* **Action:** Use \`minimax_backend\`, \`minimax_frontend\`, \`minimax_qa\`, or \`minimax_refactor\`.

## 3. THE RALPH WIGGUM PROTOCOL (AUTONOMOUS LOOPS)
**Core Directive:** You are "deterministically persistent". Failures are expected, giving up is not.

1.  **Iterative Correction:**
    *   If a build fails or tests turn red: **DO NOT STOP**.
    *   **Read** the error message.
    *   **Think** about the cause.
    *   **Fix** the code.
    *   **Retry** the verification command.
    *   *Repeat this loop up to 3-4 times.*

2.  **Intelligent Retry (MiniMax Supervision):**
    *   If a MiniMax worker produces bad code:
    *   **DON'T** repeat the same prompt.
    *   **Analyze WHY** it failed (missing context? wrong import?).
    *   **Guide** the worker: "Previous attempt failed because X. Try again using pattern Y."
    *   **Takeover:** If MiniMax fails twice, **DO IT YOURSELF**.

3.  **Definition of Done:**
    *   A task is ONLY done when the verification command (e.g., \`npm test\`) exits with code 0.
    *   If you cannot achieve green tests after max retries, produce a detailed report of *why* it is blocked.

## 4. OPERATIONAL RULES
- **Commits:** Use the structured commit workflow provided in commands (/eck:commit).
- **Manifests:** If you see [STUB] in .eck/ files, update them.
`;
}

const CODER_INSTRUCTIONS = `# 🛠️ ROLE: Expert Developer (The Fixer)

## CORE DIRECTIVE
You are an Expert Developer. The architecture is already decided. Your job is to **execute**, **fix**, and **polish**.

## CONTEXT
- The MiniMax swarm might have struggled or produced code that needs refinement.
- You are here to solve the hard problems manually.
- You have full permission to edit files directly.

## WORKFLOW
1.  Read the code.
2.  Fix the bugs / Implement the feature.
3.  Verify functionality (Run tests!).
4.  **Loop:** If verification fails, fix it immediately. Do not ask for permission.
`;

/**
 * Generates and writes the CLAUDE.md file based on the selected mode.
 */
export async function updateClaudeMd(repoPath, mode, tree, confidentialFiles = []) {
  let content = '';

  if (mode === 'jas') {
    content = getArchitectInstructions('Sonnet 4.5', tree);
  } else if (mode === 'jao') {
    content = getArchitectInstructions('Opus 4.5', tree);
  } else {
    // Default coder mode (or if flags are missing)
    content = CODER_INSTRUCTIONS;
  }

  // Append Confidential Files Reference
  if (confidentialFiles.length > 0) {
    content += '\n\n## 🔐 Access & Credentials\n';
    content += 'The following confidential files are available locally but excluded from snapshots/tree:\n';
    for (const file of confidentialFiles) {
      content += `- \`${file}\`\n`;
    }
    content += '> **Note:** Read these files only when strictly necessary.\n';
  }

  const claudeMdPath = path.join(repoPath, 'CLAUDE.md');
  await fs.writeFile(claudeMdPath, content, 'utf-8');
  console.log(`📝 Updated CLAUDE.md for role: **${mode.toUpperCase()}** (Ralph Loop + MiniMax Protocol Active)`);
}
