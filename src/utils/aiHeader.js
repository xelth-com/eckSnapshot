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

function buildAgentDefinitions(executionAgents) {
  let definitions = '';
  for (const key in executionAgents) {
    const agent = executionAgents[key];
    if (agent.active) {
      definitions += `
### ${agent.name} (ID: "${key}")
- **Description:** ${agent.description}
- **GUI Support:** ${agent.guiSupport ? 'Yes' : 'No (Headless)'}
- **Capabilities:** ${agent.capabilities.join(', ')}
- **Restrictions:** ${agent.restrictions.join(', ')}
`;
    }
  }
  return definitions;
}

function buildEckManifestSection(eckManifest) {
  if (!eckManifest) {
    return '';
  }

  let section = '\n## Project-Specific Manifest (.eck Directory)\n\n';
  section += 'This project includes a `.eck` directory with specific context and configuration:\n\n';

  if (eckManifest.context) {
    section += '### Project Context\n\n';
    section += eckManifest.context + '\n\n';
  }

  if (eckManifest.operations) {
    section += '### Operations Guide\n\n';
    section += eckManifest.operations + '\n\n';
  }

  if (eckManifest.journal) {
    section += '### Development Journal\n\n';
    section += eckManifest.journal + '\n\n';
  }

  if (Object.keys(eckManifest.environment).length > 0) {
    section += '### Environment Overrides\n\n';
    section += 'The following environment settings override auto-detected values:\n\n';
    for (const [key, value] of Object.entries(eckManifest.environment)) {
      section += `- **${key}**: ${value}\n`;
    }
    section += '\n';
  }

  section += '**Important**: Use this manifest information when formulating technical plans and briefing execution agents. The context, operations guide, and journal provide crucial project-specific knowledge that should inform your decisions.\n\n';
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


    // Check if agent mode is enabled
    if (context.options && context.options.agent) {
      const agentPromptTemplate = await loadTemplate(promptTemplates.agent);

      const agentHeader = `${agentPromptTemplate}

${projectOverview}
${eckManifestSection}
---

## Project Snapshot Information

- **Project**: ${context.repoName || 'Unknown'}
- **Timestamp**: ${new Date().toISOString()}
- **Files Included**: ${context.stats ? context.stats.includedFiles : 'Unknown'}
- **Total Files in Repo**: ${context.stats ? context.stats.totalFiles : 'Unknown'}

---

`;
      return agentHeader;
    }

    // --- Determine Workflow Content based on JA Flag ---
    const withJa = context.options && context.options.withJa;
    let hierarchicalWorkflow = '';
    let commandFormats = '';

    if (withJa) {
      hierarchicalWorkflow = `### HIERARCHICAL AGENT WORKFLOW

Your primary role is **Senior Architect**. You formulate high-level strategy. For complex code implementation, you will delegate to a **Junior Architect** agent (\`gemini_wsl\`), who has a detailed (\`_ja.md\`) snapshot and the ability to command a **Coder** agent (\`claude\`).

  - **Senior Architect (You):** Sets strategy, defines high-level tasks.
  - **Junior Architect (\`gemini_wsl\`):** Receives strategic tasks, analyzes the \`_ja.md\` snapshot, breaks the task down, and commands the Coder.
  - **Coder (\`claude\`):** Receives small, precise coding tasks from the Junior Architect. **Claude is highly trained for code generation and should be used for all primary code-writing tasks**, while \`gemini_wsl\` can use its own tools for analysis, validation, and running shell commands.`;

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

Your role is **Architect**. You formulate technical plans and delegate code implementation tasks directly to the **Coder** agents (e.g., \`local_dev\`).

  - **Architect (You):** Sets strategy, defines tasks.
  - **Coder (e.g., \`local_dev\`):** Receives precise coding tasks and executes them.`;

      commandFormats = `### COMMAND FORMATS

You MUST use the following JSON command format for Coders:

**For Coders (\`local_dev\`, \`production_server\`, \`android_wsl_dev\`, \`gemini_windows\`):**
Use \`apply_code_changes\` for direct tasks where you provide all details.

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
\`\`\``;
    }

    // --- This is the main/Senior Architect prompt logic ---
    let template;
    if (context.mode === 'vector') {
      template = await loadTemplate(promptTemplates.vectorMode);
      // Inject context for vector mode
      template = template.replace('{{multiAgentSection}}', `
${projectOverview}
${eckManifestSection}
`);
    } else {
      template = await loadTemplate(promptTemplates.multiAgent);
      // --- INJECT DYNAMIC CONTEXT ---
      template = template.replace('{{projectOverview}}', projectOverview);
      template = template.replace('{{eckManifestSection}}', eckManifestSection);
      // --- END INJECT ---
    }

    const agentDefinitions = buildAgentDefinitions(executionAgents);

    const data = {
      ...context,
      timestamp: new Date().toISOString(),
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
