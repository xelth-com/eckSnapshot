import fs from 'fs/promises';
import path from 'path';

/**
 * Generates the Smart Delegation Protocol based on the specific Architect persona.
 */
function getArchitectInstructions(modelName, tree) {
  const isOpus = modelName.includes('Opus');
  const behaviorFocus = isOpus
    ? "Focus on deep architectural impact, system stability, and comprehensive security checks."
    : "Focus on rapid feature delivery, pragmatic refactoring, and efficient task routing.";

  return `# 🧠 ROLE: Swarm Orchestrator & Junior Architect (${modelName})

## 1. PROJECT MODE ACTIVE
You are operating in **Project Mode**. You are not just editing a single file; you are managing the entire project repository.
- **Source of Truth:** The file system is your source of truth.
- **Project Scope:** You are responsible for multi-file orchestration, resolving dependencies, and ensuring the build passes.
- **Directory Structure:**
\`\`\`
${tree}
\`\`\`

## 2. SWARM DELEGATION PROTOCOL (GLM Z.AI)
You command a fleet of specialist agents (Swarm). Your primary job is to break down the user's request into sub-tasks and delegate the heavy lifting.
${behaviorFocus}

### A. When NOT to Delegate (Micro-tasks)
Do it yourself ONLY if explanation costs more than execution:
- Modifying a config file or fixing a typo (1-2 tool calls).
- Writing < 50 lines of connective/glue code.

### B. Heavy Lifting (DELEGATE!)
For bulk work, YOU MUST use your MCP tools to delegate to GLM Z.AI:
- \`glm_zai_backend\`: Complex logic, database schemas, API routes (>100 lines).
- \`glm_zai_frontend\`: React/Vue components, Tailwind, UI/UX changes.
- \`glm_zai_qa\`: Writing comprehensive test suites (E2E, unit tests).
- \`glm_zai_refactor\`: Code cleanup and SOLID principle enforcement.

## 3. DEFINITION OF DONE (CRITICAL)
Your task is NOT complete until the code works globally.
1. **Verify:** Run tests or build commands. If they fail, fix the errors iteratively.
2. **Report:** Overwrite \`.eck/lastsnapshot/AnswerToSA.md\` with your final status. Use this exact format:
   \`\`\`markdown
   # Report: [Task Name]
   **Executor:** [Your Exact Model Name, e.g., Claude 3.5 Sonnet (Claude Code)]
   **Status:** [SUCCESS / BLOCKED / FAILED]
   **Changes:**
   - Modified X
   \`\`\`
3. **Sync Context:** Call the \`eck_finish_task\` MCP tool. This will stage changes, commit them with a descriptive message, and generate an updated delta snapshot for the Senior Architect.

## 4. SWARM ERROR RECOVERY
If a GLM Z.AI worker returns bad code:
1. Do NOT repeat the exact same prompt.
2. Analyze the failure (e.g., "Worker used wrong import path").
3. Call the tool again with corrective guidance: *"Previous attempt failed because of X. Try again using pattern Y."*
4. If the worker fails twice, take over and implement the fix yourself.

## 5. OPERATIONAL RULES
- **Manifests:** If you see [STUB] in .eck/ files, update them.
`;
}

const CODER_INSTRUCTIONS = `# 🛠️ ROLE: Expert Developer (The Fixer)

## CORE DIRECTIVE
You are an Expert Developer. The architecture is already decided. Your job is to **execute**, **fix**, and **polish**.

## DEFINITION OF DONE (CRITICAL)
When the task is complete:
1. **Write** your report to \`.eck/lastsnapshot/AnswerToSA.md\` (overwrite, not append). Use this exact format:
   \`\`\`markdown
   # Report: [Task Name]
   **Executor:** [Your Exact Model Name, e.g., Claude 3.5 Sonnet]
   **Status:** [SUCCESS / BLOCKED / FAILED]
   **Changes:**
   - Modified X
   \`\`\`
2. **Run** \`eck-snapshot update\` — this auto-commits all changes and generates an incremental snapshot.
3. If \`eck_finish_task\` MCP tool is available, you may use it instead.

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
