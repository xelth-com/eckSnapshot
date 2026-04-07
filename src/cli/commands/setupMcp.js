import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import os from 'os';
import { execa } from 'execa';
import { fileURLToPath } from 'url';
import { ensureSnapshotsInGitignore } from '../../utils/fileUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Walk up from cwd to find the project root (directory containing .git or package.json).
 * Falls back to cwd if no marker is found.
 */
function findProjectRoot() {
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    try {
      const entries = fsSync.readdirSync(dir);
      if (entries.includes('.git') || entries.includes('package.json')) {
        return dir;
      }
    } catch { /* unreadable dir, keep going */ }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Setup / Restore MCP servers for Claude Code, OpenCode, and Codex.
 * Registers:
 *   1. eck-core     (eck_finish_task) - commit + snapshot
 *   2. glm-zai      (glm_zai_*) - GLM-4.7 coding workers
 *
 * Usage:
 *   eck-snapshot setup-mcp              # Auto-detect and register for Claude Code & Codex
 *   eck-snapshot setup-mcp --opencode   # Register for OpenCode
 *   eck-snapshot setup-mcp --both       # Register for all
 */
export async function setupMcp(options = {}) {
  const packageRoot = path.resolve(__dirname, '../../..');
  const projectRoot = findProjectRoot();
  const eckCorePath = path.join(packageRoot, 'scripts', 'mcp-eck-core.js');
  const glmZaiPath = path.join(packageRoot, 'scripts', 'mcp-glm-zai-worker.mjs');
  const targets = [];
  if (options.opencode && !options.both) {
    targets.push('opencode');
  } else if (options.both) {
    targets.push('claude', 'opencode');
  } else {
    targets.push('claude');
  }

  console.log(chalk.blue.bold('\n🔧 EckSnapshot MCP Setup\n'));
  if (projectRoot !== process.cwd()) {
    console.log(chalk.gray(`  Project root: ${projectRoot}\n`));
  }

  for (const target of targets) {
    if (target === 'claude') {
      await setupForClaude(packageRoot, eckCorePath, glmZaiPath, options, projectRoot);
    } else {
      await setupForOpenCode(packageRoot, eckCorePath, glmZaiPath, options, projectRoot);
    }
  }

  // Auto-detect Codex
  const codexDir = path.join(projectRoot, '.codex');
  let hasCodex = false;
  try {
    await fs.access(codexDir);
    hasCodex = true;
  } catch {}

  if (hasCodex) {
    await setupForCodex(packageRoot, eckCorePath, glmZaiPath, options, projectRoot);
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
  console.log(chalk.white('  1. Restart your AI coding tool'));
  console.log(chalk.white('  2. The tools will be available automatically'));
  console.log('');
}

/**
 * Register MCP servers for Claude Code using `claude mcp add`
 */
async function setupForClaude(packageRoot, eckCorePath, glmZaiPath, options, projectRoot) {
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

  // Remove old ecksnapshot server if present
  if (config.mcpServers.ecksnapshot) {
    delete config.mcpServers.ecksnapshot;
  }

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
  const localConfigPath = path.join(projectRoot, '.eck', 'claude-mcp-config.json');
  const localConfig = {
    mcpServers: {
      'eck-core': config.mcpServers['eck-core'],
      'glm-zai': config.mcpServers['glm-zai'],
    },
  };

  try {
    await fs.mkdir(path.dirname(localConfigPath), { recursive: true });
    await ensureSnapshotsInGitignore(projectRoot);
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
async function setupForOpenCode(packageRoot, eckCorePath, glmZaiPath, options, projectRoot) {
  const spinner = ora();

  console.log(chalk.blue('📦 Setting up for OpenCode...\n'));

  const configPath = path.join(projectRoot, 'opencode.json');

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

  // Remove old minimax entries if present
  if (config.mcp['minimax-worker']) {
    delete config.mcp['minimax-worker'];
    console.log(chalk.gray('  Removed old minimax-worker from opencode.json'));
  }

  // Add permissions only if not already configured
  // List all tools explicitly with "allow", then "*" as fallback for future tools
  // Order matters: last matching rule wins, so users can override specific tools
  if (!config.permission) {
    config.permission = {
      "read": "allow",
      "edit": "allow",
      "glob": "allow",
      "grep": "allow",
      "list": "allow",
      "bash": "allow",
      "task": "allow",
      "skill": "allow",
      "lsp": "allow",
      "todoread": "allow",
      "todowrite": "allow",
      "webfetch": "allow",
      "websearch": "allow",
      "codesearch": "allow",
      "external_directory": "allow",
      "doom_loop": "allow",
      "*": "allow"
    };
    console.log(chalk.gray('  Added default permissions (allow all) - modify in opencode.json to restrict'));
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
  console.log(chalk.gray('  Use `eck-snapshot \'{"name": "eck_snapshot", "arguments": {"jas": true}}\'` to generate AGENTS.md.\n'));
}

/**
 * Register MCP servers for Codex by appending to .codex/config.toml
 */
async function setupForCodex(packageRoot, eckCorePath, glmZaiPath, options, projectRoot) {
  const spinner = ora();
  console.log(chalk.blue('📦 Setting up for Codex...\n'));
  spinner.start('Updating Codex config (.codex/config.toml)...');

  try {
    const updated = await ensureProjectCodexConfig(projectRoot);
    if (updated) {
      spinner.succeed(`Codex config updated: ${chalk.cyan('.codex/config.toml')}`);
    } else {
      spinner.info(`Codex config already up to date: ${chalk.cyan('.codex/config.toml')}`);
    }
  } catch (error) {
    spinner.fail(`Failed to update Codex config: ${error.message}`);
  }
}

/**
 * Silently ensure .codex/config.toml exists in target project root with eck-core configured.
 * Called automatically during snapshot creation so any Codex session
 * in that project will have eck_finish_task / eck_fail_task available.
 *
 * @param {string} repoPath - Target project root
 * @returns {boolean} true if config was created/updated, false if already OK
 */
export async function ensureProjectCodexConfig(repoPath) {
  const codexDir = path.join(repoPath, '.codex');
  try {
    await fs.access(codexDir);
  } catch {
    return false; // No .codex directory, do nothing
  }

  const packageRoot = path.resolve(__dirname, '../../..');
  const eckCorePath = path.join(packageRoot, 'scripts', 'mcp-eck-core.js');
  const glmZaiPath = path.join(packageRoot, 'scripts', 'mcp-glm-zai-worker.mjs');
  const configPath = path.join(codexDir, 'config.toml');

  let content = '';
  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch { /* file might not exist yet */ }

  let updated = false;

  // Simple string inclusion check (safe enough for TOML injection)
  if (!content.includes('[mcp_servers.eck-core]')) {
    content += `\n\n[mcp_servers.eck-core]\ncommand = "node"\nargs = ["${eckCorePath.replace(/\\/g, '\\\\')}"]\n`;
    updated = true;
  }

  if (!content.includes('[mcp_servers.glm-zai]')) {
    content += `\n\n[mcp_servers.glm-zai]\ncommand = "node"\nargs = ["${glmZaiPath.replace(/\\/g, '\\\\')}"]\n`;
    updated = true;
  }

  if (updated) {
    await fs.writeFile(configPath, content.trim() + '\n', 'utf-8');
    return true;
  }

  return false;
}

/**
 * Silently ensure .mcp.json exists in target project root with eck-core configured.
 * Called automatically during snapshot creation so any Claude Code session
 * in that project will have eck_finish_task / eck_fail_task available.
 *
 * @param {string} repoPath - Target project root
 * @returns {boolean} true if file was created/updated, false if already OK
 */
export async function ensureProjectMcpConfig(repoPath) {
  const packageRoot = path.resolve(__dirname, '../../..');
  const eckCorePath = path.join(packageRoot, 'scripts', 'mcp-eck-core.js');
  const mcpJsonPath = path.join(repoPath, '.mcp.json');

  // Read existing .mcp.json if present
  let config = {};
  try {
    const content = await fs.readFile(mcpJsonPath, 'utf-8');
    config = JSON.parse(content);
  } catch { /* doesn't exist yet */ }

  // Ensure root mcpServers key exists (required by Claude Code schema)
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // Check if eck-core is already configured with correct path
  if (config.mcpServers['eck-core'] &&
      config.mcpServers['eck-core'].command === 'node' &&
      config.mcpServers['eck-core'].args?.[0] === eckCorePath) {
    return false; // Already up to date
  }

  // Add/update eck-core inside mcpServers
  config.mcpServers['eck-core'] = {
    command: 'node',
    args: [eckCorePath]
  };

  await fs.writeFile(mcpJsonPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  // Ensure .mcp.json is in .gitignore (it contains absolute paths)
  try {
    const gitignorePath = path.join(repoPath, '.gitignore');
    let gitignore = '';
    try {
      gitignore = await fs.readFile(gitignorePath, 'utf-8');
    } catch { /* no .gitignore */ }

    if (!gitignore.includes('.mcp.json')) {
      const suffix = gitignore.endsWith('\n') || gitignore === '' ? '' : '\n';
      await fs.writeFile(gitignorePath, gitignore + suffix + '.mcp.json\n', 'utf-8');
    }
  } catch { /* non-critical */ }

  return true;
}

/**
 * Silently ensure local opencode.json exists in target project root with eck-core configured.
 * Called automatically during snapshot creation so any OpenCode session
 * in that project will have eck_finish_task / eck_fail_task available.
 *
 * @param {string} repoPath - Target project root
 * @returns {boolean} true if config was created/updated, false if already OK
 */
export async function ensureProjectOpenCodeConfig(repoPath) {
  const packageRoot = path.resolve(__dirname, '../../..');
  const eckCorePath = path.join(packageRoot, 'scripts', 'mcp-eck-core.js');
  const configPath = path.join(repoPath, 'opencode.json');

  // Read existing config or create new
  let config = {};
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch { /* new config */ }

  // Ensure mcp key exists
  if (!config.mcp) {
    config.mcp = {};
  }

  // Check if eck-core is already configured with correct path
  if (config.mcp['eck-core'] &&
      config.mcp['eck-core'].type === 'local' &&
      config.mcp['eck-core'].command?.[0] === 'node' &&
      config.mcp['eck-core'].command?.[1] === eckCorePath) {
    // Still need to check instructions
    if (config.instructions && config.instructions.includes('AGENTS.md')) {
      return false; // Already up to date
    }
  } else {
    // Add/update eck-core
    config.mcp['eck-core'] = {
      type: 'local',
      command: ['node', eckCorePath],
      enabled: true,
      timeout: 30000,
    };
  }

  // Ensure AGENTS.md is in instructions
  if (!config.instructions) {
    config.instructions = ['AGENTS.md'];
  } else if (!config.instructions.includes('AGENTS.md')) {
    config.instructions.push('AGENTS.md');
  }

  // Add permissions only if not already configured
  // List all tools explicitly with "allow", then "*" as fallback for future tools
  // Order matters: last matching rule wins, so users can override specific tools
  if (!config.permission) {
    config.permission = {
      "read": "allow",
      "edit": "allow",
      "glob": "allow",
      "grep": "allow",
      "list": "allow",
      "bash": "allow",
      "task": "allow",
      "skill": "allow",
      "lsp": "allow",
      "todoread": "allow",
      "todowrite": "allow",
      "webfetch": "allow",
      "websearch": "allow",
      "codesearch": "allow",
      "external_directory": "allow",
      "doom_loop": "allow",
      "*": "allow"
    };
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  return true;
}
