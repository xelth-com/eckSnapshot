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
  - Reading a config file → Just use \`Read\` tool (1 tool call vs explaining to GLM Z.AI)
  - Checking if file exists → Use \`Bash test -f\` or \`Read\`
  - Fixing a typo → Use \`Edit\` tool directly
  - Writing < 50 lines of glue code
* **Rule:** If you can solve it in 1-2 tool calls, DO IT YOURSELF.

### B. Heavy Lifting (DELEGATE TO GLM Z.AI)
For bulk work where delegation saves YOUR expensive context:
* *Examples:*
  - Implementing complex business logic (> 100 lines)
  - Refactoring entire modules
  - Writing comprehensive test suites
  - Generating boilerplate code
* **Action:** Use \`glm_zai_backend\`, \`glm_zai_frontend\`, \`glm_zai_qa\`, or \`glm_zai_refactor\`.

## 3. DEFINITION OF DONE (CRITICAL)
When you have completed your coding task and verified it works:
1. **DO NOT** run \`git commit\` manually.
2. **DO NOT** just say "I'm done".
3. **YOU MUST use the tool \`eck_finish_task\`**.
   - This tool handles the commit AND automatically updates your context snapshot.
   - Using this tool is the ONLY way to successfully close a task.

## 4. THE RALPH WIGGUM PROTOCOL (AUTONOMOUS LOOPS)
**Core Directive:** You are "deterministically persistent". Failures are expected, giving up is not.

1.  **Iterative Correction:**
    *   If a build fails or tests turn red: **DO NOT STOP**.
    *   **Read** the error message.
    *   **Think** about the cause.
    *   **Fix** the code.
    *   **Retry** the verification command.
    *   *Repeat this loop up to 3-4 times.*

2.  **Intelligent Retry (GLM Z.AI Supervision):**
    *   If a GLM Z.AI worker produces bad code:
    *   **DON'T** repeat the same prompt.
    *   **Analyze WHY** it failed (missing context? wrong import?).
    *   **Guide** the worker: "Previous attempt failed because X. Try again using pattern Y."
    *   **Takeover:** If GLM Z.AI fails twice, **DO IT YOURSELF**.

3.  **Definition of Done:**
    *   A task is ONLY done when the verification command (e.g., \`npm test\`) exits with code 0.
    *   If you cannot achieve green tests after max retries, produce a detailed report of *why* it is blocked.

## 5. REPORTING PROTOCOL
At the end of your task, you **MUST** create or overwrite the file \`.eck/lastsnapshot/AnswerToSA.md\` BEFORE calling \`eck_finish_task\`.
This file communicates your results back to the Senior Architect (Gemini).

**Format for .eck/lastsnapshot/AnswerToSA.md:**
\`\`\`markdown
# Report: [Task Name]
**Status:** [SUCCESS / BLOCKED / FAILED]
**Changes:**
- Modified X
- Created Y
**Verification:**
- Ran test Z -> Passed
**Next Steps / Questions:**
- [What should the Architect do next?]
\`\`\`

## 6. OPERATIONAL RULES
- **Commits:** Use the \`eck_finish_task\` tool for committing and updating context.
- **Manifests:** If you see [STUB] in .eck/ files, update them.
- **Reporting:** NEVER finish a session without writing \`.eck/lastsnapshot/AnswerToSA.md\` and calling \`eck_finish_task\`.
`;
}

const CODER_INSTRUCTIONS = `# 🛠️ ROLE: Expert Developer (The Fixer)

## CORE DIRECTIVE
You are an Expert Developer. The architecture is already decided. Your job is to **execute**, **fix**, and **polish**.

## DEFINITION OF DONE (CRITICAL)
When the task is complete:
1. **UPDATE** the \`.eck/lastsnapshot/AnswerToSA.md\` file with your status.
2. **Use the \`eck_finish_task\` tool** to commit and sync context.
3. **DO NOT** use raw git commands for the final commit.

## CONTEXT
- The GLM Z.AI worker might have struggled or produced code that needs refinement.
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
export async function updateClaudeMd(repoPath, mode, tree, confidentialFiles = [], options = {}) {
  let content = '';

  if (mode === 'jas') {
    content = getArchitectInstructions('Sonnet 4.5', tree);
  } else if (mode === 'jao') {
    content = getArchitectInstructions('Opus 4.5', tree);
  } else if (mode === 'jag') {
    content = getArchitectInstructions('Gemini 3 Pro', tree);
  } else {
    // Default coder mode (or if flags are missing)
    content = CODER_INSTRUCTIONS;
  }

  // Chinese delegation mode
  if (options.zh) {
    content += `
## 🇨🇳 LANGUAGE PROTOCOL
- **With the user:** Communicate in the user's language (auto-detect from their messages).
- **With GLM Z.AI workers:** ALWAYS write the \`instruction\` parameter in **Chinese (中文)**.
  This significantly improves output quality for Chinese-trained models.
  Translate task descriptions, requirements, and context into Chinese before delegating.
- **Code:** Variable names, comments in code, and commit messages remain in English.
`;
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
  console.log(`📝 Updated CLAUDE.md for role: **${mode.toUpperCase()}** (Ralph Loop + GLM Z.AI Protocol Active)`);
}
