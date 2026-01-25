import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Setup Claude Code MCP integration for ecksnapshot
 */
export async function setupClaudeMcp(options = {}) {
  console.log(chalk.blue.bold('\n🔧 EckSnapshot MCP Server Setup for Claude Code\n'));

  const spinner = ora();

  try {
    // Step 1: Detect Claude Code config location
    spinner.start('Detecting Claude Code configuration location...');

    const homeDir = os.homedir();
    const platform = process.platform;

    // Platform-specific default paths (in order of preference)
    let possibleConfigPaths = [];
    let defaultConfigPath = null;

    if (platform === 'win32') {
      // Windows
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      defaultConfigPath = path.join(appData, 'Claude', 'config.json');
      possibleConfigPaths = [
        defaultConfigPath,
        path.join(homeDir, '.claude', 'config.json'),
        path.join(homeDir, '.config', 'claude', 'config.json'),
      ];
    } else {
      // Linux/Mac
      defaultConfigPath = path.join(homeDir, '.config', 'claude', 'config.json');
      possibleConfigPaths = [
        defaultConfigPath,
        path.join(homeDir, '.claude', 'config.json'),
      ];
    }

    // Try to find existing config
    let claudeConfigPath = null;
    for (const configPath of possibleConfigPaths) {
      try {
        await fs.access(configPath);
        claudeConfigPath = configPath;
        break;
      } catch {
        // Continue checking
      }
    }

    if (!claudeConfigPath) {
      // No existing config found - offer to create at default location
      spinner.info(`No existing Claude Code config found`);

      const { shouldCreateDefault } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldCreateDefault',
          message: `Create new config at: ${chalk.cyan(defaultConfigPath)}?`,
          default: true,
        },
      ]);

      if (shouldCreateDefault) {
        claudeConfigPath = defaultConfigPath;
        spinner.succeed(`Will create config at: ${chalk.cyan(claudeConfigPath)}`);
      } else {
        const { customPath } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customPath',
            message: 'Enter custom path for config.json (or press Enter to skip):',
            default: '',
          },
        ]);

        if (customPath) {
          claudeConfigPath = customPath;
        } else {
          // Create template in project directory
          console.log(chalk.yellow('\n⚠️  Creating template in project directory'));
          claudeConfigPath = path.join(process.cwd(), '.eck', 'claude-mcp-config.json');
        }
      }
    } else {
      spinner.succeed(`Found Claude Code config at: ${chalk.cyan(claudeConfigPath)}`);
    }

    // Step 2: Get the path to the MCP server
    spinner.start('Locating MCP server...');

    // Find the installed package location
    const packageRoot = path.resolve(__dirname, '../../..');
    const mcpServerPath = path.join(packageRoot, 'src', 'mcp-server', 'index.js');

    try {
      await fs.access(mcpServerPath);
      spinner.succeed(`MCP server found at: ${chalk.cyan(mcpServerPath)}`);
    } catch {
      spinner.fail('MCP server not found');
      throw new Error(`MCP server not found at ${mcpServerPath}`);
    }

    // Step 3: Read or create config
    spinner.start('Reading Claude Code configuration...');

    let config = {};
    try {
      const configContent = await fs.readFile(claudeConfigPath, 'utf-8');
      config = JSON.parse(configContent);
      spinner.succeed('Configuration loaded');
    } catch {
      spinner.info('Creating new configuration');
      config = {
        mcpServers: {},
      };
    }

    // Step 4: Add or update MCP server configuration
    spinner.start('Configuring EckSnapshot MCP server...');

    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    config.mcpServers.ecksnapshot = {
      command: 'node',
      args: [mcpServerPath],
      env: {},
    };

    spinner.succeed('MCP server configuration added');

    // Step 5: Write config back
    spinner.start('Saving configuration...');

    await fs.mkdir(path.dirname(claudeConfigPath), { recursive: true });
    await fs.writeFile(claudeConfigPath, JSON.stringify(config, null, 2));

    spinner.succeed(`Configuration saved to: ${chalk.cyan(claudeConfigPath)}`);

    // Step 6: Create templates for other projects
    spinner.start('Creating reusable templates...');

    const templatesDir = path.join(packageRoot, 'src', 'templates', 'claude-code');
    await fs.mkdir(templatesDir, { recursive: true });

    // Template 1: MCP server code
    const mcpServerTemplate = await fs.readFile(mcpServerPath, 'utf-8');
    await fs.writeFile(
      path.join(templatesDir, 'mcp-server-template.js'),
      mcpServerTemplate
    );

    // Template 2: Configuration snippet
    const configTemplate = {
      mcpServers: {
        ecksnapshot: {
          command: 'node',
          args: ['<PATH_TO_MCP_SERVER>/src/mcp-server/index.js'],
          env: {},
        },
      },
    };
    await fs.writeFile(
      path.join(templatesDir, 'mcp-config-template.json'),
      JSON.stringify(configTemplate, null, 2)
    );

    // Template 3: Setup instructions
    const instructions = `# EckSnapshot MCP Server Setup

## Automatic Setup (Recommended)

Run this command in your project:

\`\`\`bash
eck-snapshot setup-claude-mcp
\`\`\`

This will automatically configure Claude Code to use the EckSnapshot MCP server.

## Manual Setup

### 1. Copy MCP Server

Copy \`src/mcp-server/index.js\` to your project:

\`\`\`bash
mkdir -p .eck/mcp-server
cp src/templates/claude-code/mcp-server-template.js .eck/mcp-server/index.js
\`\`\`

### 2. Update Claude Code Config

Add to your Claude Code config (\`~/.claude/config.json\` or \`~/.config/claude/config.json\`):

\`\`\`json
{
  "mcpServers": {
    "ecksnapshot": {
      "command": "node",
      "args": ["/absolute/path/to/your/project/.eck/mcp-server/index.js"]
    }
  }
}
\`\`\`

### 3. Restart Claude Code

Restart Claude Code CLI or IDE extension to load the MCP server.

## Available Tools

### \`eck_finish_task\`

Finalizes a completed task by:
1. Updating \`.eck/AnswerToSA.md\` with status
2. Creating a git commit with proper message
3. Optionally generating an update snapshot

**Parameters:**
- \`status\` (required): Status message for AnswerToSA.md
- \`commitMessage\` (required): Git commit message (conventional commits format)
- \`includeUpdate\` (optional): Generate update snapshot after commit (default: false)

**Example:**

The MCP tool is automatically called by Claude when a task is complete according to CLAUDE.md instructions.

## Troubleshooting

### MCP server not appearing

1. Check Claude Code config path:
   - Linux/Mac: \`~/.config/claude/config.json\` or \`~/.claude/config.json\`
   - Windows: \`%APPDATA%\\Claude\\config.json\`

2. Verify the absolute path to \`index.js\` is correct

3. Restart Claude Code completely

### Tool not being called

1. Check that CLAUDE.md mentions \`eck_finish_task\` tool
2. Verify MCP server is running (check Claude Code logs)
3. Try manually calling the tool in Claude Code

## Template Files

- \`mcp-server-template.js\`: The MCP server implementation
- \`mcp-config-template.json\`: Claude Code configuration snippet
- \`README.md\`: This file

## Copying to Other Projects

1. Copy the entire \`src/templates/claude-code/\` directory to your new project
2. Run setup or manually configure as described above
3. Update paths in the configuration to match your new project structure
`;

    await fs.writeFile(path.join(templatesDir, 'README.md'), instructions);

    spinner.succeed(`Templates created in: ${chalk.cyan(templatesDir)}`);

    // Success message
    console.log(chalk.green.bold('\n✅ Setup Complete!\n'));
    console.log(chalk.white('The EckSnapshot MCP server has been configured for Claude Code.\n'));
    console.log(chalk.yellow('Next steps:'));
    console.log(chalk.white('1. Restart Claude Code (CLI or IDE extension)'));
    console.log(chalk.white('2. The tool "eck_finish_task" will be available to Claude'));
    console.log(chalk.white('3. Claude will automatically use it when tasks are complete\n'));

    console.log(chalk.cyan('Templates for other projects:'));
    console.log(chalk.white(`  ${templatesDir}\n`));

    if (options.verbose) {
      console.log(chalk.gray('Configuration details:'));
      console.log(chalk.gray(JSON.stringify(config.mcpServers.ecksnapshot, null, 2)));
    }

    return {
      success: true,
      configPath: claudeConfigPath,
      mcpServerPath,
      templatesDir,
    };
  } catch (error) {
    spinner.fail('Setup failed');
    console.error(chalk.red(`\n❌ Error: ${error.message}\n`));

    if (options.verbose) {
      console.error(chalk.gray(error.stack));
    }

    throw error;
  }
}
