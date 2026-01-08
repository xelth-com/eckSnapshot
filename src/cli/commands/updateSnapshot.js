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

// Shared logic to generate the snapshot content string
async function generateSnapshotContent(repoPath, changedFiles, anchor, config, gitignore) {
  let contentOutput = '';
  let includedCount = 0;
  const fileList = [];

  // Check for Agent Report
  const reportPath = path.join(repoPath, '.eck', 'AnswerToSA.md');
  let agentReport = null;
  try {
    agentReport = await fs.readFile(reportPath, 'utf-8');
    if (!changedFiles.includes('.eck/AnswerToSA.md')) {
      changedFiles.push('.eck/AnswerToSA.md');
    }
  } catch (e) { /* No report */ }

  for (const filePath of changedFiles) {
    if (config.dirsToIgnore.some(d => filePath.startsWith(d))) continue;
    if (gitignore.ignores(filePath) && filePath !== '.eck/AnswerToSA.md') continue;

    try {
      const fullPath = path.join(repoPath, filePath);
      const content = await readFileWithSizeCheck(fullPath, parseSize(config.maxFileSize));
      contentOutput += `--- File: /${filePath} ---\n\n${content}\n\n`;
      fileList.push(`- ${filePath}`);
      includedCount++;
    } catch (e) { /* Skip */ }
  }

  // Load Template
  const templatePath = path.join(__dirname, '../../templates/update-prompt.template.md');
  let header = await fs.readFile(templatePath, 'utf-8');

  // Inject Agent Report
  let reportSection = '';
  if (agentReport) {
    reportSection = `\n#######################################################\n# 📨 MESSAGE FROM EXECUTION AGENT (Claude)\n#######################################################\n${agentReport}\n#######################################################\n\n`;
  }

  header = header.replace('{{anchor}}', anchor.substring(0, 7))
    .replace('{{timestamp}}', new Date().toLocaleString())
    .replace('{{fileList}}', fileList.join('\n'));

  header = reportSection + header;

  const diffOutput = await getGitDiffOutput(repoPath, anchor);
  const diffSection = `\n--- GIT DIFF (For Context) ---\n\n\`\`\`diff\n${diffOutput}\n\`\`\``;

  return {
    fullContent: header + contentOutput + diffSection,
    includedCount,
    anchor
  };
}

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

    const setupConfig = await loadSetupConfig();
    const config = { ...setupConfig.fileFiltering, ...setupConfig.performance, ...options };
    const gitignore = await loadGitignore(repoPath);

    const { fullContent, includedCount } = await generateSnapshotContent(repoPath, changedFiles, anchor, config, gitignore);

    // Determine sequence number
    let seqNum = 1;
    const counterPath = path.join(repoPath, '.eck', 'update_seq');
    try {
      const seqData = await fs.readFile(counterPath, 'utf-8');
      const [savedHash, savedCount] = seqData.split(':');
      if (savedHash && savedHash.trim() === anchor.substring(0, 7).trim()) {
        seqNum = parseInt(savedCount || '0') + 1;
      }
    } catch (e) {}

    try {
      await fs.writeFile(counterPath, `${anchor.substring(0, 7)}:${seqNum}`);
    } catch (e) {}

    const timestamp = generateTimestamp();
    const outputFilename = `eck${timestamp}_${anchor.substring(0, 7)}_up${seqNum}.md`;
    const outputPath = path.join(repoPath, '.eck', 'snapshots', outputFilename);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, fullContent);

    spinner.succeed(`Update snapshot created: .eck/snapshots/${outputFilename}`);

    // Check if agent report was included
    const reportPath = path.join(repoPath, '.eck', 'AnswerToSA.md');
    try {
      await fs.access(reportPath);
      console.log(chalk.green('📨 Included Agent Report (.eck/AnswerToSA.md)'));
    } catch (e) {}

    console.log(`📦 Included ${includedCount} changed files.`);

  } catch (error) {
    spinner.fail(`Update failed: ${error.message}`);
  }
}

// New Silent/JSON command for Agents
export async function updateSnapshotJson(repoPath) {
  try {
    const anchor = await getGitAnchor(repoPath);
    if (!anchor) {
      console.log(JSON.stringify({ status: "error", message: "No snapshot anchor found" }));
      return;
    }

    const changedFiles = await getChangedFiles(repoPath, anchor);
    if (changedFiles.length === 0) {
      console.log(JSON.stringify({ status: "no_changes", message: "No changes detected" }));
      return;
    }

    const setupConfig = await loadSetupConfig();
    const config = { ...setupConfig.fileFiltering, ...setupConfig.performance };
    const gitignore = await loadGitignore(repoPath);

    const { fullContent, includedCount } = await generateSnapshotContent(repoPath, changedFiles, anchor, config, gitignore);

    let seqNum = 1;
    const counterPath = path.join(repoPath, '.eck', 'update_seq');
    try {
      const seqData = await fs.readFile(counterPath, 'utf-8');
      const [savedHash, savedCount] = seqData.split(':');
      if (savedHash && savedHash.trim() === anchor.substring(0, 7).trim()) {
        seqNum = parseInt(savedCount || '0') + 1;
      }
    } catch (e) {}

    try {
      await fs.writeFile(counterPath, `${anchor.substring(0, 7)}:${seqNum}`);
    } catch (e) {}

    const timestamp = generateTimestamp();
    const outputFilename = `eck${timestamp}_${anchor.substring(0, 7)}_up${seqNum}.md`;
    const outputPath = path.join(repoPath, '.eck', 'snapshots', outputFilename);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, fullContent);

    console.log(JSON.stringify({
      status: "success",
      snapshot_file: `.eck/snapshots/${outputFilename}`,
      files_count: includedCount,
      timestamp: timestamp
    }));

  } catch (error) {
    console.log(JSON.stringify({ status: "error", message: error.message }));
  }
}
