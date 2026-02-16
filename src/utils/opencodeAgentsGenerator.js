import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { updateClaudeMd } from './claudeMdGenerator.js';

/**
 * Generates AGENTS.md for OpenCode integration
 * @param {string} repoPath - Path to the repository
 * @param {string} mode - Mode (jas, jao, jag, coder)
 * @param {string} tree - Directory tree string
 * @param {string[]} confidentialFiles - Array of confidential file paths
 */
export async function generateOpenCodeAgents(repoPath, mode, tree, confidentialFiles = [], options = {}) {
  let frontmatter = {};
  let body = '';

  // Determine agent type based on mode
  if (mode === 'jas') {
    frontmatter = {
      mode: 'primary',
      description: 'Smart delegator with GLM ZAI swarm access (Sonnet 4.5)',
      model: 'opencode/claude-3-5-sonnet',
      steps: 10,
      tools: {
        'glm-zai:glm_zai_backend': true,
        'glm-zai:glm_zai_frontend': true,
        'glm-zai:glm_zai_qa': true,
        'glm-zai:glm_zai_refactor': true,
        'glm-zai:glm_zai_general': true,
        'eck-core:eck_finish_task': true
      },
      permission: {
        read: 'allow',
        edit: 'allow',
        bash: 'allow',
        '*': 'allow'
      },
      color: '#38A3EE'
    };

    // Read and adapt junior-architect template
    const templatePath = path.join(repoPath, '..', '..', 'src', 'templates', 'opencode', 'junior-architect.template.md');
    try {
      let templateContent = await fs.readFile(templatePath, 'utf-8');
      // Replace {{tree}} placeholder with actual tree
      templateContent = templateContent.replace('{{tree}}', tree);
      body = templateContent;
    } catch (error) {
      // Fallback to architect instructions from claudeMdGenerator
      body = getArchitectInstructions('Sonnet 4.5', tree);
    }

  } else if (mode === 'jao') {
    frontmatter = {
      mode: 'primary',
      description: 'Deep thinker with GLM ZAI swarm access (Opus 4.5)',
      model: 'opencode/claude-3-5-opus',
      steps: 10,
      tools: {
        'glm-zai:glm_zai_backend': true,
        'glm-zai:glm_zai_frontend': true,
        'glm-zai:glm_zai_qa': true,
        'glm-zai:glm_zai_refactor': true,
        'glm-zai:glm_zai_general': true,
        'eck-core:eck_finish_task': true
      },
      permission: {
        read: 'allow',
        edit: 'allow',
        bash: 'allow',
        '*': 'allow'
      },
      color: '#FF5733'
    };

    body = getArchitectInstructions('Opus 4.5', tree);

  } else if (mode === 'jag') {
    frontmatter = {
      mode: 'primary',
      description: 'Massive context handler with GLM ZAI swarm access (Gemini 3 Pro)',
      model: 'opencode/claude-3-5-opus',
      steps: 15,
      tools: {
        'glm-zai:glm_zai_backend': true,
        'glm-zai:glm_zai_frontend': true,
        'glm-zai:glm_zai_qa': true,
        'glm-zai:glm_zai_refactor': true,
        'glm-zai:glm_zai_general': true,
        'eck-core:eck_finish_task': true
      },
      permission: {
        read: 'allow',
        edit: 'allow',
        bash: 'allow',
        '*': 'allow'
      },
      color: '#9C27B0'
    };

    body = getArchitectInstructions('Gemini 3 Pro', tree);

  } else {
    // Default coder mode
    frontmatter = {
      mode: 'primary',
      description: 'Expert developer - executes and fixes',
      model: 'opencode/claude-3-5-sonnet',
      steps: 5,
      tools: {
        'eck-core:eck_finish_task': true
      },
      permission: {
        read: 'allow',
        edit: 'allow',
        bash: 'allow',
        '*': 'allow'
      },
      color: '#44BA81'
    };

    // Read coder template
    const templatePath = path.join(repoPath, '..', '..', 'src', 'templates', 'opencode', 'coder.template.md');
    try {
      body = await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      // Fallback to coder instructions from claudeMdGenerator
      body = CODER_INSTRUCTIONS;
    }
  }

  // Append confidential files reference
  if (confidentialFiles.length > 0) {
    body += '\n\n## 🔐 Access & Credentials\n';
    body += 'The following confidential files are available locally but excluded from snapshots/tree:\n';
    for (const file of confidentialFiles) {
      body += `- \`${file}\`\n`;
    }
    body += '> **Note:** Read these files only when strictly necessary.\n';
  }

  // Chinese delegation mode
  if (options.zh) {
    body += `

## 🇨🇳 LANGUAGE PROTOCOL
- **With the user:** Communicate in the user's language (auto-detect from their messages).
- **With GLM Z.AI workers:** ALWAYS write the \`instruction\` parameter in **Chinese (中文)**.
  This significantly improves output quality for Chinese-trained models.
  Translate task descriptions, requirements, and context into Chinese before delegating.
- **Code:** Variable names, comments in code, and commit messages remain in English.
`;
  }

  // Generate final content with YAML frontmatter
  const frontmatterStr = yaml.dump(frontmatter, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"'
  });

  const content = `---\n${frontmatterStr}---\n\n${body}`;

  // Write AGENTS.md to project root (not .eck/ directory)
  const agentsPath = path.join(repoPath, 'AGENTS.md');
  await fs.writeFile(agentsPath, content, 'utf-8');

  console.log(`📝 Generated OpenCode agents: ${agentsPath}`);
}

/**
 * Gets architect instructions (reused from claudeMdGenerator.js)
 * This is a simplified version for AGENTS.md generation
 */
function getArchitectInstructions(modelName, tree) {
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
  - Reading a config file → Just use \`Read\` tool (1 tool call vs explaining to GLM ZAI)
  - Checking if file exists → Use \`Bash test -f\` or \`Read\`
  - Fixing a typo → Use \`Edit\` tool directly
  - Writing < 50 lines of glue code
* **Rule:** If you can solve it in 1-2 tool calls, DO IT YOURSELF.

### B. Heavy Lifting (DELEGATE TO GLM ZAI)
For bulk work where delegation saves YOUR expensive context:
* *Examples:*
  - Implementing complex business logic (> 100 lines)
  - Refactoring entire modules
  - Writing comprehensive test suites
  - Generating boilerplate code
* **Action:** Use \`glm_zai_backend\`, \`glm_zai_frontend\`, \`glm_zai_qa\`, or \`glm_zai_refactor\`.

## 3. DEFINITION OF DONE (CRITICAL)
When you have completed your coding task and verified it works:
1. **Write** your report to \`.eck/lastsnapshot/AnswerToSA.md\` (overwrite, not append).
2. **Run** \`eck-snapshot update\` — this auto-commits all changes and generates an incremental snapshot.
3. If \`eck_finish_task\` MCP tool is available, you may use it instead (it does the same thing).

## 4. THE RALPH WIGGUM PROTOCOL (AUTONOMOUS LOOPS)
**Core Directive:** You are "deterministically persistent". Failures are expected, giving up is not.

1.  **Iterative Correction:**
    *   If a build fails or tests turn red: **DO NOT STOP**.
    *   **Read** the error message.
    *   **Think** about the cause.
    *   **Fix** the code.
    *   **Retry** the verification command.
    *   *Repeat this loop up to 3-4 times.*

2.  **Intelligent Retry (GLM ZAI Supervision):**
    *   If a GLM ZAI worker produces bad code:
    *   **DON'T** repeat the same prompt.
    *   **Analyze WHY** it failed (missing context? wrong import?).
    *   **Guide** the worker: "Previous attempt failed because X. Try again using pattern Y."
    *   **Takeover:** If GLM ZAI fails twice, **DO IT YOURSELF**.

3.  **Definition of Done:**
    *   A task is ONLY done when the verification command (e.g., \`npm test\`) exits with code 0.
    *   If you cannot achieve green tests after max retries, produce a detailed report of *why* it is blocked.

## 5. REPORTING PROTOCOL
At the end of your task, you **MUST** overwrite the file \`.eck/lastsnapshot/AnswerToSA.md\` and then run \`eck-snapshot update\`.

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
- **Finishing:** Write \`.eck/lastsnapshot/AnswerToSA.md\`, then run \`eck-snapshot update\` (it auto-commits).
- **Manifests:** If you see [STUB] in .eck/ files, update them.
- **Reporting:** NEVER finish a session without writing the report and running \`eck-snapshot update\`.`;
}

const CODER_INSTRUCTIONS = `# 🛠️ ROLE: Expert Developer (The Fixer)

## CORE DIRECTIVE
You are an Expert Developer. The architecture is already decided. Your job is to **execute**, **fix**, and **polish**.

## DEFINITION OF DONE (CRITICAL)
When the task is complete:
1. **Write** your report to \`.eck/lastsnapshot/AnswerToSA.md\` (overwrite, not append).
2. **Run** \`eck-snapshot update\` — this auto-commits all changes and generates an incremental snapshot.
3. If \`eck_finish_task\` MCP tool is available, you may use it instead.

## CONTEXT
- The GLM ZAI swarm might have struggled or produced code that needs refinement.
- You are here to solve the hard problems manually.
- You have full permission to edit files directly.

## WORKFLOW
1.  Read the code.
2.  Fix the bugs / Implement the feature.
3.  Verify functionality (Run tests!).
4.  **Loop:** If verification fails, fix it immediately. Do not ask for permission.`;
