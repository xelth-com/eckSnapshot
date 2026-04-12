import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import isBinaryPath from 'is-binary-path';
import { getGitAnchor, getChangedFiles } from '../../utils/gitUtils.js';
import { loadSetupConfig } from '../../config.js';
import { readFileWithSizeCheck, parseSize, formatSize, matchesPattern, loadGitignore, generateTimestamp, getShortRepoName, ensureSnapshotsInGitignore, readMlModelMetadata } from '../../utils/fileUtils.js';
import { detectProjectType, getProjectSpecificFiltering } from '../../utils/projectDetector.js';
import { execa } from 'execa';
import { fileURLToPath } from 'url';
import { pushTelemetry } from '../../utils/telemetry.js';
import { syncTokenWeights } from '../../utils/tokenEstimator.js';

// Mirror the same hidden-path guard used in createSnapshot.js
function isHiddenPath(filePath) {
  const parts = filePath.split('/');
  return parts.some(part => part.startsWith('.') && part !== '.eck');
}

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

function resolveBaseHash(base) {
  if (!base) return null;
  const basename = path.basename(base, '.md');
  const match = basename.match(/_([0-9a-f]{7,40})_/);
  if (match) return match[1];
  if (/^[0-9a-f]{7,40}$/i.test(base)) return base;
  throw new Error(`Invalid --base value: "${base}". Expected a snapshot filename or a git commit hash.`);
}

// Shared logic to generate the snapshot content string
async function generateSnapshotContent(repoPath, changedFiles, anchor, config, gitignore) {
  let contentOutput = '';
  let includedCount = 0;
  const fileList = [];

  // Include Agent Report if it exists and hasn't been embedded yet
  let agentReport = null;
  const reportPath = path.join(repoPath, '.eck', 'lastsnapshot', 'AnswerToSA.md');
  const lockPath = path.join(repoPath, '.eck', 'lastsnapshot', 'AnswerToSA.lock');
  try {
    // Use atomic directory creation as a lock to prevent race conditions
    await fs.mkdir(lockPath);
    const reportContent = await fs.readFile(reportPath, 'utf-8');
    
    if (!reportContent.includes('[SYSTEM: EMBEDDED]')) {
      agentReport = reportContent;

      // Immediately mark as embedded to release the race window
      await fs.appendFile(reportPath, '\n\n[SYSTEM: EMBEDDED]\n', 'utf-8');

      // Auto-Journaling: prepend agent report to JOURNAL.md
      const journalPath = path.join(repoPath, '.eck', 'JOURNAL.md');
      try {
        const dateStr = new Date().toISOString().split('T')[0];
        const journalEntry = `## ${dateStr} — Agent Report\n\n${reportContent.trim()}\n`;

        let existingJournal = '';
        try {
          existingJournal = await fs.readFile(journalPath, 'utf-8');
        } catch (e) { /* might not exist */ }

        const insertPos = existingJournal.indexOf('\n## ');
        if (insertPos !== -1) {
          const newJournal = existingJournal.slice(0, insertPos) + '\n\n' + journalEntry + existingJournal.slice(insertPos);
          await fs.writeFile(journalPath, newJournal, 'utf-8');
        } else {
          await fs.writeFile(journalPath, (existingJournal ? existingJournal + '\n\n' : '') + journalEntry + '\n', 'utf-8');
        }
      } catch (je) {
        console.warn('Could not auto-update JOURNAL.md', je.message);
      }
    }
    await fs.rmdir(lockPath);
  } catch (e) { 
    // File not found or locked by another process
    try { await fs.rmdir(lockPath); } catch (_) {} 
  }

  const cleanDirsToIgnore = (config.dirsToIgnore || []).map(d => d.replace(/\/$/, ''));

  for (const filePath of changedFiles) {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Skip hidden paths (.idea/, .vscode/, etc.) — mirrors createSnapshot.js
    if (isHiddenPath(normalizedPath)) continue;

    const mlExt = path.extname(filePath).toLowerCase();
    const ML_EXTENSIONS = ['.safetensors', '.onnx', '.pt', '.pth', '.h5', '.pb', '.bin', '.ckpt', '.gguf'];
    const isMlModel = ML_EXTENSIONS.includes(mlExt);

    // Skip binary files — mirrors createSnapshot.js
    if (isBinaryPath(filePath) && !isMlModel) continue;

    const pathParts = normalizedPath.split('/');
    let isIgnoredDir = false;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (cleanDirsToIgnore.includes(pathParts[i])) {
        isIgnoredDir = true;
        break;
      }
    }
    if (isIgnoredDir) continue;

    const fileExt = path.extname(filePath);
    // Use matchesPattern (glob support) instead of exact includes() — mirrors createSnapshot.js
    if (config.filesToIgnore && matchesPattern(normalizedPath, config.filesToIgnore)) continue;
    if (fileExt && config.extensionsToIgnore?.includes(fileExt)) continue;
    if (gitignore.ignores(normalizedPath)) continue;

    try {
      const fullPath = path.join(repoPath, filePath);

      // Explicitly check if file was deleted
      try {
        await fs.access(fullPath);
      } catch (accessErr) {
        contentOutput += `--- File: /${normalizedPath} ---\n\n[FILE DELETED]\n\n`;
        fileList.push(`- ${normalizedPath} (Deleted)`);
        includedCount++;
        continue;
      }

      let content;
      if (isMlModel) {
          content = await readMlModelMetadata(fullPath);
      } else {
          content = await readFileWithSizeCheck(fullPath, parseSize(config.maxFileSize));
      }

      contentOutput += `--- File: /${normalizedPath} ---\n\n${content}\n\n`;
      fileList.push(`- ${normalizedPath} (Modified/Added)`);
      includedCount++;
    } catch (e) { /* Skip */ }
  }

  // Load Template
  const templatePath = path.join(__dirname, '../../templates/update-prompt.template.md');
  let header = await fs.readFile(templatePath, 'utf-8');

  // Inject Agent Report
  let reportSection = '';
  if (agentReport) {
    reportSection = `\n---\n### 📨 MESSAGE FROM EXECUTION AGENT\n\n${agentReport}\n---\n\n`;
  }

  const repoName = path.basename(repoPath);

  header = header.replace('{{repoName}}', repoName)
    .replace('{{anchor}}', anchor.substring(0, 7))
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
    const isCustomBase = !!options.base;
    const anchor = resolveBaseHash(options.base) || await getGitAnchor(repoPath);

    if (!anchor) {
      throw new Error('No snapshot anchor found. Run a full snapshot first: eck-snapshot snapshot');
    }

    // Auto-commit any uncommitted changes so they appear in the diff
    let didCommit = false;
    if (!options.fail) {
      didCommit = await autoCommit(repoPath);
      if (didCommit) {
        spinner.info('Auto-committed uncommitted changes.');
      }
    } else {
      spinner.info('Fail flag passed: skipping auto-commit.');
    }

    if (isCustomBase) {
      spinner.info(`Using custom base: ${anchor.substring(0, 7)} (from ${path.basename(options.base)})`);
    }

    spinner.start('Generating update snapshot...');

    const changedFiles = await getChangedFiles(repoPath, anchor, options.fail);
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
    let seqStr = 'custom';
    if (!isCustomBase) {
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
      seqStr = seqNum.toString();
    }

    const timestamp = generateTimestamp();
    const shortRepoName = getShortRepoName(path.basename(repoPath));
    const sizeKB = Math.max(1, Math.round(Buffer.byteLength(fullContent, 'utf-8') / 1024));
    const outputFilename = `eck${shortRepoName}${timestamp}_${anchor.substring(0, 7)}_up${seqStr}_${sizeKB}kb.md`;
    const outputPath = path.join(repoPath, '.eck', 'snapshots', outputFilename);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await ensureSnapshotsInGitignore(repoPath);
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

    // Auto-push telemetry
    await pushTelemetry(repoPath, true);

  } catch (error) {
    spinner.fail(`Update failed: ${error.message}`);
  }
}

// New Silent/JSON command for Agents
export async function updateSnapshotJson(repoPath, options = {}) {
  try {
    const isCustomBase = !!options.base;
    const anchor = resolveBaseHash(options.base) || await getGitAnchor(repoPath);
    
    if (!anchor) {
      console.log(JSON.stringify({ status: "error", message: "No snapshot anchor found" }));
      return;
    }

    // Auto-commit any uncommitted changes
    if (!options.fail) {
      await autoCommit(repoPath);
    }

    const changedFiles = await getChangedFiles(repoPath, anchor, !!options.fail);
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

    let seqStr = 'custom';
    if (!isCustomBase) {
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
      seqStr = seqNum.toString();
    }

    const timestamp = generateTimestamp();
    const shortRepoName = getShortRepoName(path.basename(repoPath));
    const sizeKB = Math.max(1, Math.round(Buffer.byteLength(fullContent, 'utf-8') / 1024));
    const outputFilename = `eck${shortRepoName}${timestamp}_${anchor.substring(0, 7)}_up${seqStr}_${sizeKB}kb.md`;
    const outputPath = path.join(repoPath, '.eck', 'snapshots', outputFilename);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await ensureSnapshotsInGitignore(repoPath);
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

    // Auto-push telemetry and sync weights (fire and forget so it doesn't break JSON output)
    pushTelemetry(repoPath, true).catch(() => {});
    syncTokenWeights(true).catch(() => {});

  } catch (error) {
    console.log(JSON.stringify({ status: "error", message: error.message }));
  }
}
