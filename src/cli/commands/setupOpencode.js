import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

/**
 * Sets up opencode.json for OpenCode integration with GLM ZAI MCP servers
 * @param {Object} options - Command options
 */
export async function setupOpencode(options = {}) {
  console.log(chalk.blue('🔧 Configuring OpenCode integration with GLM ZAI...'));

  // Step 1: Validate environment - Check for ZAI API key
  const zaiApiKey = process.env.ZAI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  if (!zaiApiKey) {
    console.log(chalk.red(''));
    console.log(chalk.red('❌ ZAI API key not found!'));
    console.log(chalk.yellow(''));
    console.log(chalk.yellow('You must set one of the following environment variables:'));
    console.log(chalk.cyan('   • ZAI_API_KEY'));
    console.log(chalk.cyan('   • ANTHROPIC_AUTH_TOKEN'));
    console.log(chalk.yellow(''));
    console.log(chalk.yellow('Get your API key from: https://z.ai/manage-apikey/apikey-list'));
    console.log(chalk.yellow(''));
    console.log(chalk.yellow('After setting the environment variable, run:'));
    console.log(chalk.cyan('   eck-snapshot setup-opencode'));
    console.log('');
    process.exit(1);
  }

  console.log(chalk.green('✅ ZAI API key found in environment'));

  // Step 2: Resolve MCP server paths
  const mcpCorePath = path.join(PROJECT_ROOT, 'scripts', 'mcp-eck-core.js');
  const mcpGlmPath = path.join(PROJECT_ROOT, 'scripts', 'mcp-glm-zai-worker.js');

  // Verify files exist
  try {
    await fs.access(mcpCorePath);
    console.log(chalk.green(`✅ Found eck-core MCP server: ${mcpCorePath}`));
  } catch (error) {
    console.log(chalk.red(`❌ eck-core MCP server not found at: ${mcpCorePath}`));
    console.log(chalk.yellow('Make sure you are running this command from the eck-snapshot project directory'));
    process.exit(1);
  }

  try {
    await fs.access(mcpGlmPath);
    console.log(chalk.green(`✅ Found GLM ZAI MCP server: ${mcpGlmPath}`));
  } catch (error) {
    console.log(chalk.red(`❌ GLM ZAI MCP server not found at: ${mcpGlmPath}`));
    console.log(chalk.yellow('Make sure scripts/mcp-glm-zai-worker.js exists'));
    process.exit(1);
  }

  // Step 3: Generate opencode.json configuration
  const opencodeConfig = {
    mcp: {
      "eck-core": {
        type: "local",
        command: ["node", mcpCorePath],
        enabled: true,
        timeout: 30000
      },
      "glm-zai": {
        type: "local",
        command: ["node", mcpGlmPath],
        environment: {
          "ZAI_API_KEY": zaiApiKey
        },
        enabled: true,
        timeout: 120000
      }
    },
    instructions: ["AGENTS.md"],
    experimental: {
      mcp_timeout: 120000
    }
  };

  // Step 4: Merge with existing config if it exists
  const configPath = path.join(process.cwd(), 'opencode.json');
  let finalConfig = opencodeConfig;

  try {
    const existingRaw = await fs.readFile(configPath, 'utf-8');
    const existing = JSON.parse(existingRaw);

    console.log(chalk.yellow('⚠️  Found existing opencode.json, merging configurations...'));

    // Merge mcp servers
    finalConfig = {
      ...existing,
      mcp: {
        ...(existing.mcp || {}),
        ...opencodeConfig.mcp
      },
      // Merge instructions, ensuring no duplicates
      instructions: [
        ...(existing.instructions || []),
        ...opencodeConfig.instructions.filter(
          instr => !existing.instructions?.includes(instr)
        )
      ],
      // Merge experimental settings
      experimental: {
        ...(existing.experimental || {}),
        ...opencodeConfig.experimental
      }
    };

    console.log(chalk.cyan(`   • Preserved existing MCP servers: ${Object.keys(existing.mcp || {}).join(', ')}`));
  } catch (error) {
    // File doesn't exist, that's fine
    console.log(chalk.blue('📄 Creating new opencode.json'));
  }

  // Step 5: Write configuration
  try {
    await fs.writeFile(configPath, JSON.stringify(finalConfig, null, 2), 'utf-8');
    console.log(chalk.green(`✅ Created opencode.json at: ${configPath}`));
  } catch (error) {
    console.log(chalk.red(`❌ Failed to write opencode.json: ${error.message}`));
    process.exit(1);
  }

  // Step 6: Success summary
  console.log(chalk.green(''));
  console.log(chalk.green('🎉 Setup completed successfully!'));
  console.log(chalk.blue(''));
  console.log(chalk.blue('📋 Configuration summary:'));
  console.log(chalk.cyan(`   • MCP server: eck-core (timeout: 30s)`));
  console.log(chalk.cyan(`   • MCP server: glm-zai (timeout: 120s)`));
  console.log(chalk.cyan(`   • Instructions: AGENTS.md`));
  console.log(chalk.cyan(`   • ZAI API key: ${zaiApiKey.substring(0, 20)}...${zaiApiKey.slice(-4)}`));
  console.log('');
  console.log(chalk.blue('🚀 Next steps:'));
  console.log(chalk.cyan('   1. Restart OpenCode to load MCP servers'));
  console.log(chalk.cyan('   2. Run: eck-snapshot --skeleton'));
  console.log(chalk.cyan('   3. Start OpenCode: opencode'));
  console.log(chalk.green(''));
  console.log(chalk.green('✨ OpenCode is now configured with GLM ZAI integration!'));
  console.log('');
}
