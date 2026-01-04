import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
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

    // 1. Get changed files from Git
    const changedFiles = await getChangedFiles(repoPath, anchor);

    // 2. Check for the Agent Report file (.eck/AnswerToSA.md)
    const reportPath = path.join(repoPath, '.eck', 'AnswerToSA.md');
    let agentReport = null;
    try {
      agentReport = await fs.readFile(reportPath, 'utf-8');
      // Ensure the report is included in the file list if it exists, even if git missed it
      if (!changedFiles.includes('.eck/AnswerToSA.md')) {
        changedFiles.push('.eck/AnswerToSA.md');
      }
    } catch (e) {
      // No report found, which is fine
    }

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
      // We explicitly allow .eck/AnswerToSA.md even if .eck is ignored elsewhere
      if (gitignore.ignores(filePath) && filePath !== '.eck/AnswerToSA.md') continue;

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

    // Inject Agent Report at the top if it exists
    let reportSection = '';
    if (agentReport) {
      reportSection = `
#######################################################
# 📨 MESSAGE FROM EXECUTION AGENT (Claude)
#######################################################
${agentReport}
#######################################################
\n`;
    }

    header = header.replace('{{anchor}}', anchor.substring(0, 7))
      .replace('{{timestamp}}', new Date().toLocaleString())
      .replace('{{fileList}}', fileList.join('\n'));

    // Prepend report to header
    header = reportSection + header;

    // Add Git Diff at the end for context
    const diffOutput = await getGitDiffOutput(repoPath, anchor);
    const diffSection = `\n--- GIT DIFF (For Context) ---\n\n\`\`\`diff\n${diffOutput}\n\`\`\``;

    // Determine sequence number
    let seqNum = 1;
    const counterPath = path.join(repoPath, '.eck', 'update_seq');
    try {
      const seqData = await fs.readFile(counterPath, 'utf-8');
      const [savedHash, savedCount] = seqData.split(':');
      const shortAnchor = anchor.substring(0, 7);
      // If anchor matches, increment. Otherwise reset to 1.
      if (savedHash && savedHash.trim() === shortAnchor.trim()) {
        seqNum = parseInt(savedCount || '0') + 1;
      }
    } catch (e) {
      // File doesn't exist or is unreadable, start at 1
    }

    // Save new sequence
    try {
      const shortAnchor = anchor.substring(0, 7);
      await fs.writeFile(counterPath, `${shortAnchor}:${seqNum}`);
    } catch (e) {
      // Non-critical, continue
    }

    // Compact filename: eck{timestamp}_{hash}_upN.md
    const timestamp = generateTimestamp();
    const shortAnchor = anchor.substring(0, 7);
    const outputFilename = `eck${timestamp}_${shortAnchor}_up${seqNum}.md`;
    const outputPath = path.join(repoPath, '.eck', 'snapshots', outputFilename);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, header + contentOutput + diffSection);

    spinner.succeed(`Update snapshot created: .eck/snapshots/${outputFilename}`);
    if (agentReport) {
      console.log(chalk.green('📨 Included Agent Report (.eck/AnswerToSA.md)'));
    }
    console.log(`📦 Included ${includedCount} changed files.`);

  } catch (error) {
    spinner.fail(`Update failed: ${error.message}`);
  }
}
