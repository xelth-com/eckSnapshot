import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generates AGENTS.md for OpenCode integration (GLM Z.AI ecosystem only)
 * @param {string} repoPath - Path to the repository
 * @param {string} mode - Mode (jaz, coder)
 * @param {string} tree - Directory tree string
 * @param {string[]} confidentialFiles - Array of confidential file paths
 */
export async function generateOpenCodeAgents(repoPath, mode, tree, confidentialFiles = [], options = {}) {
  let frontmatter = {};
  let body = '';

  if (mode === 'jaz') {
    frontmatter = {
      mode: 'primary',
      description: 'Project Orchestrator with GLM Z.AI swarm access (GLM-4.7)',
      model: 'GLM-4.7',
      steps: 15,
      tools: {
        'glm-zai:glm_zai_backend': true,
        'glm-zai:glm_zai_frontend': true,
        'glm-zai:glm_zai_qa': true,
        'glm-zai:glm_zai_refactor': true,
        'glm-zai:glm_zai_general': true,
        'eck-core:eck_finish_task': true
      },
      permission: { read: 'allow', edit: 'allow', bash: 'allow', '*': 'allow' },
      color: '#10a37f'
    };

    const templatePath = path.join(__dirname, '..', 'templates', 'opencode', 'junior-architect.template.md');
    try {
      let templateContent = await fs.readFile(templatePath, 'utf-8');
      body = templateContent.replace('{{tree}}', tree);
    } catch (error) {
      console.warn(`⚠️ Could not load JAZ template from ${templatePath}: ${error.message}`);
      body = `# 🧠 ROLE: Swarm Orchestrator (GLM-4.7)\n\nDirectory:\n\`\`\`\n${tree}\n\`\`\``;
    }
  } else {
    frontmatter = {
      mode: 'primary',
      description: 'Expert developer - executes and fixes',
      model: 'GLM-4.7',
      steps: 5,
      tools: { 'eck-core:eck_finish_task': true },
      permission: { read: 'allow', edit: 'allow', bash: 'allow', '*': 'allow' },
      color: '#44BA81'
    };

    const templatePath = path.join(__dirname, '..', 'templates', 'opencode', 'coder.template.md');
    try {
      body = await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      console.warn(`⚠️ Could not load Coder template from ${templatePath}: ${error.message}`);
      body = `# 🛠️ ROLE: Expert Developer`;
    }
  }

  // Append confidential files
  if (confidentialFiles.length > 0) {
    body += '\n\n## 🔐 Access & Credentials\n';
    for (const file of confidentialFiles) body += `- \`${file}\`\n`;
  }

  if (options.zh) {
    body += `\n## 🇨🇳 LANGUAGE PROTOCOL\n- ALWAYS write the \`instruction\` parameter in **Chinese (中文)** for GLM Z.AI workers.\n`;
  }

  const yaml = await import('js-yaml');
  const frontmatterStr = yaml.default.dump(frontmatter, { lineWidth: -1, noRefs: true, quotingType: '"' });
  const content = `---\n${frontmatterStr}---\n\n${body}`;
  await fs.writeFile(path.join(repoPath, 'AGENTS.md'), content, 'utf-8');
  console.log(`📝 Generated OpenCode agents: AGENTS.md`);
}
