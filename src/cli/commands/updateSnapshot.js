import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { getGitAnchor, getChangedFiles } from '../../utils/gitUtils.js';
import { loadSetupConfig } from '../../config.js';
import { readFileWithSizeCheck, parseSize, formatSize, matchesPattern, loadGitignore, generateTimestamp, getShortRepoName } from '../../utils/fileUtils.js';
import { detectProjectType, getProjectSpecificFiltering } from '../../utils/projectDetector.js';
import { execa } from 'execa';
import { fileURLToPath } from 'url';

// Auto-commit uncommitted changes before collecting diffs
async function autoCommit(repoPath) {
  try {
    // Check if there are uncommitted changes
    const { stdout: status } = await execa('git', ['status', '--porcelain'], { cwd: repoPath });
    if (!status.trim()) return false;

    await execa('git', ['add', '.'], { cwd: repoPath, timeout: 30000 });
    await execa('git', ['commit', '--allow-empty', '-m', 'chore: auto-commit before snapshot update'], { cwd: repoPath, timeout: 30000 });
    return true;
  } catch (e) {
    // Non-critical — maybe nothing to commit
    return false;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Shared logic to generate the snapshot content string
async function generateSnapshotContent(repoPath, changedFiles, anchor, config, gitignore) {
  let contentOutput = '';
  let includedCount = 0;
  const fileList = [];

  // Include Agent Report if it exists and hasn't been embedded yet
  let agentReport = null;
  const reportPath = path.join(repoPath, '.eck', 'lastsnapshot', 'AnswerToSA.md');
  try {
    const reportContent = await fs.readFile(reportPath, 'utf-8');
    if (!reportContent.includes('[SYSTEM: EMBEDDED]')) {
      agentReport = reportContent;
      await fs.appendFile(reportPath, '\n\n[SYSTEM: EMBEDDED]\n', 'utf-8');
    }
  } catch (e) { /* File not found or unreadable */ }

  for (const filePath of changedFiles) {
    if (config.dirsToIgnore?.some(d => filePath.startsWith(d))) continue;
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    if (config.filesToIgnore?.includes(fileName)) continue;
    if (fileExt && config.extensionsToIgnore?.includes(fileExt)) continue;
    if (gitignore.ignores(filePath)) continue;

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
    reportSection = `\n#######################################################\n# 📨 MESSAGE FROM EXECUTION AGENT\n#######################################################\n${agentReport}\n#######################################################\n\n`;
  }

  header = header.replace('{{anchor}}', anchor.substring(0, 7))
    .replace('{{timestamp}}', new Date().toLocaleString())
    .replace('{{fileList}}', fileList.join('\n'));

  header = header + '\n' + reportSection;

  return {
    fullContent: header + contentOutput,
    includedCount,
    anchor,
    agentReport
  };
}

export async function updateSnapshot(repoPath, options) {
  const spinner = ora('Generating update snapshot...').start();
  try {
    const anchor = await getGitAnchor(repoPath);
    if (!anchor) {
      throw new Error('No snapshot anchor found. Run a full snapshot first: eck-snapshot snapshot');
    }

    // Auto-commit any uncommitted changes so they appear in the diff
    const didCommit = await autoCommit(repoPath);
    if (didCommit) {
      spinner.info('Auto-committed uncommitted changes.');
      spinner.start('Generating update snapshot...');
    }

    const changedFiles = await getChangedFiles(repoPath, anchor);
    if (changedFiles.length === 0) {
      spinner.succeed('No changes detected since last full snapshot.');
      return;
    }

    const setupConfig = await loadSetupConfig();
    let config = { ...setupConfig.fileFiltering, ...setupConfig.performance, ...options };

    // Detect project type and merge project-specific filters
    const projectDetection = await detectProjectType(repoPath);
    if (projectDetection.type) {
      const projectSpecific = await getProjectSpecificFiltering(projectDetection.type);
      config = {
        ...config,
        dirsToIgnore: [...(config.dirsToIgnore || []), ...(projectSpecific.dirsToIgnore || [])],
        filesToIgnore: [...(config.filesToIgnore || []), ...(projectSpecific.filesToIgnore || [])],
        extensionsToIgnore: [...(config.extensionsToIgnore || []), ...(projectSpecific.extensionsToIgnore || [])]
      };
    }

    const gitignore = await loadGitignore(repoPath);

    const { fullContent, includedCount, agentReport } = await generateSnapshotContent(repoPath, changedFiles, anchor, config, gitignore);

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
    const shortRepoName = getShortRepoName(path.basename(repoPath));
    const outputFilename = `eck${shortRepoName}${timestamp}_${anchor.substring(0, 7)}_up${seqNum}.md`;
    const outputPath = path.join(repoPath, '.eck', 'snapshots', outputFilename);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, fullContent);

    spinner.succeed(`Update snapshot created: .eck/snapshots/${outputFilename}`);

    // --- FEATURE: Active Snapshot (.eck/lastsnapshot/) ---
    try {
      const snapDir = path.join(repoPath, '.eck', 'lastsnapshot');
      await fs.mkdir(snapDir, { recursive: true });

      // 1. Clean up OLD snapshots
      const existingFiles = await fs.readdir(snapDir);
      for (const file of existingFiles) {
        if ((file.startsWith('eck') && file.endsWith('.md')) || file === 'answer.md') {
          await fs.unlink(path.join(snapDir, file));
        }
      }

      // 2. Save new file
      await fs.writeFile(path.join(snapDir, outputFilename), fullContent);
      console.log(chalk.cyan(`📋 Active snapshot updated in .eck/lastsnapshot/: ${outputFilename}`));
    } catch (e) {
      // Non-critical failure
    }
    // --------------------------------------------

    // Check if agent report was included
    if (agentReport) {
      console.log(chalk.green('📨 Included Agent Report (.eck/lastsnapshot/AnswerToSA.md)'));
    }

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

    // Auto-commit any uncommitted changes
    await autoCommit(repoPath);

    const changedFiles = await getChangedFiles(repoPath, anchor);
    if (changedFiles.length === 0) {
      console.log(JSON.stringify({ status: "no_changes", message: "No changes detected" }));
      return;
    }

    const setupConfig = await loadSetupConfig();
    let config = { ...setupConfig.fileFiltering, ...setupConfig.performance };

    // Detect project type and merge project-specific filters
    const projectDetection = await detectProjectType(repoPath);
    if (projectDetection.type) {
      const projectSpecific = await getProjectSpecificFiltering(projectDetection.type);
      config = {
        ...config,
        dirsToIgnore: [...(config.dirsToIgnore || []), ...(projectSpecific.dirsToIgnore || [])],
        filesToIgnore: [...(config.filesToIgnore || []), ...(projectSpecific.filesToIgnore || [])],
        extensionsToIgnore: [...(config.extensionsToIgnore || []), ...(projectSpecific.extensionsToIgnore || [])]
      };
    }

    const gitignore = await loadGitignore(repoPath);

    const { fullContent, includedCount, agentReport } = await generateSnapshotContent(repoPath, changedFiles, anchor, config, gitignore);

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
    const shortRepoName = getShortRepoName(path.basename(repoPath));
    const outputFilename = `eck${shortRepoName}${timestamp}_${anchor.substring(0, 7)}_up${seqNum}.md`;
    const outputPath = path.join(repoPath, '.eck', 'snapshots', outputFilename);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, fullContent);

    // --- FEATURE: Active Snapshot (.eck/lastsnapshot/) ---
    try {
      const snapDir = path.join(repoPath, '.eck', 'lastsnapshot');
      await fs.mkdir(snapDir, { recursive: true });

      // 1. Clean up OLD snapshots
      const existingFiles = await fs.readdir(snapDir);
      for (const file of existingFiles) {
        if ((file.startsWith('eck') && file.endsWith('.md')) || file === 'answer.md') {
          await fs.unlink(path.join(snapDir, file));
        }
      }

      // 2. Save new file
      await fs.writeFile(path.join(snapDir, outputFilename), fullContent);
    } catch (e) {
      // Non-critical failure
    }
    // --------------------------------------------

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
