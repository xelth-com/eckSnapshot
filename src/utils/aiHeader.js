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
    const projectOverview = `### PROJECT OVERVIEW
- **Project:** ${context.repoName || 'Unknown'}
- **Description:** A monorepo POS system with Electron frontend and Node.js backend.
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
      agentDefinitions
    };

    let renderedTemplate = render(template, data);
    
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
      
      const insertMarker = "### HIERARCHICAL AGENT WORKFLOW"; // Use our new marker
      renderedTemplate = renderedTemplate.replace(insertMarker, metadataHeader + '\n' + insertMarker);
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