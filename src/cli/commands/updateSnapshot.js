import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import { getGitAnchor, getChangedFiles, getGitDiffOutput } from '../../utils/gitUtils.js';
import { loadSetupConfig } from '../../config.js';
import { readFileWithSizeCheck, parseSize, formatSize, matchesPattern, loadGitignore, generateTimestamp } from '../../utils/fileUtils.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function updateSnapshot(repoPath, options) {
  const spinner = ora('Generating update snapshot...').start();
  try {
    const anchor = await getGitAnchor(repoPath);
    if (!anchor) {
      throw new Error('No snapshot anchor found. Run a full snapshot first: eck-snapshot snapshot');
    }

    const changedFiles = await getChangedFiles(repoPath, anchor);
    if (changedFiles.length === 0) {
      spinner.succeed('No changes detected since last full snapshot.');
      return;
    }

    // Load configs for filtering logic
    const setupConfig = await loadSetupConfig();
    const config = { ...setupConfig.fileFiltering, ...setupConfig.performance, ...options };
    const gitignore = await loadGitignore(repoPath);

    let contentOutput = '';
    let includedCount = 0;
    const fileList = [];

    for (const filePath of changedFiles) {
      // Basic filtering (reuse logic roughly)
      if (config.dirsToIgnore.some(d => filePath.startsWith(d))) continue;
      if (gitignore.ignores(filePath)) continue;

      try {
        const fullPath = path.join(repoPath, filePath);
        const content = await readFileWithSizeCheck(fullPath, parseSize(config.maxFileSize));

        contentOutput += `--- File: /${filePath} ---\n\n${content}\n\n`;
        fileList.push(`- ${filePath}`);
        includedCount++;
      } catch (e) {
        // Skip deleted files or read errors
      }
    }

    // Load Template
    const templatePath = path.join(__dirname, '../../templates/update-prompt.template.md');
    let header = await fs.readFile(templatePath, 'utf-8');
    header = header.replace('{{anchor}}', anchor.substring(0, 7))
      .replace('{{timestamp}}', new Date().toLocaleString())
      .replace('{{fileList}}', fileList.join('\n'));

    // Add Git Diff at the end for context
    const diffOutput = await getGitDiffOutput(repoPath, anchor);
    const diffSection = `\n--- GIT DIFF (For Context) ---\n\n\`\`\`diff\n${diffOutput}\n\`\`\``;

    const outputFilename = `update_${generateTimestamp()}.md`;
    const outputPath = path.join(repoPath, '.eck', 'snapshots', outputFilename);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, header + contentOutput + diffSection);

    spinner.succeed(`Update snapshot created: .eck/snapshots/${outputFilename}`);
    console.log(`📦 Included ${includedCount} changed files.`);

  } catch (error) {
    spinner.fail(`Update failed: ${error.message}`);
  }
}
