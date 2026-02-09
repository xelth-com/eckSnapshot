import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import os from 'os';
import { execa } from 'execa';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Setup / Restore MCP servers for Claude Code and OpenCode.
 * Registers:
 *   1. eck-core     (eck_finish_task) - commit + snapshot
 *   2. glm-zai      (glm_zai_*) - GLM-4.7 coding workers
 *
 * Usage:
 *   eck-snapshot setup-mcp              # Auto-detect and register for Claude Code
 *   eck-snapshot setup-mcp --opencode   # Register for OpenCode
 *   eck-snapshot setup-mcp --both       # Register for both
 */
export async function setupMcp(options = {}) {
  const packageRoot = path.resolve(__dirname, '../../..');
  const eckCorePath = path.join(packageRoot, 'scripts', 'mcp-eck-core.js');
  const glmZaiPath = path.join(packageRoot, 'scripts', 'mcp-glm-zai-worker.mjs');
  const mcpServerPath = path.join(packageRoot, 'src', 'mcp-server', 'index.js');

  const targets = [];
  if (options.opencode && !options.both) {
    targets.push('opencode');
  } else if (options.both) {
    targets.push('claude', 'opencode');
  } else {
    targets.push('claude');
  }

  console.log(chalk.blue.bold('\n🔧 EckSnapshot MCP Setup\n'));

  for (const target of targets) {
    if (target === 'claude') {
      await setupForClaude(packageRoot, eckCorePath, glmZaiPath, mcpServerPath, options);
    } else {
      await setupForOpenCode(packageRoot, eckCorePath, glmZaiPath, options);
    }
  }

  // Print summary
  console.log(chalk.green.bold('\n✅ MCP Setup Complete!\n'));
  console.log(chalk.white('Registered MCP servers:'));
  console.log(chalk.cyan('  1. eck-core') + chalk.gray('     → eck_finish_task (commit + snapshot)'));
  console.log(chalk.cyan('  2. glm-zai') + chalk.gray('      → glm_zai_backend, glm_zai_frontend, glm_zai_qa, glm_zai_refactor, glm_zai_general'));
  console.log('');
  console.log(chalk.yellow('Requirements:'));
  console.log(chalk.white('  • ZAI_API_KEY environment variable must be set for GLM Z.AI workers'));
  console.log(chalk.white('  • Get your key at https://z.ai'));
  console.log('');
  console.log(chalk.yellow('Next steps:'));
  console.log(chalk.white('  1. Restart your AI coding tool (Claude Code / OpenCode)'));
  console.log(chalk.white('  2. The tools will be available automatically'));
  console.log(chalk.white('  3. Use --jas or --jao flags to generate CLAUDE.md with delegation protocol'));
  console.log('');
}

/**
 * Register MCP servers for Claude Code using `claude mcp add`
 */
async function setupForClaude(packageRoot, eckCorePath, glmZaiPath, mcpServerPath, options) {
  const spinner = ora();

  console.log(chalk.blue('📦 Setting up for Claude Code...\n'));

  // Method 1: Try `claude mcp add` commands (preferred)
  let usedCliRegistration = false;

  try {
    spinner.start('Checking if `claude` CLI is available...');
    await execa('claude', ['--version']);
    spinner.succeed('Claude CLI found');

    // Helper to register a single MCP server via claude CLI
    async function registerClaudeMcp(name, scriptPath) {
      spinner.start(`Registering ${name} MCP server...`);
      try {
        await execa('claude', ['mcp', 'add', name, '--', 'node', scriptPath]);
        spinner.succeed(`${name} registered`);
      } catch (e) {
        // May already exist - try remove then add
        try {
          await execa('claude', ['mcp', 'remove', name]);
          await execa('claude', ['mcp', 'add', name, '--', 'node', scriptPath]);
          spinner.succeed(`${name} re-registered`);
        } catch (e2) {
          spinner.warn(`${name} registration via CLI failed: ${e2.message}`);
        }
      }
    }

    await registerClaudeMcp('eck-core', eckCorePath);
    await registerClaudeMcp('glm-zai', glmZaiPath);
    await registerClaudeMcp('ecksnapshot', mcpServerPath);

    usedCliRegistration = true;
  } catch {
    spinner.info('Claude CLI not found, will use config file method');
  }

  // Method 2: Also update the config file as fallback / alternative
  spinner.start('Updating Claude Code config file...');

  const homeDir = os.homedir();
  const platform = process.platform;

  let possibleConfigPaths = [];
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    possibleConfigPaths = [
      path.join(appData, 'Claude', 'config.json'),
      path.join(homeDir, '.claude', 'config.json'),
      path.join(homeDir, '.config', 'claude', 'config.json'),
    ];
  } else {
    possibleConfigPaths = [
      path.join(homeDir, '.config', 'claude', 'config.json'),
      path.join(homeDir, '.claude', 'config.json'),
    ];
  }

  let claudeConfigPath = null;
  for (const configPath of possibleConfigPaths) {
    try {
      await fs.access(configPath);
      claudeConfigPath = configPath;
      break;
    } catch { /* continue */ }
  }

  if (!claudeConfigPath) {
    claudeConfigPath = possibleConfigPaths[0];
  }

  let config = {};
  try {
    const content = await fs.readFile(claudeConfigPath, 'utf-8');
    config = JSON.parse(content);
  } catch { /* new config */ }

  if (!config.mcpServers) config.mcpServers = {};

  config.mcpServers.ecksnapshot = {
    command: 'node',
    args: [mcpServerPath],
    env: {},
  };

  config.mcpServers['eck-core'] = {
    command: 'node',
    args: [eckCorePath],
    env: {},
  };

  config.mcpServers['glm-zai'] = {
    command: 'node',
    args: [glmZaiPath],
    env: {},
  };

  // Remove old minimax-worker if present
  if (config.mcpServers['minimax-worker']) {
    delete config.mcpServers['minimax-worker'];
    console.log(chalk.gray('  Removed old minimax-worker MCP server'));
  }

  await fs.mkdir(path.dirname(claudeConfigPath), { recursive: true });
  await fs.writeFile(claudeConfigPath, JSON.stringify(config, null, 2));

  spinner.succeed(`Config saved: ${chalk.cyan(claudeConfigPath)}`);

  // Also update the local .eck/claude-mcp-config.json
  const localConfigPath = path.join(process.cwd(), '.eck', 'claude-mcp-config.json');
  const localConfig = {
    mcpServers: {
      ecksnapshot: config.mcpServers.ecksnapshot,
      'eck-core': config.mcpServers['eck-core'],
      'glm-zai': config.mcpServers['glm-zai'],
    },
  };

  try {
    await fs.mkdir(path.dirname(localConfigPath), { recursive: true });
    await fs.writeFile(localConfigPath, JSON.stringify(localConfig, null, 2));
    spinner.succeed(`Local config updated: ${chalk.cyan(localConfigPath)}`);
  } catch (e) {
    spinner.warn(`Could not update local config: ${e.message}`);
  }
}

/**
 * Register MCP servers for OpenCode.
 * OpenCode uses opencode.json at project root with its own format:
 *   { "mcp": { "name": { "type": "local", "command": [...], "enabled": true } } }
 * The CLI (`opencode mcp add`) is interactive (TUI), so we write the config directly.
 */
async function setupForOpenCode(packageRoot, eckCorePath, glmZaiPath, options) {
  const spinner = ora();

  console.log(chalk.blue('📦 Setting up for OpenCode...\n'));

  const configPath = path.join(process.cwd(), 'opencode.json');

  spinner.start('Updating OpenCode config (opencode.json)...');

  // Read existing config or create new
  let config = {};
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch { /* new config */ }

  // Ensure $schema and base structure
  if (!config.$schema) {
    config.$schema = 'https://opencode.ai/config.json';
  }
  if (!config.mcp) {
    config.mcp = {};
  }

  // Register eck-core
  config.mcp['eck-core'] = {
    type: 'local',
    command: ['node', eckCorePath],
    enabled: true,
    timeout: 30000,
  };

  // Register glm-zai
  config.mcp['glm-zai'] = {
    type: 'local',
    command: ['node', glmZaiPath],
    enabled: true,
    timeout: 120000,
  };

  // Preserve ZAI_API_KEY in environment if it was set before
  if (process.env.ZAI_API_KEY) {
    config.mcp['glm-zai'].environment = {
      ZAI_API_KEY: process.env.ZAI_API_KEY,
    };
  }

  // Remove old minimax entries if present
  if (config.mcp['minimax-worker']) {
    delete config.mcp['minimax-worker'];
    console.log(chalk.gray('  Removed old minimax-worker from opencode.json'));
  }

  // Ensure AGENTS.md is in instructions
  if (!config.instructions) {
    config.instructions = ['AGENTS.md'];
  } else if (!config.instructions.includes('AGENTS.md')) {
    config.instructions.push('AGENTS.md');
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  spinner.succeed(`OpenCode config updated: ${chalk.cyan(configPath)}`);

  console.log(chalk.gray('\n  OpenCode will read MCP servers from opencode.json on next start.'));
  console.log(chalk.gray('  Use `eck-snapshot --jas` or `--jao` to generate AGENTS.md for OpenCode.\n'));
}
