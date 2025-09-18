import { loadSetupConfig } from '../config.js';

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

    // Count active agents to determine template
    const activeAgents = Object.values(executionAgents).filter(agent => agent.active);
    const isMultiAgent = activeAgents.length > 1;

    let template;
    if (context.mode === 'vector') {
      template = promptTemplates.vectorMode;
      // For vector mode, build the multi-agent section dynamically
      const multiAgentSection = isMultiAgent ? 
        `### AVAILABLE EXECUTION AGENTS
You can command multiple specialized agents. **YOU must choose the most appropriate agent** based on the task requirements and target environment:

${buildAgentDefinitions(executionAgents)}

### COMMAND BLOCK FORMAT
To ensure error-free execution, all tasks for agents must be presented in a special block with a "Copy" button. **IMPORTANT:** You MUST analyze the task and choose the appropriate agent by its ID, then fill in the agent information:

\`\`\`json
{
  "target_agent": "local_dev",
  "agent_environment": "Development environment with full GUI support and development tools",
  "command_for_agent": "apply_code_changes",
  "task_id": "unique-task-id",
  "payload": {
    "objective": "Brief, clear task description",
    "context": "Why this change is needed",
    "files_to_modify": [...],
    "new_files": [...],
    "dependencies": {...},
    "validation_steps": [...],
    "expected_outcome": "what should work after changes"
  }
}
\`\`\`

**Agent Selection Guidelines:**
- Choose the agent ID based on task requirements and environment constraints
- Copy the agent's description to "agent_environment" field
- Ensure the task matches the agent's capabilities and restrictions` :
        `### COMMAND BLOCK FORMAT
To ensure error-free execution, all tasks for the agent must be presented in a special block with a "Copy" button:

\`\`\`json
{
  "command_for_agent": "apply_code_changes",
  "task_id": "unique-task-id",
  "payload": {
    "objective": "Brief, clear task description",
    "context": "Why this change is needed",
    "files_to_modify": [...],
    "new_files": [...],
    "dependencies": {...},
    "validation_steps": [...],
    "expected_outcome": "what should work after changes"
  }
}
\`\`\``;
      
      template = template.replace('{{multiAgentSection}}', multiAgentSection);
    } else {
      // Always use multiAgent template for file snapshots
      template = promptTemplates.multiAgent;
    }

    const agentDefinitions = buildAgentDefinitions(executionAgents);

    const data = {
      ...context,
      timestamp: new Date().toISOString(),
      architectPersona,
      agentDefinitions
    };

    let renderedTemplate = render(template, data);
    
    // DELETED: The `multiAgent` template in setup.json now controls the entire manifest and git workflow section.
    // These programmatic insertions are removed to prevent duplicate and conflicting instructions.

    return renderedTemplate;
  } catch (error) {
    console.warn('Warning: Could not load setup.json, using minimal header');
    return `# Snapshot for ${context.repoName || 'Project'}\n\nGenerated: ${new Date().toISOString()}\n\n---\n\n`;
  }
}