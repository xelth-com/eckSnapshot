import { loadConfig } from './fileUtils.js';

// A simple template renderer
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

function buildAgentDefinitions(agentsConfig) {
  let definitions = '';
  for (const key in agentsConfig) {
    const agent = agentsConfig[key];
    if (agent.active) {
      definitions += `
### ${agent.name}
- **Description:** ${agent.description}
- **GUI Support:** ${agent.guiSupport ? 'Yes' : 'No (Headless)'}
`;
    }
  }
  return definitions;
}

export async function generateEnhancedAIHeader(context) {
  const config = await loadConfig(); // Load from ecksnapshot.config.js
  const { aiInstructions } = config;
  if (!aiInstructions) {
    console.warn('Warning: `aiInstructions` not found in config. Using default header.');
    return `# Snapshot for ${context.repoName}\n`;
  }

  const { architectPersona, executionAgents, promptTemplates } = aiInstructions;

  const template = context.mode === 'vector' 
    ? promptTemplates.vectorMode 
    : promptTemplates.fileMode;

  const agentDefinitions = buildAgentDefinitions(executionAgents);

  const data = {
    ...context,
    timestamp: new Date().toISOString(),
    architectPersona,
    agentDefinitions
  };

  return render(template, data);
}