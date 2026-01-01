import which from 'which';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import chalk from 'chalk';

/**
 * Sets up claude.toml configuration for gemini-cli integration with dynamic paths
 * @param {Object} options - Command options
 */
export async function setupGemini(options = {}) {
  try {
    console.log(chalk.blue('🔧 Setting up gemini-cli integration with dynamic paths...'));

    // Check if gemini-cli is installed
    let geminiCliPath;
    try {
      geminiCliPath = await which('gemini-cli');
      console.log(chalk.green(`✅ Found gemini-cli at: ${geminiCliPath}`));
    } catch (error) {
      console.error(chalk.red('❌ gemini-cli not found in PATH'));
      console.log(chalk.yellow('💡 Please install gemini-cli first:'));
      console.log(chalk.cyan('   npm install -g gemini-cli'));
      process.exit(1);
    }

    // Get current working directory for dynamic path resolution
    const currentDir = process.cwd();
    const indexJsPath = path.join(currentDir, 'index.js');

    // Verify index.js exists
    try {
      await fs.access(indexJsPath);
      console.log(chalk.green(`✅ Found eck-snapshot index.js at: ${indexJsPath}`));
    } catch (error) {
      console.error(chalk.red(`❌ Could not find index.js at: ${indexJsPath}`));
      console.log(chalk.yellow('💡 Make sure you are running this command from the eck-snapshot project directory'));
      process.exit(1);
    }

    // Create gemini tools directory
    const homeDir = os.homedir();
    const geminiToolsDir = path.join(homeDir, '.gemini', 'tools');

    try {
      await fs.mkdir(geminiToolsDir, { recursive: true });
      console.log(chalk.green(`✅ Created/verified gemini tools directory: ${geminiToolsDir}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to create gemini tools directory: ${error.message}`));
      process.exit(1);
    }

    // Read environment variables from setup.json if available
    let envVars = {};
    try {
      const setupJsonPath = path.join(currentDir, 'setup.json');
      const setupContent = await fs.readFile(setupJsonPath, 'utf-8');
      const setupData = JSON.parse(setupContent);

      // Extract relevant environment variables
      if (setupData.environmentDetection) {
        envVars.ECK_SNAPSHOT_PATH = currentDir;
        console.log(chalk.blue(`📋 Using project context from setup.json`));
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  setup.json not found or invalid, using defaults'));
    }

    // Generate claude.toml content with dynamic paths
    const claudeTomlContent = generateClaudeToml(indexJsPath, envVars);

    // Write claude.toml file
    const claudeTomlPath = path.join(geminiToolsDir, 'claude.toml');
    try {
      await fs.writeFile(claudeTomlPath, claudeTomlContent, 'utf-8');
      console.log(chalk.green(`✅ Generated claude.toml at: ${claudeTomlPath}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to write claude.toml: ${error.message}`));
      process.exit(1);
    }

    // Success summary
    console.log(chalk.green('\n🎉 Setup completed successfully!'));
    console.log(chalk.blue('\n📋 Configuration summary:'));
    console.log(chalk.cyan(`   • gemini-cli: ${geminiCliPath}`));
    console.log(chalk.cyan(`   • eck-snapshot: ${indexJsPath}`));
    console.log(chalk.cyan(`   • claude.toml: ${claudeTomlPath}`));

    if (Object.keys(envVars).length > 0) {
      console.log(chalk.cyan(`   • Environment variables: ${Object.keys(envVars).join(', ')}`));
    }

    console.log(chalk.blue('\n🚀 You can now use:'));
    console.log(chalk.cyan('   gemini-cli claude "Your prompt here"'));
    console.log(chalk.green('\n✨ Cross-platform path resolution is automatically handled!'));

  } catch (error) {
    console.error(chalk.red(`❌ Setup failed: ${error.message}`));
    if (options.verbose) {
      console.error(chalk.red('Stack trace:'), error.stack);
    }
    process.exit(1);
  }
}

/**
 * Generates claude.toml content with dynamic paths
 * @param {string} indexJsPath - Path to eck-snapshot index.js
 * @param {Object} envVars - Environment variables to include
 * @returns {string} - Generated TOML content
 */
function generateClaudeToml(indexJsPath, envVars = {}) {
  const envSection = Object.keys(envVars).length > 0
    ? `# Environment variables from setup.json
${Object.entries(envVars).map(([key, value]) => `${key} = "${value}"`).join('\n')}

`
    : '';

  return `# Claude.toml - Dynamic configuration for eck-snapshot integration
# Generated automatically by 'eck-snapshot setup-gemini'
# This file uses dynamic paths to work across WSL/Windows environments

${envSection}[claude]
# eck-snapshot integration for AI-powered repository analysis
name = "eck-snapshot"
description = "AI-powered repository snapshot and analysis tool with cross-platform support"
command = "node"
args = ["${indexJsPath}", "ask-claude"]

# Command examples:
# gemini-cli claude "Create a snapshot of the current project"
# gemini-cli claude "Analyze the database structure"
# gemini-cli claude "Generate a project overview"

[claude.metadata]
version = "5.0.0"
author = "eck-snapshot"
generated_at = "${new Date().toISOString()}"
platform = "${process.platform}"
node_version = "${process.version}"
working_directory = "${path.dirname(indexJsPath)}"

# Cross-platform compatibility notes:
# - Paths are automatically resolved using process.cwd()
# - Works in WSL, Windows, macOS, and Linux
# - No hardcoded /mnt/c/ paths required
`;
}