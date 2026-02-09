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
    await execa('claude', ['--version'], { shell: true });
    spinner.succeed('Claude CLI found');

    // Register eck-core (eck_finish_task)
    spinner.start('Registering eck-core MCP server...');
    try {
      await execa('claude', ['mcp', 'add', 'eck-core', '--', 'node', eckCorePath], { shell: true });
      spinner.succeed('eck-core registered');
    } catch (e) {
      // May already exist - try remove then add
      try {
        await execa('claude', ['mcp', 'remove', 'eck-core'], { shell: true });
        await execa('claude', ['mcp', 'add', 'eck-core', '--', 'node', eckCorePath], { shell: true });
        spinner.succeed('eck-core re-registered');
      } catch (e2) {
        spinner.warn(`eck-core registration via CLI failed: ${e2.message}`);
      }
    }

    // Register glm-zai (GLM-4.7 workers)
    spinner.start('Registering glm-zai MCP server...');
    try {
      await execa('claude', ['mcp', 'add', 'glm-zai', '--', 'node', glmZaiPath], { shell: true });
      spinner.succeed('glm-zai registered');
    } catch (e) {
      try {
        await execa('claude', ['mcp', 'remove', 'glm-zai'], { shell: true });
        await execa('claude', ['mcp', 'add', 'glm-zai', '--', 'node', glmZaiPath], { shell: true });
        spinner.succeed('glm-zai re-registered');
      } catch (e2) {
        spinner.warn(`glm-zai registration via CLI failed: ${e2.message}`);
      }
    }

    // Also register the main ecksnapshot MCP server (eck_finish_task with AnswerToSA.md integration)
    spinner.start('Registering ecksnapshot MCP server...');
    try {
      await execa('claude', ['mcp', 'add', 'ecksnapshot', '--', 'node', mcpServerPath], { shell: true });
      spinner.succeed('ecksnapshot registered');
    } catch (e) {
      try {
        await execa('claude', ['mcp', 'remove', 'ecksnapshot'], { shell: true });
        await execa('claude', ['mcp', 'add', 'ecksnapshot', '--', 'node', mcpServerPath], { shell: true });
        spinner.succeed('ecksnapshot re-registered');
      } catch (e2) {
        spinner.warn(`ecksnapshot registration via CLI failed: ${e2.message}`);
      }
    }

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
 * Register MCP servers for OpenCode
 * OpenCode uses a different config format - generates opencode.json MCP config
 */
async function setupForOpenCode(packageRoot, eckCorePath, glmZaiPath, options) {
  const spinner = ora();

  console.log(chalk.blue('📦 Setting up for OpenCode...\n'));

  // OpenCode typically uses a config file in the project or home directory
  // Try to detect opencode config location
  const homeDir = os.homedir();
  const possiblePaths = [
    path.join(process.cwd(), '.opencode', 'mcp.json'),
    path.join(process.cwd(), 'opencode.json'),
    path.join(homeDir, '.opencode', 'mcp.json'),
    path.join(homeDir, '.config', 'opencode', 'mcp.json'),
  ];

  // Also try to use `opencode` CLI if available
  let usedCli = false;
  try {
    spinner.start('Checking if `opencode` CLI is available...');
    await execa('opencode', ['--version'], { shell: true });
    spinner.succeed('OpenCode CLI found');

    // Try registering via CLI
    try {
      spinner.start('Registering MCP servers via OpenCode CLI...');
      await execa('opencode', ['mcp', 'add', 'eck-core', '--', 'node', eckCorePath], { shell: true });
      await execa('opencode', ['mcp', 'add', 'glm-zai', '--', 'node', glmZaiPath], { shell: true });
      spinner.succeed('MCP servers registered via OpenCode CLI');
      usedCli = true;
    } catch (e) {
      spinner.warn(`OpenCode CLI registration failed: ${e.message}`);
    }
  } catch {
    spinner.info('OpenCode CLI not found, using config file method');
  }

  if (!usedCli) {
    // Generate config file
    spinner.start('Generating OpenCode MCP config...');

    const openCodeMcpConfig = {
      mcpServers: {
        'eck-core': {
          command: 'node',
          args: [eckCorePath],
        },
        'glm-zai': {
          command: 'node',
          args: [glmZaiPath],
        },
      },
    };

    // Save to project directory
    const configDir = path.join(process.cwd(), '.opencode');
    const configPath = path.join(configDir, 'mcp.json');

    try {
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(openCodeMcpConfig, null, 2));
      spinner.succeed(`OpenCode MCP config saved: ${chalk.cyan(configPath)}`);
    } catch (e) {
      spinner.warn(`Could not save OpenCode config: ${e.message}`);
    }

    console.log(chalk.gray('\n  If OpenCode uses a different config path, copy:'));
    console.log(chalk.gray(`  ${configPath}`));
    console.log(chalk.gray('  to your OpenCode MCP configuration directory.\n'));
  }
}
