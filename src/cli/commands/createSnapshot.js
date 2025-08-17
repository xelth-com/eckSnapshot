import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import pLimit from 'p-limit';
import { SingleBar, Presets } from 'cli-progress';
import isBinaryPath from 'is-binary-path';
import zlib from 'zlib';
import { promisify } from 'util';
import ora from 'ora';

import {
  parseSize, formatSize, matchesPattern, checkGitRepository, 
  scanDirectoryRecursively, loadGitignore, readFileWithSizeCheck, 
  loadConfig
} from '../../utils/fileUtils.js';
import { generateEnhancedAIHeader } from '../../utils/aiHeader.js';
import { indexProject } from './indexProject.js';
import { loadSetupConfig, DEFAULT_CONFIG } from '../../config.js';

const gzip = promisify(zlib.gzip);

async function getProjectFiles(projectPath, config) {
  const isGitRepo = await checkGitRepository(projectPath);
  if (isGitRepo) {
    const { stdout } = await execa('git', ['ls-files'], { cwd: projectPath });
    return stdout.split('\n').filter(Boolean);
  }
  return scanDirectoryRecursively(projectPath, config);
}

async function estimateProjectTokens(projectPath, config) {
  const files = await getProjectFiles(projectPath, config);
  let totalSize = 0;
  for (const file of files) {
    try {
      const stats = await fs.stat(path.join(projectPath, file));
      totalSize += stats.size;
    } catch (e) { /* ignore errors for estimation */ }
  }
  return totalSize / 4; // Rough estimate of tokens
}

async function runFileSnapshot(repoPath, options, config) {
  // This contains the original logic for creating a single file
  const originalCwd = process.cwd();
  const spinner = ora('Creating single-file snapshot...').start();
  try {
    process.chdir(repoPath);
    const allFiles = await getProjectFiles(repoPath, config);
    const gitignore = await loadGitignore(repoPath);
    const stats = { totalFiles: allFiles.length, includedFiles: 0 };
    
    const limit = pLimit(config.concurrency);
    const processFile = async (filePath) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      if (config.dirsToIgnore.some(dir => normalizedPath.startsWith(dir)) || gitignore.ignores(normalizedPath) || isBinaryPath(filePath)) {
        return null;
      }
      try {
        const content = await readFileWithSizeCheck(filePath, parseSize(config.maxFileSize));
        stats.includedFiles++;
        return `--- File: /${normalizedPath} ---\n\n${content}\n\n`;
      } catch { return null; }
    };

    const results = await Promise.all(allFiles.map(fp => limit(() => processFile(fp))));
    const contentArray = results.filter(Boolean);

    const header = options.noAiHeader ? '' : await generateEnhancedAIHeader({ stats, repoName: path.basename(repoPath), mode: 'file' });
    let snapshotContent = header + contentArray.join('');

    const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const outputFilename = `${path.basename(repoPath)}_snapshot_${timestamp}.md`;
    const outputPath = options.output || path.join(process.cwd(), 'snapshots');
    await fs.mkdir(outputPath, { recursive: true });
    const fullOutputFilePath = path.join(outputPath, outputFilename);
    await fs.writeFile(fullOutputFilePath, snapshotContent);
    spinner.succeed(`Snapshot created: ${fullOutputFilePath}`);
  } finally {
    process.chdir(originalCwd);
  }
}

export async function createRepoSnapshot(repoPath, options) {
  const spinner = ora('Analyzing project...').start();
  try {
    const setupConfig = await loadSetupConfig();
    const userConfig = await loadConfig(options.config);
    
    // Merge configs: setup.json base, user overrides, command options
    const config = {
      ...setupConfig.fileFiltering,
      ...setupConfig.performance,
      smartModeTokenThreshold: setupConfig.smartMode.tokenThreshold,
      ...userConfig,
      ...options
    };

    const estimatedTokens = await estimateProjectTokens(repoPath, config);
    spinner.info(`Estimated project size: ~${Math.round(estimatedTokens).toLocaleString()} tokens.`);

    if (estimatedTokens > config.smartModeTokenThreshold) {
      spinner.succeed('Project is large. Switching to vector indexing mode.');
      await indexProject(repoPath, options);
    } else {
      spinner.succeed('Project is small. Creating a single-file snapshot.');
      await runFileSnapshot(repoPath, options, config);
    }
  } catch (error) {
    spinner.fail(`Operation failed: ${error.message}`);
    process.exit(1);
  }
}