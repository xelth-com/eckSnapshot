import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import micromatch from 'micromatch';
import {
  scanDirectoryRecursively,
  generateDirectoryTree,
  generateTimestamp,
  readFileWithSizeCheck,
  parseSize
} from '../../utils/fileUtils.js';
import { loadSetupConfig } from '../../config.js';

export async function runReconTool(payload) {
  const toolName = payload.name;
  const args = payload.arguments || {};

  if (toolName === 'eck_scout') {
    await runScout();
  } else if (toolName === 'eck_fetch') {
    if (!args.patterns || !Array.isArray(args.patterns)) {
      console.log(chalk.red('❌ Error: eck_fetch requires an array of "patterns" in arguments.'));
      return;
    }
    await runFetch(args.patterns);
  }
}

async function runScout() {
  console.log(chalk.blue('🕵️‍♂️ Generating reconnaissance tree...'));
  try {
    const repoPath = process.cwd();
    const repoName = path.basename(repoPath);
    const setupConfig = await loadSetupConfig();
    const config = { ...setupConfig.fileFiltering, ...setupConfig.performance };

    // Use a deep maxDepth for scout so the AI can see the full structure
    config.maxDepth = 15;

    const allFiles = await scanDirectoryRecursively(repoPath, config, repoPath);
    const directoryTree = await generateDirectoryTree(repoPath, '', allFiles, 0, config.maxDepth, config);

    const timestamp = generateTimestamp();
    const filename = `recon_tree_${repoName}_${timestamp}.md`;

    const content = `# ⚠️ EXTERNAL REPOSITORY RECONNAISSANCE: [${repoName}]

**CRITICAL INSTRUCTION FOR AI:** You are currently working on your primary project. The data below is strictly for REFERENCE from an external repository named \`${repoName}\`. DO NOT assume the role of architect for this repository. DO NOT attempt to write code for this repository.

## How to request data from this repository
Below is the directory tree of this external codebase. If you need to see the contents of specific files or folders to understand how they work, ask the user to run the following JSON command in the external repository's terminal:

\`\`\`bash
eck-snapshot '{"name": "eck_fetch", "arguments": {"patterns": ["path/to/file.rs", "src/**/*.js"]}}'
\`\`\`

## Directory Structure
\`\`\`text
${directoryTree}
\`\`\`
`;

    await fs.mkdir(path.join(repoPath, '.eck', 'recon'), { recursive: true });
    const outputPath = path.join(repoPath, '.eck', 'recon', filename);
    await fs.writeFile(outputPath, content, 'utf-8');

    console.log(chalk.green(`✅ Scout complete. Tree saved to: .eck/recon/${filename}`));
  } catch (error) {
    console.error(chalk.red(`❌ Scout failed: ${error.message}`));
  }
}

async function runFetch(patterns) {
  console.log(chalk.blue(`🚚 Fetching files matching patterns: ${patterns.join(', ')}...`));
  try {
    const repoPath = process.cwd();
    const repoName = path.basename(repoPath);
    const setupConfig = await loadSetupConfig();
    const config = { ...setupConfig.fileFiltering, ...setupConfig.performance };

    const allFiles = await scanDirectoryRecursively(repoPath, config, repoPath);
    const matchedFiles = micromatch(allFiles, patterns);

    if (matchedFiles.length === 0) {
      console.log(chalk.yellow('⚠️ No files matched the requested patterns.'));
      return;
    }

    let fileContentStr = '';
    let fetchedCount = 0;
    const maxFileSize = parseSize(config.maxFileSize || '10MB');

    for (const file of matchedFiles) {
      try {
        const fullPath = path.join(repoPath, file);
        const content = await readFileWithSizeCheck(fullPath, maxFileSize);
        fileContentStr += `--- File: /${file} ---\n\n\`\`\`\n${content}\n\`\`\`\n\n`;
        fetchedCount++;
      } catch (e) {
        fileContentStr += `--- File: /${file} ---\n\n[ERROR: ${e.message}]\n\n`;
      }
    }

    const timestamp = generateTimestamp();
    const filename = `recon_data_${repoName}_${timestamp}.md`;

    const finalContent = `# ⚠️ RECONNAISSANCE FETCH RESULTS: [${repoName}]

Here are the file contents you requested from the external repository. Use this to inform your work on your primary project.

${fileContentStr}
`;

    await fs.mkdir(path.join(repoPath, '.eck', 'recon'), { recursive: true });
    const outputPath = path.join(repoPath, '.eck', 'recon', filename);
    await fs.writeFile(outputPath, finalContent, 'utf-8');

    console.log(chalk.green(`✅ Fetched ${fetchedCount} files. Saved to: .eck/recon/${filename}`));
  } catch (error) {
    console.error(chalk.red(`❌ Fetch failed: ${error.message}`));
  }
}
