import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Apply Claude Code settings preset
 * @param {string} preset - Preset name ('claude' or 'glm-zai')
 * @param {object} options - Command options
 */
export async function applyClaudeSettings(preset, options = {}) {
  const spinner = ora();

  try {
    // Step 1: Determine settings file path
    const homeDir = os.homedir();
    const platform = process.platform;

    let settingsPath;
    if (platform === 'win32') {
      // Windows: C:\Users\<username>\.claude\settings.json
      settingsPath = path.join(homeDir, '.claude', 'settings.json');
    } else {
      // Linux/Mac: ~/.claude/settings.json
      settingsPath = path.join(homeDir, '.claude', 'settings.json');
    }

    spinner.start(`Applying ${chalk.cyan(preset)} settings preset...`);

    // Step 2: Load template
    const packageRoot = path.resolve(__dirname, '../../..');
    const templatePath = path.join(
      packageRoot,
      'src',
      'templates',
      'claude-code',
      `settings-${preset}.json`
    );

    let settingsContent;
    try {
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      settingsContent = templateContent;
    } catch (error) {
      spinner.fail(`Template not found: ${templatePath}`);
      throw new Error(`Settings preset '${preset}' not found`);
    }

    // Step 3: Ensure .claude directory exists
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });

    // Step 4: Write settings
    await fs.writeFile(settingsPath, settingsContent, 'utf-8');

    spinner.succeed(`Settings updated: ${chalk.cyan(settingsPath)}`);

    // Show what was applied
    if (options.verbose) {
      console.log(chalk.gray('\nApplied settings:'));
      console.log(chalk.gray(settingsContent));
    } else {
      const settings = JSON.parse(settingsContent);
      if (preset === 'claude') {
        console.log(chalk.green('✓ Standard Claude settings (empty config)'));
      } else if (preset === 'glm-zai') {
        console.log(chalk.green('✓ GLM Z.AI proxy settings applied'));
        console.log(chalk.yellow('\n⚠️  Remember to set ZAI_API_KEY environment variable'));
      }
    }

    console.log(chalk.cyan('\n💡 Restart Claude Code for changes to take effect\n'));

    return {
      success: true,
      settingsPath,
      preset,
    };
  } catch (error) {
    spinner.fail('Failed to apply settings');
    console.error(chalk.red(`\n❌ Error: ${error.message}\n`));

    if (options.verbose) {
      console.error(chalk.gray(error.stack));
    }

    throw error;
  }
}
