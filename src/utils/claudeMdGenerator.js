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
\`\`\`text
${tree}
\`\`\`

## 2. PROJECT CONTEXT (.eck DIRECTORY)
The \`.eck/\` directory is your brain externalized. **Before taking action:**
- Read the files in \`.eck/\` (like \`CONTEXT.md\`, \`ROADMAP.md\`, \`TECH_DEBT.md\`) to understand the rules and current state.
- Update these manifests if the architecture or roadmap changes.

## 3. SWARM DELEGATION PROTOCOL (GLM Z.AI)
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

## 4. DEFINITION OF DONE & eck_finish_task
- Your task is NOT complete until code works globally. Verify functionality manually.
- Once verified, call \`eck_finish_task\` immediately. **Do NOT ask the user "should I finish?" — just call it.** Include the task \`id\` in your report.
`;
}

const CODER_INSTRUCTIONS = `---
description: Expert Developer Protocol (The Fixer)
---
# 🛠️ ROLE: Expert Developer (The Fixer)

## CORE DIRECTIVE
You are an Expert Developer. The architecture is already decided. Your job is to **execute**, **fix**, and **polish**.

## DEFINITION OF DONE & eck_finish_task
- When a task is complete and fully tested, call \`eck_finish_task\` IMMEDIATELY. Do NOT ask the user for permission.
- Pass your detailed markdown report into the \`status\` argument.
- The tool will automatically write the report, commit, and generate a snapshot.
- **WARNING: USE ONLY ONCE.** Do not use for intermediate testing.

## 🚨 MAGIC WORD: [SYNC] / [SYNC MANIFESTS]
If the human user types **\`[SYNC]\`**, immediately suspend feature development and switch to Project Manager mode:
1. Find all \`.eck/*.md\` files with \`[STUB]\` markers. Analyze the codebase to resolve them.
2. Review \`ROADMAP.md\` and \`TECH_DEBT.md\`. Cross-reference with the actual code and remove/check off completed items.
3. Update \`CONTEXT.md\` and \`ARCHITECTURE.md\` if the system has evolved.
4. Use the **\`eck_manifest_edit\`** tool to apply these updates atomically. Do not read \`JOURNAL.md\`.
5. Call \`eck_finish_task\` when the audit is complete.
`;

/**
 * Injects async background hooks into the project's .claude/settings.json
 */
/**
 * Cleans up the legacy spammy PostToolUse hook from .claude/settings.json.
 * Previously injected an 'update-auto' hook on every Edit/Bash/Write tool use,
 * causing snapshot spam (up1, up2, up3...). Snapshots are now deferred to eck_finish_task.
 */
async function setupClaudeHooks(repoPath) {
  const settingsPath = path.join(repoPath, '.claude', 'settings.json');
  let config = {};

  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    config = JSON.parse(content);
  } catch (e) {
    // File doesn't exist or invalid JSON — nothing to clean up
    return;
  }

  let modified = false;

  if (config.hooks && config.hooks.PostToolUse) {
    const originalLength = config.hooks.PostToolUse.length;

    // Remove the eck-snapshot update-auto hook
    config.hooks.PostToolUse = config.hooks.PostToolUse.filter(h =>
      !(h.hooks && h.hooks.some(hc => hc.command?.includes('eck-snapshot update-auto')))
    );

    if (config.hooks.PostToolUse.length < originalLength) {
      modified = true;
    }

    // Clean up empty PostToolUse array
    if (config.hooks.PostToolUse.length === 0) {
      delete config.hooks.PostToolUse;
    }

    // Clean up empty hooks object
    if (Object.keys(config.hooks).length === 0) {
      delete config.hooks;
    }
  }

  if (modified) {
    await fs.writeFile(settingsPath, JSON.stringify(config, null, 2), 'utf-8');
  }
}

/**
 * Generates the native Claude Code hierarchical ecosystem.
 * Creates .claude/rules/, .claude/skills/, .claude/agents/ and a lightweight CLAUDE.md entrypoint.
 */
export async function updateClaudeMd(repoPath, mode, tree, confidentialFiles = [], options = {}) {
  const claudeDir = path.join(repoPath, '.claude');
  const rulesDir = path.join(claudeDir, 'rules');
  const skillsDir = path.join(claudeDir, 'skills');
  const agentsDir = path.join(claudeDir, 'agents');

  await fs.mkdir(rulesDir, { recursive: true });
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.mkdir(agentsDir, { recursive: true });

  // 1. Generate lightweight CLAUDE.md entrypoint
  let coreContent = `# Royal Court AI Workspace\n\nYou are operating in an eckSnapshot managed workspace. Your role is **${mode.toUpperCase()}**.\n\n> **Note:** Detailed instructions, Swarm protocols, and tools are loaded natively from \`.claude/rules/\`, \`.claude/skills/\`, and \`.claude/agents/\`.\n`;

  if (confidentialFiles.length > 0) {
    coreContent += '\n## Access & Credentials\nAvailable locally but excluded from snapshots:\n';
    for (const file of confidentialFiles) coreContent += `- \`${file}\`\n`;
  }
  await fs.writeFile(path.join(repoPath, 'CLAUDE.md'), coreContent, 'utf-8');

  // 2. Generate Rules
  let ruleContent = '';
  if (mode === 'jas') {
    ruleContent = `---\ndescription: Swarm Orchestrator Protocol (Sonnet)\n---\n${getArchitectInstructions('Sonnet 4.5', tree)}\n`;
  } else if (mode === 'jao') {
    ruleContent = `---\ndescription: Swarm Orchestrator Protocol (Opus)\n---\n${getArchitectInstructions('Opus 4.5', tree)}\n`;
  } else {
    ruleContent = CODER_INSTRUCTIONS;
  }

  if (options.zh) {
    ruleContent += `\n## LANGUAGE PROTOCOL\n- **With the user:** Communicate in the user's language.\n- **With GLM Z.AI workers:** ALWAYS write the \`instruction\` parameter in **Chinese**.\n`;
  }

  await fs.writeFile(path.join(rulesDir, '01-eck-protocol.md'), ruleContent, 'utf-8');

  // 3. Generate Native Skills
  const scoutSkillDir = path.join(skillsDir, 'eck-scout');
  await fs.mkdir(scoutSkillDir, { recursive: true });
  await fs.writeFile(path.join(scoutSkillDir, 'SKILL.md'), `---
name: eck-scout
description: Explores external repositories and generates directory trees for context.
whenToUse: Use this when you need to understand the architecture of a linked or external project.
arguments:
  - name: path
    description: Absolute or relative path to the external repository.
  - name: depth
    description: Depth level (0-9). 0 is tree-only, 5 is skeleton, 9 is full source. Default is 0.
    required: false
disable-model-invocation: false
---
# Scout Protocol
Execute cross-repository scans.
To run a scout, I will execute:
\`\`\`bash
cd \${path} && eck-snapshot scout \${depth}
\`\`\`
`, 'utf-8');

  const fetchSkillDir = path.join(skillsDir, 'eck-fetch');
  await fs.mkdir(fetchSkillDir, { recursive: true });
  await fs.writeFile(path.join(fetchSkillDir, 'SKILL.md'), `---
name: eck-fetch
description: Fetches specific source code files from an external repository using glob patterns.
whenToUse: Use this after running eck-scout when you need to see the exact implementation of specific files.
arguments:
  - name: path
    description: Path to the external repository.
  - name: glob
    description: Glob pattern matching the files (e.g., "**/api.ts").
disable-model-invocation: false
---
# Fetch Protocol
To fetch files, I will execute:
\`\`\`bash
cd \${path} && eck-snapshot fetch "\${glob}"
\`\`\`
`, 'utf-8');

  // 4. Generate Native Agents (Subagents)
  await fs.writeFile(path.join(agentsDir, 'jas.md'), `---
name: jas
description: Junior Architect (Sonnet). Fast orchestrator for routing tasks to GLM Z.AI.
model: claude-3-7-sonnet-20250219
tools: [glm_zai_backend, glm_zai_frontend, glm_zai_qa, glm_zai_refactor, glm_zai_general]
---
You are the Junior Architect (Sonnet). Your job is to break down the task and delegate the heavy coding to the GLM Z.AI tools. Do not write large files yourself.
`, 'utf-8');

  await fs.writeFile(path.join(agentsDir, 'jao.md'), `---
name: jao
description: Junior Architect (Opus). Deep thinker for critical architecture and security.
model: claude-3-opus-20240229
tools: [glm_zai_backend, glm_zai_frontend, glm_zai_qa, glm_zai_refactor, glm_zai_general]
---
You are the Junior Architect (Opus). Focus on system stability and complex logic. Delegate boilerplate to GLM Z.AI tools and heavily review their output.
`, 'utf-8');

  // 5. Setup async hooks
  await setupClaudeHooks(repoPath);

  console.log(`📝 Generated native Claude Code hierarchy (.claude/rules, skills, agents) for role: **${mode.toUpperCase()}**`);
}
