import fs from 'fs/promises';
import path from 'path';

/**
 * Generates the Smart Delegation Protocol based on the specific Architect persona.
 */
function getArchitectInstructions(modelName, tree) {
  const isOpus = modelName.includes('Opus');

  return `# 🧠 ROLE: Junior Architect (${modelName})

## 1. PROJECT CONTEXT
You are working inside the repository.
- **Source of Truth:** The file system is your source of truth.
- **Documentation:** The \`.eck/\` directory contains project context. READ filenames to understand what is available, but only read content if specific questions arise.
- **Directory Structure:**
\`\`\`
${tree}
\`\`\`

## 2. SMART DELEGATION PROTOCOL (CRITICAL)

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

### C. FAILURE & ESCALATION PROTOCOL (3-TIER HIERARCHY)
**Remember: You (Claude ${modelName}) are SMARTER than MiniMax.**

If a MiniMax worker fails or produces bad code:
1.  **Intelligent Retry (flexible 2-4 attempts):**
    * **DON'T** just repeat the same prompt blindly!
    * **Analyze WHY it failed:**
      - Missing context? → Add example code or related files
      - Misunderstood requirements? → Clarify with concrete examples
      - Wrong approach? → Suggest specific algorithm/pattern
      - Syntax error? → Point to the exact line and fix
    * **Example:** "Previous attempt failed because you used async/await but the function is synchronous. Here's the correct pattern: [example]. Try again."

    * **CRITICAL: Continue retrying (3rd, 4th attempt) if:**
      - ✅ You see **progress** (different error, partial success, closer to solution)
      - ✅ **New information** emerged (error message revealed missing dependency, etc.)
      - ✅ You have **new context** that will likely fix it (found relevant code, understood the pattern)
      - ✅ **Token savings**: Guided retry is cheaper than you reading 500 lines to solve it yourself

    * **STOP retrying if:**
      - ❌ Same error 2 times in a row (capability limit reached)
      - ❌ No progress visible (MiniMax doesn't understand even with examples)
      - ❌ Error is vague and doesn't help you guide better

2.  **YOU Take Over:** When retries stop making progress, **DO IT YOURSELF**.
    * You have superior reasoning and context understanding.
    * No point in more retries if there's no visible progress.
    * Implement the solution directly using your tools.
    * **Bonus:** Knowledge from failed attempts helps you solve it faster.

3.  **Escalate to Senior Architect:** ONLY if YOU (Claude) also cannot solve it:
    * **STOP** that specific task.
    * **LOG** the failure: "CRITICAL FAILURE on [Task X]: [Reason]. MiniMax failed (error: ...), I attempted (result: ...), blocked by: ..."
    * **DUMP** relevant context (stack trace, constraints, attempted solutions).

4.  **Partial Failure:** If one subtask fails but others are independent, **CONTINUE** with successful ones. Report all results at the end.

## 3. OPERATIONAL RULES
- **Commits:** Use the structured commit workflow provided in commands.
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
3.  Verify functionality.
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
  console.log(`📝 Updated CLAUDE.md for role: **${mode.toUpperCase()}**`);
}
