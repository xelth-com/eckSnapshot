import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import { loadSetupConfig } from '../../config.js';
import { scanDirectoryRecursively, generateDirectoryTree, initializeEckManifest, loadConfig } from '../../utils/fileUtils.js';

function buildPrompt(projectPath) {
  const normalizedPath = path.resolve(projectPath);
  return `You are a code architect helping a developer curate manual context profiles for a repository.
Project root: ${normalizedPath}

Use the project directory tree provided separately to identify logical groupings of files that should travel together during focused work.

Instructions:
1. Propose profile names that reflect the responsibilities or layers of the codebase.
2. For each profile, produce an object with "include" and "exclude" arrays of glob patterns (minimize overlap, prefer directory-level globs).
3. Always include a sensible catch-all profile (for example, "default") if one is not obvious.
4. Call out generated assets, tests, or vendor files in "exclude" arrays when appropriate.
5. Return **only** valid JSON. Do not wrap the response in markdown fences or add commentary.
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

    const prompt = buildPrompt(projectPath);
    const guideContent = buildGuideContent({ prompt, directoryTree });
    const guidePath = path.join(projectPath, '.eck', 'profile_generation_guide.md');

    await fs.mkdir(path.dirname(guidePath), { recursive: true });
    spinner.text = 'Writing guide to .eck/profile_generation_guide.md...';
    await fs.writeFile(guidePath, guideContent, 'utf-8');

    spinner.succeed(`Profile generation guide saved to ${guidePath}`);
  } catch (error) {
    spinner.fail(`Failed to generate profile guide: ${error.message}`);
    throw error;
  }
}
