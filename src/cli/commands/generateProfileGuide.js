import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { loadSetupConfig } from '../../config.js';
import { scanDirectoryRecursively, generateDirectoryTree, initializeEckManifest, loadConfig } from '../../utils/fileUtils.js';

function buildPrompt(projectPath) {
  const normalizedPath = path.resolve(projectPath);
  return `You are a code architect helping a developer curate manual context profiles for a repository.
Project root: ${normalizedPath}

Use the project directory tree provided separately to identify logical groupings of files that should travel together during focused work.

Instructions:
1. Propose profile names that reflect the responsibilities or layers of the codebase.
2. For each profile, add a "description" field explaining what the profile covers.
3. For each profile, produce "include" and "exclude" arrays of glob patterns using proper micromatch syntax:

   CORRECT glob patterns:
   ✓ "src/**/*"           - all files recursively in src/
   ✓ "src/**/*.js"        - all JS files recursively in src/
   ✓ "**/node_modules/**" - node_modules anywhere
   ✓ "**/*.test.js"       - test files anywhere
   ✓ "packages/**/package.json" - all package.json in packages subdirs

   INCORRECT patterns (DO NOT USE):
   ✗ "src//"              - double slash is invalid
   ✗ "src/**/"            - trailing slash is incorrect
   ✗ "/node_modules/"     - leading/trailing slashes don't work as expected
   ✗ "src/.js"            - missing ** means only root level

4. Always include a sensible catch-all profile (for example, "default") if one is not obvious.
5. Call out generated assets, tests, or vendor files in "exclude" arrays when appropriate.
6. Return **only** valid JSON. Do not wrap the response in markdown fences or add commentary.

Example profile structure:
{
  "backend": {
    "description": "Backend API and services",
    "include": ["src/api/**/*", "src/services/**/*"],
    "exclude": ["**/*.test.js", "**/node_modules/**"]
  }
}
`;
}

function buildGuideContent({ prompt, directoryTree }) {
  const timestamp = new Date().toISOString();
  const trimmedTree = directoryTree.trimEnd();

  return [
    '# Profile Generation Guide',
    '',
    `Generated: ${timestamp}`,
    '',
    '## How to Use',
    '- Copy the prompt below into your AI assistant or follow it yourself.',
    '- When using an AI, paste the directory tree afterward so it has full project context.',
    "- Review the suggested profiles, then save the JSON to `.eck/profiles.json` when you are satisfied.",
    '',
    '## Recommended Prompt',
    '```text',
    prompt.trimEnd(),
    '```',
    '',
    '## Project Directory Tree',
    '```text',
    trimmedTree,
    '```',
    ''
  ].join('\n');
}

export async function generateProfileGuide(repoPath = process.cwd(), options = {}) {
  const spinner = ora('Preparing profile generation guide...').start();
  const projectPath = path.resolve(repoPath);

  try {
    spinner.text = 'Ensuring .eck manifest directory is initialized...';
    await initializeEckManifest(projectPath);

    spinner.text = 'Loading configuration...';
    const setupConfig = await loadSetupConfig();
    const userConfig = await loadConfig(options.config);
    const combinedConfig = {
      ...userConfig,
      ...(setupConfig.fileFiltering || {}),
      ...(setupConfig.performance || {})
    };

    spinner.text = 'Scanning repository files...';
    const allFiles = await scanDirectoryRecursively(projectPath, combinedConfig, projectPath);

    spinner.text = 'Building directory tree...';
    const maxDepth = Number(combinedConfig.maxDepth ?? 10);
    const directoryTree = await generateDirectoryTree(projectPath, '', allFiles, 0, Number.isFinite(maxDepth) ? maxDepth : 10, combinedConfig);

    if (!directoryTree) {
      throw new Error('Failed to generate directory tree or project is empty.');
    }

    // 1. Create the Guide Markdown
    const prompt = buildPrompt(projectPath);
    const guideContent = buildGuideContent({ prompt, directoryTree });
    const guidePath = path.join(projectPath, '.eck', 'profile_generation_guide.md');

    await fs.mkdir(path.dirname(guidePath), { recursive: true });
    spinner.text = 'Writing guide to .eck/profile_generation_guide.md...';
    await fs.writeFile(guidePath, guideContent, 'utf-8');

    // 2. Ensure profiles.json exists (or create a stub)
    const profilesPath = path.join(projectPath, '.eck', 'profiles.json');
    let profilesCreated = false;
    try {
        await fs.access(profilesPath);
    } catch {
        // File doesn't exist, create a stub for easy pasting
        const stubContent = {
            "_instruction": "PASTE THE JSON RESPONSE FROM THE AI HERE",
            "example_profile": {
                "description": "Example profile structure",
                "include": ["src/**"],
                "exclude": ["**/*.test.js"]
            }
        };
        await fs.writeFile(profilesPath, JSON.stringify(stubContent, null, 2));
        profilesCreated = true;
    }

    spinner.succeed(`Profile generation guide saved to ${guidePath}`);

    // 3. Print clear instructions
    console.log(chalk.cyan('\n📋 Next Steps (Workflow):'));
    console.log(`1. Open: ${chalk.bold('.eck/profile_generation_guide.md')}`);
    console.log('2. Copy the PROMPT + TREE content and paste it into an AI (Gemini 1.5 Pro, Claude Opus, ChatGPT).');
    console.log('3. Copy the JSON response from the AI.');
    console.log(`4. Paste the JSON into: ${chalk.bold('.eck/profiles.json')} ${profilesCreated ? '(I created this file for you)' : '(File exists)'}`);
    console.log('\n✅ Once saved, run: ' + chalk.green('eck-snapshot --profile <profile_name>'));
  } catch (error) {
    spinner.fail(`Failed to generate profile guide: ${error.message}`);
    throw error;
  }
}
