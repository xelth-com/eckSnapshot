import { loadSetupConfig, getAllProfiles } from '../config.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple template renderer for basic variable substitution
function render(template, data) {
  let output = template;
  for (const key in data) {
    const value = data[key];
    if (typeof value === 'object' && value !== null) {
      for (const nestedKey in value) {
        output = output.replace(new RegExp(`{{${key}.${nestedKey}}}`, 'g'), value[nestedKey]);
      }
    } else {
      output = output.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
  }
  return output;
}

/**
 * Filters execution agents based on the current mode.
 * Senior Architect should only see relevant agents, not internal workers.
 */
function getVisibleAgents(executionAgents, options) {
  const visible = {};

  // 1. Define Standard Coders (Always available as fallback)
  // These keys must match IDs in setup.json
  const standardCoders = ['local_dev', 'production_server', 'android_wsl_dev'];

  // 2. Determine Priority Agent (The Junior Architect)
  let priorityAgentKey = null;
  if (options.jas) priorityAgentKey = 'jas';
  if (options.jao) priorityAgentKey = 'jao';
  if (options.jag) priorityAgentKey = 'jag';

  // 3. Build the list
  // If a JA is selected, add them FIRST with a note
  if (priorityAgentKey && executionAgents[priorityAgentKey]) {
    const ja = executionAgents[priorityAgentKey];
    visible[priorityAgentKey] = {
      ...ja,
      description: `⭐ **PRIMARY AGENT** ⭐ ${ja.description} (Delegates to MiniMax)`
    };
  }

  // Add standard coders
  for (const key of standardCoders) {
    if (executionAgents[key] && executionAgents[key].active) {
      visible[key] = executionAgents[key];
    }
  }

  // NOTE: We deliberately EXCLUDE 'minimax_worker' here.
  // The Senior Architect does not call MiniMax directly; the JA does.

  return visible;
}

function buildAgentDefinitions(filteredAgents) {
  let definitions = '';
  for (const key in filteredAgents) {
    const agent = filteredAgents[key];
    definitions += `
### ${agent.name} (ID: "${key}")
- **Description:** ${agent.description}
- **GUI Support:** ${agent.guiSupport ? 'Yes' : 'No (Headless)'}
- **Capabilities:** ${agent.capabilities.join(', ')}
- **Restrictions:** ${agent.restrictions.join(', ')}
`;
  }
  return definitions;
}

/**
 * Parse journal entries from JOURNAL.md content
 * @param {string} journalContent - Raw content of JOURNAL.md
 * @returns {Array} Array of parsed journal entries
 */
function parseJournalEntries(journalContent) {
  if (!journalContent || typeof journalContent !== 'string') {
    return [];
  }

  // Split by --- separators, filter empty blocks
  const blocks = journalContent.split(/^---$/m).filter(b => b.trim());
  const entries = [];

  for (let i = 0; i < blocks.length; i += 2) {
    const frontmatter = blocks[i];
    const body = blocks[i + 1] || '';

    // Parse frontmatter
    const typeMatch = frontmatter.match(/^type:\s*(.+)$/m);
    const scopeMatch = frontmatter.match(/^scope:\s*(.+)$/m);
    const summaryMatch = frontmatter.match(/^summary:\s*(.+)$/m);
    const dateMatch = frontmatter.match(/^(?:date|timestamp):\s*(.+)$/m);
    const taskIdMatch = frontmatter.match(/^task_id:\s*(.+)$/m);

    // Extract title from body (first # heading)
    const titleMatch = body.match(/^#\s+(.+)$/m);

    entries.push({
      type: typeMatch ? typeMatch[1].trim() : 'unknown',
      scope: scopeMatch ? scopeMatch[1].trim() : '',
      summary: summaryMatch ? summaryMatch[1].trim() : (titleMatch ? titleMatch[1].trim() : ''),
      date: dateMatch ? dateMatch[1].trim() : '',
      taskId: taskIdMatch ? taskIdMatch[1].trim() : '',
      body: body.trim()
    });
  }

  return entries;
}

/**
 * Build a compact journal summary for the architect
 * Shows: last entry (full) + 5 previous (headers only) + total count
 */
function buildJournalSummary(journalContent) {
  const entries = parseJournalEntries(journalContent);

  if (entries.length === 0) {
    return 'No journal entries found.';
  }

  let summary = '';

  // Last entry - show full details
  const lastEntry = entries[0];
  summary += `**Latest Entry** (${lastEntry.date || 'no date'}):\n`;
  summary += `- Type: \`${lastEntry.type}\` | Scope: \`${lastEntry.scope}\`\n`;
  summary += `- ${lastEntry.summary}\n`;
  if (lastEntry.body) {
    // Include body but limit to first 3 lines
    const bodyLines = lastEntry.body.split('\n').filter(l => l.trim()).slice(0, 4);
    summary += bodyLines.map(l => `  ${l}`).join('\n') + '\n';
  }

  // Previous 5 entries - headers only
  if (entries.length > 1) {
    summary += '\n**Previous entries:**\n';
    const previousEntries = entries.slice(1, 6);
    for (const entry of previousEntries) {
      summary += `- \`${entry.type}(${entry.scope})\`: ${entry.summary}\n`;
    }
  }

  // Total count
  if (entries.length > 6) {
    summary += `\n*...and ${entries.length - 6} more entries in .eck/JOURNAL.md*\n`;
  }

  return summary;
}

function buildEckManifestSection(eckManifest) {
  if (!eckManifest) {
    return '';
  }

  let section = '\n## Project Context (.eck Directory)\n\n';
  section += 'This project has a `.eck/` directory with project-specific context files.\n';
  section += 'The coder agent can read these files when needed. Available files:\n\n';
  section += '- `CONTEXT.md` - Project overview and architecture\n';
  section += '- `OPERATIONS.md` - Common commands and workflows\n';
  section += '- `JOURNAL.md` - Development history\n';
  section += '- `ROADMAP.md` - Planned features\n';
  section += '- `TECH_DEBT.md` - Known issues and refactoring needs\n';
  section += '- `ENVIRONMENT.md` - Environment-specific settings\n\n';

  // Add journal summary (compact view for architect)
  if (eckManifest.journal) {
    section += '### Recent Development Activity\n\n';
    section += buildJournalSummary(eckManifest.journal) + '\n';
  }

  section += '---\n\n';

  return section;
}

function extractMeaningfulLine(block) {
  if (!block || typeof block !== 'string') {
    return null;
  }

  const lines = block.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const withoutBullet = trimmed.replace(/^[-*]\s*/, '').trim();
    if (withoutBullet) {
      return withoutBullet.replace(/\s+/g, ' ');
    }
  }
  return null;
}

function extractDescriptionFromManifest(eckManifest) {
  if (!eckManifest) {
    return null;
  }

  if (typeof eckManifest.description === 'string' && eckManifest.description.trim()) {
    return eckManifest.description.trim();
  }

  if (eckManifest.project && typeof eckManifest.project.description === 'string' && eckManifest.project.description.trim()) {
    return eckManifest.project.description.trim();
  }

  if (typeof eckManifest.context === 'string' && eckManifest.context.trim()) {
    const sectionMatch = eckManifest.context.match(/##\s*Description\s*([\s\S]*?)(?=^##\s|^#\s|\Z)/im);
    if (sectionMatch && sectionMatch[1]) {
      const meaningful = extractMeaningfulLine(sectionMatch[1]);
      if (meaningful) {
        return meaningful;
      }
    }

    const fallback = extractMeaningfulLine(eckManifest.context);
    if (fallback) {
      return fallback;
    }
  }

  return null;
}

async function resolveProjectDescription(context) {
  const defaultDescription = 'Project description not provided.';

  const manifestDescription = extractDescriptionFromManifest(context.eckManifest);
  if (manifestDescription) {
    const normalized = manifestDescription.trim();
    const genericPatterns = [
      /^brief description of what this project does/i,
      /^no project context provided/i
    ];
    const isGeneric = genericPatterns.some(pattern => pattern.test(normalized));
    if (!isGeneric) {
      return normalized;
    }
  }

  if (context.repoPath) {
    try {
      const packageJsonPath = path.join(context.repoPath, 'package.json');
      const pkgRaw = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      if (typeof pkg.description === 'string' && pkg.description.trim()) {
        return pkg.description.trim();
      }
    } catch (error) {
      // Ignore errors - package.json may not exist or be readable
    }
  }

  return defaultDescription;
}

export async function generateEnhancedAIHeader(context, isGitRepo = false) {
  try {
    const setupConfig = await loadSetupConfig();
    const { aiInstructions } = setupConfig;
    const { architectPersona, executionAgents, promptTemplates } = aiInstructions;

    // Helper function to read a template file or return the string if it's not a path
    const loadTemplate = async (templatePathOrString) => {
      if (templatePathOrString && (templatePathOrString.endsWith('.md') || templatePathOrString.endsWith('.txt'))) {
        try {
          // Resolve path relative to the project root. __dirname is src/utils.
          const resolvedPath = path.join(__dirname, '..', '..', templatePathOrString);
          return await fs.readFile(resolvedPath, 'utf-8');
        } catch (e) {
          return `ERROR: FAILED TO LOAD TEMPLATE ${templatePathOrString}: ${e.message}`;
        }
      }
      return templatePathOrString; // Fallback for old-style inline strings or errors
    };

    // P1 Bug Fix: Normalize manifest structure as per Consilium report
    function normalizeManifest(raw) {
      if (!raw) return null;
      const out = {};
      // Handle `setup.json` structure (e.g., `projectContext.name`)
      if (raw.projectContext) {
        out.context = raw.projectContext.description || JSON.stringify(raw.projectContext, null, 2);
        out.operations = raw.operations || raw.projectContext.operations || ''; // Assuming .eck/OPERATIONS.md is separate
        out.journal = raw.journal || raw.projectContext.journal || ''; // Assuming .eck/JOURNAL.md is separate
        out.environment = raw.environment || raw.projectContext.environment || {}; // Assuming .eck/ENVIRONMENT.md is separate
      } else {
        // Handle direct .eck file structure (e.g., raw.context from CONTEXT.md)
        out.context = raw.context || '';
        out.operations = raw.operations || '';
        out.journal = raw.journal || '';
        out.environment = raw.environment || {};
      }
      // Add fallback text if still empty
      if (!out.context) out.context = 'No project context provided.';
      if (!out.operations) out.operations = 'No operations guide provided.';
      if (!out.journal) out.journal = 'No journal entries found.';

      return out;
    }

    // --- Build common context sections --- 
    const projectDescription = await resolveProjectDescription(context);
    const projectOverview = `### PROJECT OVERVIEW
- **Project:** ${context.repoName || 'Unknown'}
- **Description:** ${projectDescription}
`;
    const normalizedEck = normalizeManifest(context.eckManifest);
    let eckManifestSection = '';
    if (normalizedEck) {
      eckManifestSection = buildEckManifestSection(normalizedEck);
    } else {
      eckManifestSection = '### PROJECT-SPECIFIC MANIFEST (.eck Directory)\n\nWARNING: .eck manifest was not found or was empty.\n';
    }
    // --- End context building ---


    // --- LOGIC CHANGE: Snapshot is ALWAYS for Senior Architect ---
    // The `agent` prompt template is used ONLY in CLAUDE.md (via claudeMdGenerator.js)
    // NOT in the snapshot itself.

    const isJag = context.options && context.options.jag;
    const isJas = context.options && context.options.jas;
    const isJao = context.options && context.options.jao;
    const isJaMode = isJag || isJas || isJao;

    // --- Determine Workflow Content based on JA Flag ---
    let hierarchicalWorkflow = '';
    let commandFormats = '';

    if (isJaMode) {
      // Instructions strictly for the Senior Architect on how to use the JA
      hierarchicalWorkflow = `### 👑 ROYAL COURT ARCHITECTURE (Active)

You are the **Senior Architect**. You have a **Junior Architect** available to handle implementation.

**PROTOCOL:**
1.  **Prefer Delegation:** Unless the task is trivial (1-2 file edits), assign it to the **Junior Architect** (ID: \`jas\`, \`jao\`, or \`jag\` - see agents list above).
2.  **Direct Execution:** Only use \`local_dev\` or \`production_server\` directly if the Junior Architect fails or for simple "hotfixes".
3.  **No Micro-Management:** Do not tell the Junior Architect *how* to use MiniMax or internal tools. Just give them the strategic objective.
`;

      commandFormats = `### COMMAND FORMATS (Eck-Protocol v2)

You MUST use the **Eck-Protocol v2** format for all code execution tasks. This format combines Markdown for analysis, XML tags for file operations, and JSON for routing metadata.

**CRITICAL DISPLAY RULE (THE 4-BACKTICK WRAPPER):**
To ensure your command is copy-pasteable without breaking UI rendering, you **MUST** wrap the ENTIRE protocol output in a \`text\` block using **QUADRUPLE BACKTICKS** (\` \`\`\`\` \`).

**Why?** Your command contains internal code blocks with 3 backticks. To escape them, the outer container needs 4.

**Required Output Format:**

\`\`\`\`text
# Analysis
[Your reasoning...]

## Changes
<file path="example.js" action="replace">
\\\`\\\`\\\`javascript
// Internal code block uses 3 backticks
const x = 1;
\\\`\\\`\\\`
</file>

## Metadata
\\\`\\\`\\\`json
{ "target_agent": "jas", "task_id": "unique-id" }
\\\`\\\`\\\`
\`\`\`\`

**File Actions:**
- \`create\`: Create a new file (requires full content)
- \`replace\`: Overwrite existing file (requires full content)
- \`modify\`: Replace specific sections (provide context)
- \`delete\`: Delete the file
`;
    } else if (context.options && context.options.withJa) {
      hierarchicalWorkflow = `### HIERARCHICAL AGENT WORKFLOW

Your primary role is **Senior Architect**. You formulate high-level strategy. For complex code implementation, you will delegate to a **Junior Architect** agent (\`gemini_wsl\`), who has a detailed (\`_ja.md\`) snapshot and the ability to command a **Coder** agent (\`claude\`).

  - **Senior Architect (You):** Sets strategy, defines high-level tasks.
  - **Junior Architect (\`gemini_wsl\`):** Receives strategic tasks, analyzes the \`_ja.md\` snapshot, breaks the task down, and commands the Coder.
  - **Coder (\`claude\`):** Receives small, precise coding tasks from the Junior Architect. **Claude is responsible for keeping the .eck/ manifest files accurate and synchronized with the code.**`;

      commandFormats = `### COMMAND FORMATS

You MUST use one of two JSON command formats based on your target:

**1. For Coders (\`local_dev\`, \`production_server\`, \`android_wsl_dev\`, \`gemini_windows\`) - LOW-LEVEL EXECUTION:**
Use \`apply_code_changes\` for simple, direct tasks where you provide all details.

\`\`\`json
{
  "target_agent": "local_dev",
  "agent_environment": "Development environment with full GUI support and development tools",
  "command_for_agent": "apply_code_changes",
  "task_id": "unique-task-id",
  "payload": {
    "objective": "Brief, clear task description",
    "context": "Why this change is needed - include relevant .eck manifest context",
    "files_to_modify": [
      {
        "path": "exact/file/path.js",
        "action": "specific action (add, modify, replace, delete)",
        "location": "line numbers, function name, or search pattern",
        "details": "precise description of the change"
      }
    ],
    "new_files": [
      {
        "path": "path/to/new/file.js",
        "content_type": "javascript/json/markdown/config",
        "purpose": "why this file is needed"
      }
    ],
    "dependencies": {
      "install": ["package-name@version"],
      "remove": ["old-package-name"]
    },
    "validation_steps": [
      "npm run test",
      "node index.js --help",
      "specific command to verify functionality"
    ],
    "expected_outcome": "what should work after changes",
    "post_execution_steps": {
      "journal_entry": {
        "type": "feat",
        "scope": "authentication",
        "summary": "Brief description of what was accomplished",
        "details": "Detailed explanation of changes, impacts, and technical notes"
      },
      "mcp_feedback": {
        "success": true,
        "errors": [],
        "mcp_version": "1.0"
      }
    }
  }
}
\`\`\`

**2. For Junior Architects (\`gemini_wsl\`) - HIGH-LEVEL DELEGATION:**
Use \`execute_strategic_task\` for complex features. The JA will use its own snapshot and Coder agent to complete the task.

\`\`\`json
{
  "target_agent": "gemini_wsl",
  "command_for_agent": "execute_strategic_task",
  "payload": {
    "objective": "Implement the user authentication feature",
    "context": "This is a high-level task. Use your _ja.md snapshot to analyze the codebase. Use your 'claude (delegate)' capability to implement the necessary code across all required files (routes, controllers, services).",
    "constraints": [
      "Must use JWT for tokens",
      "Add new routes to \`routes/api.js\`",
      "Ensure all new code is covered by tests"
    ],
    "validation_steps": [
      "npm run test"
    ]
  }
}
\`\`\``;
    } else {
      hierarchicalWorkflow = `### AGENT WORKFLOW

Your role is **Architect**. You formulate technical plans and delegate code implementation tasks directly to the **Coder** agents.

**Your secondary duty is DOCUMENTATION INTEGRITY.** You must ensure the Coder updates .eck/ files whenever the project structure, roadmap, or debt changes.

  - **Architect (You):** Sets strategy, defines tasks, enforces manifest maintenance.
  - **Coder (e.g., \`local_dev\`):** Receives precise coding tasks and executes them, including manifest updates.`;

      commandFormats = `### COMMAND FORMATS (Eck-Protocol v2)

You MUST use the **Eck-Protocol v2** format for all code execution tasks. This format combines Markdown for analysis, XML tags for file operations, and JSON for routing metadata.

**CRITICAL DISPLAY RULE (THE 4-BACKTICK WRAPPER):**
To ensure your command is copy-pasteable without breaking UI rendering, you **MUST** wrap the ENTIRE protocol output in a \`text\` block using **QUADRUPLE BACKTICKS** (\` \`\`\`\` \`).

**Why?** Your command contains internal code blocks with 3 backticks. To escape them, the outer container needs 4.

**Required Output Format:**

\`\`\`\`text
# Analysis
[Your reasoning...]

## Changes
<file path="example.js" action="replace">
\\\`\\\`\\\`javascript
// Internal code block uses 3 backticks
const x = 1;
\\\`\\\`\\\`
</file>

## Metadata
\\\`\\\`\\\`json
{ ... }
\\\`\\\`\\\`
\`\`\`\`

**File Actions:**
- \`create\`: Create a new file (requires full content)
- \`replace\`: Overwrite existing file (requires full content)
- \`modify\`: Replace specific sections (provide context)
- \`delete\`: Delete the file
`;
    }

    // --- This is the main/Senior Architect prompt logic ---
    let template;
    template = await loadTemplate(promptTemplates.multiAgent);
    // --- INJECT DYNAMIC CONTEXT ---
    template = template.replace('{{projectOverview}}', projectOverview);
    template = template.replace('{{eckManifestSection}}', eckManifestSection);
    // --- END INJECT ---

    // Use the new filtering function to get visible agents
    const filteredExecutionAgents = getVisibleAgents(executionAgents, context.options || {});

    const agentDefinitions = buildAgentDefinitions(filteredExecutionAgents);

    const data = {
      ...context,
      timestamp: new Date().toLocaleString(),
      architectPersona,
      agentDefinitions,
      hierarchicalWorkflow,
      commandFormats
    };

    let renderedTemplate = render(template, data);

    // Inject skeleton mode instructions if enabled
    if (context.options && context.options.skeleton) {
      try {
        const skeletonInstructionPath = path.join(__dirname, '..', 'templates', 'skeleton-instruction.md');
        const skeletonInstructions = await fs.readFile(skeletonInstructionPath, 'utf-8');
        renderedTemplate += '\n\n' + skeletonInstructions + '\n\n';
      } catch (e) {
        console.warn('Warning: Could not load skeleton-instruction.md', e.message);
      }
    }

    // Inject dynamic profile context if a profile is active
    if (context.options && context.options.profile && context.repoPath) {
      let metadataHeader = '\n\n## Partial Snapshot Context\n';
      metadataHeader += `- **Profile(s) Active:** ${context.options.profile}\n`;
      try {
        const allProfiles = await getAllProfiles(context.repoPath);
        const activeProfileNames = context.options.profile.split(',').map(p => p.trim().replace(/^-/, ''));
        const allProfileNames = Object.keys(allProfiles).filter(p => !activeProfileNames.includes(p));
        if (allProfileNames.length > 0) {
          metadataHeader += `- **Other Available Profiles:** ${allProfileNames.join(', ')}\n`;
        }
      } catch (e) { /* fail silently on metadata generation */ }

      const insertMarker = "### "; // Generic marker since we change the H1s
      // Insert before first H3 (WORKFLOW usually)
      renderedTemplate = renderedTemplate.replace(/### /, metadataHeader + '\n### ');
    }

    return renderedTemplate;

  } catch (error) {
    console.warn('Warning: Could not load setup.json, using minimal header', error.message);
    return `# Snapshot for ${context.repoName || 'Project'}

Generated: ${new Date().toISOString()}

---

`;
  }
}
