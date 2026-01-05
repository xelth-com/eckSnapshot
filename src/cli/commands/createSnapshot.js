import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import pLimit from 'p-limit';
import { SingleBar, Presets } from 'cli-progress';
import isBinaryPath from 'is-binary-path';
import zlib from 'zlib';
import { promisify } from 'util';
import ora from 'ora';
import micromatch from 'micromatch';
import chalk from 'chalk';

import {
  parseSize, formatSize, matchesPattern, checkGitRepository,
  scanDirectoryRecursively, loadGitignore, readFileWithSizeCheck,
  generateDirectoryTree, loadConfig, displayProjectInfo, loadProjectEckManifest,
  ensureSnapshotsInGitignore, initializeEckManifest, generateTimestamp,
  SecretScanner
} from '../../utils/fileUtils.js';
import { detectProjectType, getProjectSpecificFiltering } from '../../utils/projectDetector.js';
import { estimateTokensWithPolynomial, generateTrainingCommand } from '../../utils/tokenEstimator.js';
import { loadSetupConfig, getProfile } from '../../config.js';
import { applyProfileFilter } from '../../utils/fileUtils.js';
import { saveGitAnchor } from '../../utils/gitUtils.js';
import { skeletonize } from '../../core/skeletonizer.js';
import { updateClaudeMd } from '../../utils/claudeMdGenerator.js';

/**
 * Creates dynamic project context based on detection results
 */
function createDynamicProjectContext(detection) {
  const { type, details } = detection;
  const context = {
    name: details.name || 'detected-project',
    type: type,
    detectedAt: new Date().toISOString()
  };

  // Create architecture info based on project type
  const architecture = {
    stack: [],
    structure: type
  };

  switch (type) {
    case 'android':
      architecture.stack = ['Android', details.language || 'Java', 'Gradle'];
      if (details.packageName) {
        context.packageName = details.packageName;
      }
      break;

    case 'nodejs':
      architecture.stack = ['Node.js'];
      if (details.framework) {
        architecture.stack.push(details.framework);
      }
      if (details.hasTypescript) {
        architecture.stack.push('TypeScript');
      }
      break;

    case 'nodejs-monorepo':
      architecture.stack = ['Node.js', 'Monorepo'];
      if (details.monorepoTool) {
        architecture.stack.push(details.monorepoTool);
      }
      if (details.framework) {
        architecture.stack.push(details.framework);
      }
      if (details.hasTypescript) {
        architecture.stack.push('TypeScript');
      }
      break;

    case 'python-poetry':
    case 'python-pip':
    case 'python-conda':
      architecture.stack = ['Python'];
      if (details.packageManager) {
        architecture.stack.push(details.packageManager);
      }
      break;

    case 'django':
      architecture.stack = ['Python', 'Django'];
      break;

    case 'flask':
      architecture.stack = ['Python', 'Flask'];
      break;

    case 'rust':
      architecture.stack = ['Rust', 'Cargo'];
      if (details.edition) {
        architecture.stack.push(`Rust ${details.edition}`);
      }
      break;

    case 'go':
      architecture.stack = ['Go'];
      if (details.goVersion) {
        architecture.stack.push(`Go ${details.goVersion}`);
      }
      break;

    case 'dotnet':
      architecture.stack = ['.NET'];
      if (details.language) {
        architecture.stack.push(details.language);
      }
      break;

    case 'flutter':
      architecture.stack = ['Flutter', 'Dart'];
      break;

    case 'react-native':
      architecture.stack = ['React Native', 'JavaScript'];
      if (details.hasTypescript) {
        architecture.stack.push('TypeScript');
      }
      break;

    default:
      architecture.stack = ['Unknown'];
  }

  context.architecture = architecture;

  return context;
}
import { generateEnhancedAIHeader } from '../../utils/aiHeader.js';

const gzip = promisify(zlib.gzip);

/**
 * Check if a path is a hidden directory/folder (starts with '.')
 * This excludes all hidden folders like .git, .eck, .claude, .gemini from snapshots
 * @param {string} filePath - File or directory path
 * @returns {boolean} True if path is hidden
 */
function isHiddenPath(filePath) {
  // Check if path or any parent directory starts with '.'
  // Allow .eck directory to be visible, hide others (like .git, .vscode)
  const parts = filePath.split('/');
  return parts.some(part => part.startsWith('.') && part !== '.eck');
}

/**
 * Scans the .eck directory for confidential files
 * @param {string} projectPath - Path to the project
 * @param {object} config - Configuration object
 * @returns {Promise<string[]>} Array of confidential file paths
 */
async function scanEckForConfidentialFiles(projectPath, config) {
  const eckPath = path.join(projectPath, '.eck');

  try {
    await fs.access(eckPath);
  } catch {
    return []; // .eck directory doesn't exist
  }

  const result = await scanDirectoryRecursively(eckPath, config, projectPath, null, true);
  return result.confidentialFiles || [];
}

/**
 * Generates CLAUDE.md content with references to confidential files
 * @param {string[]} confidentialFiles - Array of confidential file paths
 * @param {string} repoPath - Path to the repository
 * @returns {string} CLAUDE.md content
 */
function generateClaudeMdContent(confidentialFiles, repoPath) {
  const content = [`# Project Access & Credentials Reference`, ``];

  if (confidentialFiles.length === 0) {
    content.push('No confidential files found in .eck directory.');
    return content.join('\n');
  }

  content.push('## Access & Credentials');
  content.push('');
  content.push('The following confidential files are available locally but not included in snapshots:');
  content.push('');

  for (const file of confidentialFiles) {
    const absolutePath = path.join(repoPath, file);
    const fileName = path.basename(file);
    content.push(`- **${fileName}**: \`${absolutePath}\``);
  }

  content.push('');
  content.push('> **Note**: These files contain sensitive information and should only be accessed when needed.');
  content.push('> They are excluded from snapshots for security reasons but can be referenced on demand.');

  return content.join('\n');
}

async function getProjectFiles(projectPath, config) {
  const isGitRepo = await checkGitRepository(projectPath);
  if (isGitRepo) {
    const { stdout } = await execa('git', ['ls-files'], { cwd: projectPath });
    const gitFiles = stdout.split('\n').filter(Boolean);
    // Filter out hidden directories/files (starting with '.')
    const filteredFiles = gitFiles.filter(file => !isHiddenPath(file));
    return filteredFiles;
  }
  return scanDirectoryRecursively(projectPath, config);
}

async function getGitCommitHash(projectPath) {
  try {
    const isGitRepo = await checkGitRepository(projectPath);
    if (isGitRepo) {
      const { stdout } = await execa('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: projectPath });
      return stdout.trim();
    }
  } catch (error) {
    // Ignore errors - not a git repo or no commits
  }
  return null;
}

async function estimateProjectTokens(projectPath, config, projectType = null) {
  // Get project-specific filtering if not provided
  if (!projectType) {
    const detection = await detectProjectType(projectPath);
    projectType = detection.type;
  }

  const projectSpecific = await getProjectSpecificFiltering(projectType);

  // Merge project-specific filters with global config (same as in scanDirectoryRecursively)
  const effectiveConfig = {
    ...config,
    dirsToIgnore: [...(config.dirsToIgnore || []), ...(projectSpecific.dirsToIgnore || [])],
    filesToIgnore: [...(config.filesToIgnore || []), ...(projectSpecific.filesToIgnore || [])],
    extensionsToIgnore: [...(config.extensionsToIgnore || []), ...(projectSpecific.extensionsToIgnore || [])]
  };

  const files = await getProjectFiles(projectPath, effectiveConfig);
  const gitignore = await loadGitignore(projectPath);
  const maxFileSize = parseSize(effectiveConfig.maxFileSize);
  let totalSize = 0;
  let includedFiles = 0;

  for (const file of files) {
    try {
      const normalizedPath = file.replace(/\\/g, '/');

      // Apply the same filtering logic as in runFileSnapshot
      if (effectiveConfig.dirsToIgnore.some(dir => normalizedPath.startsWith(dir))) {
        continue;
      }

      if (gitignore.ignores(normalizedPath)) {
        continue;
      }

      if (isBinaryPath(file)) {
        continue;
      }

      const fileExtension = path.extname(file);
      if (effectiveConfig.extensionsToIgnore.includes(fileExtension)) {
        continue;
      }

      if (matchesPattern(normalizedPath, effectiveConfig.filesToIgnore)) {
        continue;
      }

      const stats = await fs.stat(path.join(projectPath, file));
      if (stats.size > maxFileSize) {
        continue;
      }

      totalSize += stats.size;
      includedFiles++;
    } catch (e) { /* ignore errors for estimation */ }
  }

  // Use adaptive polynomial estimation
  const estimatedTokens = await estimateTokensWithPolynomial(projectType, totalSize);

  return { estimatedTokens, totalSize, includedFiles };
}

async function processProjectFiles(repoPath, options, config, projectType = null) {
  const originalCwd = process.cwd();
  console.log(`\n📸 Processing files for: ${path.basename(repoPath)}`);

  const stats = {
    totalFiles: 0,
    includedFiles: 0,
    excludedFiles: 0,
    binaryFiles: 0,
    oversizedFiles: 0,
    ignoredFiles: 0,
    totalSize: 0,
    processedSize: 0,
    secretsRedacted: 0,
    errors: [],
    skipReasons: new Map(),
    skippedFilesDetails: new Map()
  };

  try {
    process.chdir(repoPath);

    console.log('🔍 Scanning repository...');
    let allFiles = await getProjectFiles(repoPath, config);

    // Filter the raw file list immediately so ignored files don't show up in the Tree
    if (config.filesToIgnore && config.filesToIgnore.length > 0) {
      allFiles = allFiles.filter(file => !matchesPattern(file, config.filesToIgnore));
    }

    if (options.profile) {
      console.log(`Applying profile filter: '${options.profile}'...`);
      allFiles = await applyProfileFilter(allFiles, options.profile, repoPath);
      console.log(`Filtered down to ${allFiles.length} files based on profile rules.`);
      if (allFiles.length === 0) {
        throw new Error(`Profile filter '${options.profile}' resulted in 0 files. Aborting.`);
      }
    }
    const gitignore = await loadGitignore(repoPath);
    stats.totalFiles = allFiles.length;

    console.log(`📊 Found ${stats.totalFiles} files`);

    const progressBar = new SingleBar({
      format: '📄 Processing |{bar}| {percentage}% | {value}/{total} files | {filename}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    }, Presets.rect);
    progressBar.start(allFiles.length, 0);

    const trackSkippedFile = (filePath, reason) => {
      if (!stats.skippedFilesDetails.has(reason)) {
        stats.skippedFilesDetails.set(reason, []);
      }
      stats.skippedFilesDetails.get(reason).push(filePath);
      stats.skipReasons.set(reason, (stats.skipReasons.get(reason) || 0) + 1);
    };

    const limit = pLimit(config.concurrency);
    const processFile = async (filePath, index) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      progressBar.update(index + 1, { filename: normalizedPath.slice(0, 50) });

      try {
        // Skip all hidden directories and files (starting with '.')
        if (isHiddenPath(normalizedPath)) {
          stats.ignoredFiles++;
          trackSkippedFile(normalizedPath, 'Hidden directories/files');
          return null;
        }

        // Check if file should be ignored by directory patterns
        if (config.dirsToIgnore.some(dir => normalizedPath.startsWith(dir))) {
          stats.ignoredFiles++;
          trackSkippedFile(normalizedPath, 'Directory ignore patterns');
          return null;
        }

        // Check gitignore patterns
        if (gitignore.ignores(normalizedPath)) {
          stats.ignoredFiles++;
          trackSkippedFile(normalizedPath, 'Gitignore rules');
          return null;
        }

        // Check if binary file
        if (isBinaryPath(filePath)) {
          stats.binaryFiles++;
          trackSkippedFile(normalizedPath, 'Binary files');
          return null;
        }

        // Check extensions and file patterns
        const fileExtension = path.extname(filePath);
        if (config.extensionsToIgnore.includes(fileExtension)) {
          stats.excludedFiles++;
          trackSkippedFile(normalizedPath, `File extension filter (${fileExtension})`);
          return null;
        }

        if (matchesPattern(normalizedPath, config.filesToIgnore)) {
          stats.excludedFiles++;
          trackSkippedFile(normalizedPath, 'File pattern filter');
          return null;
        }

        // Read file with size check
        const fullPath = path.join(repoPath, filePath);
        const fileStats = await fs.stat(fullPath);
        stats.totalSize += fileStats.size;

        const maxFileSize = parseSize(config.maxFileSize);
        if (fileStats.size > maxFileSize) {
          stats.oversizedFiles++;
          trackSkippedFile(normalizedPath, `File too large (${formatSize(fileStats.size)} > ${formatSize(maxFileSize)})`);
          return null;
        }

        let content = await readFileWithSizeCheck(fullPath, maxFileSize);

        // Security scan for secrets
        if (config.security?.scanForSecrets !== false) {
          const scanResult = SecretScanner.redact(content, normalizedPath);
          if (scanResult.found.length > 0) {
            stats.secretsRedacted += scanResult.found.length;
            console.log(chalk.yellow(`\n  ⚠️  Security: Found ${scanResult.found.join(', ')} in ${normalizedPath}. Redacting...`));
            content = scanResult.content;
          }
        }

        stats.includedFiles++;
        stats.processedSize += fileStats.size;

        // Apply skeletonization if enabled
        if (options.skeleton) {
          // Check if file should be focused (kept full)
          const isFocused = options.focus && micromatch.isMatch(normalizedPath, options.focus);
          if (!isFocused) {
            content = await skeletonize(content, normalizedPath);
          }
        }

        let outputBody = content;

        // Apply max-lines-per-file truncation if specified
        if (options.maxLinesPerFile && options.maxLinesPerFile > 0) {
          const lines = outputBody.split('\n');
          if (lines.length > options.maxLinesPerFile) {
            outputBody = lines.slice(0, options.maxLinesPerFile).join('\n') +
              `\n\n[... truncated ${lines.length - options.maxLinesPerFile} lines ...]`;
          }
        }

        return {
          content: `--- File: /${normalizedPath} ---\n\n${outputBody}\n\n`,
          path: normalizedPath,
          size: fileStats.size
        };
      } catch (error) {
        stats.errors.push(`${normalizedPath}: ${error.message}`);
        trackSkippedFile(normalizedPath, `Error: ${error.message}`);
        return null;
      }
    };

    const results = await Promise.all(allFiles.map((fp, index) => limit(() => processFile(fp, index))));
    progressBar.stop();

    const successfulFileObjects = results.filter(Boolean);
    const contentArray = successfulFileObjects.map(f => f.content);

    // Return all processed data instead of writing file
    return {
      stats,
      contentArray,
      successfulFileObjects,
      allFiles,
      originalCwd,
      repoPath
    };

  } finally {
    process.chdir(originalCwd); // Ensure we always change back
  }
}

export async function createRepoSnapshot(repoPath, options) {
  const spinner = ora('Analyzing project...').start();
  try {
    // Ensure snapshots/ is in .gitignore to prevent accidental commits
    await ensureSnapshotsInGitignore(repoPath);

    // Initialize .eck manifest directory if it doesn't exist
    await initializeEckManifest(repoPath);

    // Auto-commit unstaged changes if in a git repo
    const isGitRepo = await checkGitRepository(repoPath);
    if (isGitRepo) {
      spinner.text = 'Checking for unstaged changes...';
      try {
        const { stdout: status } = await execa('git', ['status', '--porcelain'], { cwd: repoPath });
        if (status) {
          spinner.text = 'Unstaged changes detected. Auto-committing...';
          await execa('git', ['add', '.'], { cwd: repoPath });
          const commitTimestamp = generateTimestamp();
          await execa('git', ['commit', '-m', `chore(snapshot): Auto-commit before snapshot [${commitTimestamp}]`], { cwd: repoPath });
          spinner.info('Auto-commit complete.');
        } else {
          // No changes, do nothing. Logging this would be too verbose.
        }
      } catch (e) {
        spinner.warn(`Auto-commit failed: ${e.message}`);
      }
    }
    spinner.text = 'Analyzing project...'; // Reset spinner text

    // Detect project type first
    const projectDetection = await detectProjectType(repoPath);
    spinner.stop();
    displayProjectInfo(projectDetection);

    const setupConfig = await loadSetupConfig();
    const userConfig = await loadConfig(options.config);

    // Update project context based on detection
    if (projectDetection.type !== 'unknown' && projectDetection.details) {
      setupConfig.projectContext = createDynamicProjectContext(projectDetection);
    }

    // Merge configs: setup.json base, user overrides, command options
    const config = {
      ...userConfig, // Start with old defaults
      ...setupConfig.fileFiltering, // Overwrite with setup.json values
      ...setupConfig.performance,
      defaultFormat: setupConfig.output?.defaultFormat || 'md',
      aiHeaderEnabled: setupConfig.aiInstructions?.header?.defaultEnabled ?? true,
      ...options // Command-line options have the final say
    };

    // Detect architect modes
    const isJag = options.jag;
    const isJas = options.jas;
    const isJao = options.jao;

    // If NOT in Junior Architect mode, hide JA-specific documentation to prevent context pollution
    if (!options.withJa && !isJag && !isJas && !isJao) {
      if (!config.filesToIgnore) config.filesToIgnore = [];
      config.filesToIgnore.push(
        'COMMANDS_REFERENCE.md',
        'codex_delegation_snapshot.md'
      );
    }

    // Apply defaults for options that may not be provided via command line
    if (!config.output) {
      config.output = setupConfig.output?.defaultPath || './snapshots';
    }
    // For tree option, we need to check if --no-tree was explicitly passed
    // Commander.js sets tree to false when --no-tree is passed, true otherwise
    // We only want to use the config default if the user didn't specify --no-tree
    if (!('noTree' in options)) {
      // User didn't pass --no-tree, so we can use the config default
      config.tree = setupConfig.output?.includeTree ?? true;
    }
    if (config.includeHidden === undefined) {
      config.includeHidden = setupConfig.fileFiltering?.includeHidden ?? false;
    }

    const estimation = await estimateProjectTokens(repoPath, config, projectDetection.type);
    spinner.info(`Estimated project size: ~${Math.round(estimation.estimatedTokens).toLocaleString()} tokens.`);

    spinner.succeed('Creating snapshots...');

    // --- LOGIC UPDATE: Always include content ---
    // The Architect needs full visibility of the code to make decisions.
    // We strictly use processProjectFiles for all modes.

    let stats, contentArray, successfulFileObjects, allFiles, processedRepoPath;

    const result = await processProjectFiles(repoPath, options, config, projectDetection.type);
    stats = result.stats;
    contentArray = result.contentArray;
    successfulFileObjects = result.successfulFileObjects;
    allFiles = result.allFiles;
    processedRepoPath = result.repoPath;

    const originalCwd = process.cwd(); // Get CWD *before* chdir
    process.chdir(processedRepoPath); // Go back to repo path for git hash and tree

    try {
      // --- Common Data ---
      const timestamp = generateTimestamp();
      const repoName = path.basename(processedRepoPath);
      const gitHash = await getGitCommitHash(processedRepoPath);
      const fileExtension = options.format || config.defaultFormat || 'md';
      const outputPath = options.output || path.resolve(originalCwd, config.output);
      await fs.mkdir(outputPath, { recursive: true });

      const shouldIncludeTree = config.tree && !options.noTree;
      let directoryTree = '';
      if (shouldIncludeTree) {
        console.log('🌳 Generating directory tree...');
        directoryTree = await generateDirectoryTree(processedRepoPath, '', allFiles, 0, config.maxDepth || 10, config);
      }

      // Calculate included file stats by extension
      const includedFilesByType = new Map();
      for (const fileObj of successfulFileObjects) {
        try {
          let ext = path.extname(fileObj.path);
          if (ext === '') ext = '.no-extension';
          includedFilesByType.set(ext, (includedFilesByType.get(ext) || 0) + 1);
        } catch (e) { /* Silently ignore */ }
      }
      const sortedIncludedStats = [...includedFilesByType.entries()].sort((a, b) => b[1] - a[1]);

      // Calculate Top 10 Largest Files
      const largestFiles = [...successfulFileObjects].sort((a, b) => b.size - a.size).slice(0, 10);

      // Load manifest for headers
      const eckManifest = await loadProjectEckManifest(processedRepoPath);
      const isGitRepo = await checkGitRepository(processedRepoPath);

      // --- BRANCH 1: Generate Snapshot File (ALWAYS) ---
      let architectFilePath = null;
      let jaFilePath = null;

      // File body always includes full content
      let fileBody = (directoryTree ? `\n## Directory Structure\n\n\`\`\`\n${directoryTree}\`\`\`\n\n` : '') + contentArray.join('');

      // Helper to write snapshot file
      const writeSnapshot = async (suffix, isAgentMode) => {
        // CHANGE: Force agent to FALSE for the main snapshot header.
        // The snapshot is read by the Human/Senior Arch, not the Agent itself.
        // The Agent reads CLAUDE.md.
        const opts = { ...options, agent: false, jag: isJag, jas: isJas, jao: isJao };
        const header = await generateEnhancedAIHeader({ stats, repoName, mode: 'file', eckManifest, options: opts, repoPath: processedRepoPath }, isGitRepo);

        // Compact filename format: eck{timestamp}_{hash}_{suffix}.md
        const shortHash = gitHash ? gitHash.substring(0, 7) : '';
        let fname = `eck${timestamp}`;
        if (shortHash) fname += `_${shortHash}`;

        // Add mode suffix
        if (options.skeleton) {
          fname += '_sk';
        } else if (suffix) {
          fname += suffix;
        }

        fname += `.${fileExtension}`;
        const fpath = path.join(outputPath, fname);
        await fs.writeFile(fpath, header + fileBody);
        console.log(`📄 Generated Snapshot: ${fname}`);
        return fpath;
      };

      // Generate snapshot file for ALL modes
      if (isJag) {
        architectFilePath = await writeSnapshot('_jag', true);
      } else if (isJas) {
        architectFilePath = await writeSnapshot('_jas', true);
      } else if (isJao) {
        architectFilePath = await writeSnapshot('_jao', true);
      } else {
        // Standard snapshot behavior
        architectFilePath = await writeSnapshot('', false);

        // --- File 2: Junior Architect Snapshot (legacy --with-ja support) ---
        if (options.withJa && fileExtension === 'md') {
          console.log('🖋️ Generating Junior Architect (_ja) snapshot...');
          jaFilePath = await writeSnapshot('_ja', true);
        }
      }

      // Save git anchor for future delta updates
      await saveGitAnchor(processedRepoPath);

      // Reset update counter for sequential tracking
      try {
        const counterPath = path.join(processedRepoPath, '.eck', 'update_seq');
        await fs.mkdir(path.dirname(counterPath), { recursive: true });
        // Format: HASH:COUNT
        const shortHash = gitHash ? gitHash.substring(0, 7) : 'nohash';
        await fs.writeFile(counterPath, `${shortHash}:0`);
      } catch (e) {
        // Non-critical, continue
      }

      // --- BRANCH 2: Update CLAUDE.md (JAS / JAO / Default) ---
      console.log('🔐 Scanning for confidential files...');
      const confidentialFiles = await scanEckForConfidentialFiles(processedRepoPath, config);

      let claudeMode = 'coder';
      if (isJas) claudeMode = 'jas';
      if (isJao) claudeMode = 'jao';
      if (isJag) claudeMode = 'jag';

      await updateClaudeMd(processedRepoPath, claudeMode, directoryTree, confidentialFiles);

      // --- Combined Report ---
      console.log('\n✅ Snapshot generation complete!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (architectFilePath) {
        console.log(`📄 Snapshot File: ${architectFilePath}`);
      }
      if (jaFilePath) {
        console.log(`📄 Junior Arch File: ${jaFilePath}`);
      }

      console.log(`📊 Files scanned: ${stats.totalFiles}`);
      console.log(`📊 Files processed: ${stats.includedFiles}/${stats.totalFiles}`);
      console.log(`📏 Total size: ${formatSize(stats.totalSize)}`);
      console.log(`📦 Processed size: ${formatSize(stats.processedSize)}`);
      console.log(`📋 Format: ${fileExtension.toUpperCase()}`);

      if (sortedIncludedStats.length > 0) {
        console.log('\n📦 Included File Types:');
        console.log('---------------------------------');
        for (const [ext, count] of sortedIncludedStats.slice(0, 10)) {
          console.log(`   - ${String(ext).padEnd(15)} ${String(count).padStart(5)} files`);
        }
        if (sortedIncludedStats.length > 10) {
          console.log(`   ... and ${sortedIncludedStats.length - 10} other types.`);
        }
      }

      if (largestFiles.length > 0) {
        console.log('\n🐘 Top 10 Largest Files (Included):');
        console.log('---------------------------------');
        for (const fileObj of largestFiles) {
          console.log(`   - ${String(formatSize(fileObj.size)).padEnd(15)} ${fileObj.path}`);
        }
      }

      // Security Report Section
      if (stats.secretsRedacted > 0) {
        console.log('\n🔐 Security:');
        console.log('---------------------------------');
        console.log(chalk.yellow(`   ⚠️  ${stats.secretsRedacted} secret(s) detected and redacted`));
      }

      // Excluded/Skipped Files Section
      const hasExcludedContent = stats.excludedFiles > 0 || stats.binaryFiles > 0 || stats.oversizedFiles > 0 || stats.ignoredFiles > 0 || stats.errors.length > 0;
      if (hasExcludedContent) {
        console.log('\n🚫 Excluded/Skipped Files:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }

      if (stats.excludedFiles > 0) {
        console.log(`🚫 Excluded files: ${stats.excludedFiles}`);
      }
      if (stats.binaryFiles > 0) {
        console.log(`📱 Binary files skipped: ${stats.binaryFiles}`);
      }
      if (stats.oversizedFiles > 0) {
        console.log(`📏 Oversized files skipped: ${stats.oversizedFiles}`);
      }
      if (stats.ignoredFiles > 0) {
        console.log(`🙈 Ignored files: ${stats.ignoredFiles}`);
      }
      if (stats.errors.length > 0) {
        console.log(`❌ Errors: ${stats.errors.length}`);
        if (options.verbose) {
          stats.errors.forEach(err => console.log(`   ${err}`));
        }
      }

      // Print detailed skip reasons report
      if (stats.skippedFilesDetails.size > 0) {
        console.log('\n📋 Skip Reasons:');
        console.log('---------------------------------');

        for (const [reason, files] of stats.skippedFilesDetails.entries()) {
          console.log(`\n🔸 ${reason} (${files.length} files):`);
          files.forEach(file => {
            console.log(`   • ${file}`);
          });
        }
        console.log('---------------------------------');
      } else {
        console.log('---------------------------------');
      }

      // Generate training command string if estimation data is available
      if (estimation && projectDetection.type && !options.profile) {
        const trainingCommand = generateTrainingCommand(projectDetection.type, estimation.estimatedTokens, estimation.totalSize, repoPath);
        console.log('\n🎯 To improve token estimation accuracy, run this command after checking actual tokens:');
        console.log(`${trainingCommand}[ACTUAL_TOKENS_HERE]`);
        console.log('   Replace [ACTUAL_TOKENS_HERE] with the real token count from your LLM');
      }

    } finally {
      process.chdir(originalCwd); // Final reset back to original CWD
    }
  } catch (error) {
    spinner.fail(`Operation failed: ${error.message}`);
    process.exit(1);
  }
}
