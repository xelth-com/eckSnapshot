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
  getShortRepoName, SecretScanner
} from '../../utils/fileUtils.js';
import { detectProjectType, getProjectSpecificFiltering, getAllDetectedTypes } from '../../utils/projectDetector.js';
import { estimateTokensWithPolynomial, generateTrainingCommand } from '../../utils/tokenEstimator.js';
import { loadSetupConfig, getProfile } from '../../config.js';
import { applyProfileFilter } from '../../utils/fileUtils.js';
import { saveGitAnchor } from '../../utils/gitUtils.js';
import { skeletonize } from '../../core/skeletonizer.js';
import { getDepthConfig } from '../../core/depthConfig.js';
import { updateClaudeMd } from '../../utils/claudeMdGenerator.js';
import { generateOpenCodeAgents } from '../../utils/opencodeAgentsGenerator.js';
import { ensureProjectMcpConfig, ensureProjectOpenCodeConfig, ensureProjectCodexConfig } from './setupMcp.js';

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

// Global hard-ignore patterns (must match exactly in scanDirectoryRecursively)
const GLOBAL_HARD_IGNORE_DIRS = ['node_modules', '.git', '.idea', '.vscode'];
const GLOBAL_HARD_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'go.sum'];

function shouldHardIgnore(entryName, isDirectory) {
  if (isDirectory) {
    return GLOBAL_HARD_IGNORE_DIRS.includes(entryName);
  }
  return GLOBAL_HARD_IGNORE_FILES.includes(entryName);
}

async function getProjectFiles(projectPath, config) {
  const isGitRepo = await checkGitRepository(projectPath);
  if (isGitRepo) {
    const { stdout } = await execa('git', ['ls-files'], { cwd: projectPath });
    const gitFiles = stdout.split('\n').filter(Boolean);

    // Build effective dirsToIgnore list (global hard-ignores + config)
    const dirsToIgnore = [...GLOBAL_HARD_IGNORE_DIRS, ...(config.dirsToIgnore || []).map(d => d.replace(/\/$/, ''))];
    const filesToIgnore = [...GLOBAL_HARD_IGNORE_FILES, ...(config.filesToIgnore || [])];
    const extensionsToIgnore = config.extensionsToIgnore || [];

    const filteredFiles = gitFiles.filter(file => {
      if (isHiddenPath(file)) return false;
      const fileName = file.split('/').pop();
      const fileExt = path.extname(fileName);
      // Check if any parent directory should be ignored
      const pathParts = file.split('/');
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (dirsToIgnore.includes(pathParts[i])) return false;
      }
      // Check filesToIgnore
      if (filesToIgnore.includes(fileName)) return false;
      // Check extensionsToIgnore
      if (fileExt && extensionsToIgnore.includes(fileExt)) return false;
      return true;
    });
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

async function estimateProjectTokens(projectPath, config, projectTypes = null) {
  // Get project-specific filtering if not provided
  if (!projectTypes) {
    const detection = await detectProjectType(projectPath);
    projectTypes = getAllDetectedTypes(detection);
  }

  const projectSpecific = await getProjectSpecificFiltering(projectTypes);

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
  // Token estimation uses the primary type for coefficient lookup
  const primaryType = Array.isArray(projectTypes) ? projectTypes[0] : projectTypes;
  const estimatedTokens = await estimateTokensWithPolynomial(primaryType, totalSize);

  return { estimatedTokens, totalSize, includedFiles };
}

async function processProjectFiles(repoPath, options, config, projectTypes = null) {
  // Merge project-specific filtering rules for ALL detected types (polyglot monorepo support)
  if (projectTypes) {
    const projectSpecific = await getProjectSpecificFiltering(projectTypes);
    config = {
      ...config,
      dirsToIgnore: [...(config.dirsToIgnore || []), ...(projectSpecific.dirsToIgnore || [])],
      filesToIgnore: [...(config.filesToIgnore || []), ...(projectSpecific.filesToIgnore || [])],
      extensionsToIgnore: [...(config.extensionsToIgnore || []), ...(projectSpecific.extensionsToIgnore || [])]
    };
  }

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
      const filterResult = await applyProfileFilter(allFiles, options.profile, repoPath);
      allFiles = filterResult.files;
      console.log(`Filtered down to ${allFiles.length} files based on profile rules.`);
      if (allFiles.length === 0) {
        // Build helpful error message
        let errorMsg = `Profile filter '${options.profile}' resulted in 0 files.`;

        if (filterResult.notFoundProfiles.length > 0) {
          errorMsg += `\n\n❌ Profile(s) not found: ${filterResult.notFoundProfiles.join(', ')}`;
          errorMsg += `\n\n💡 Run 'eck-snapshot snapshot --profile' to see available profiles.`;
          errorMsg += `\n   Or run 'eck-snapshot generate-profile-guide' to create profiles.`;
        } else if (filterResult.foundProfiles.length > 0) {
          errorMsg += `\n\n✓ Profile(s) found: ${filterResult.foundProfiles.join(', ')}`;
          errorMsg += `\n❌ But their include patterns matched 0 files in your project.`;
          errorMsg += `\n\n💡 Check your profile's include/exclude patterns in .eck/profiles.json`;
        }

        throw new Error(errorMsg);
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
            content = await skeletonize(content, normalizedPath, { preserveDocs: options.preserveDocs !== false });
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

/**
 * Groups files by directory and packs them into chunks of a given maximum size.
 * Preserves directory locality for better RAG retrieval in NotebookLM.
 */
function packFilesForNotebookLM(successfulFileObjects, maxChunkSizeBytes = 2.5 * 1024 * 1024) {
  const dirGroups = new Map();

  for (const fileObj of successfulFileObjects) {
    const dir = fileObj.path.includes('/') ? fileObj.path.substring(0, fileObj.path.lastIndexOf('/')) : './';
    if (!dirGroups.has(dir)) dirGroups.set(dir, { size: 0, files: [] });
    const group = dirGroups.get(dir);
    group.files.push(fileObj);
    group.size += fileObj.size;
  }

  const sortedDirs = Array.from(dirGroups.keys()).sort();
  const chunks = [];
  let currentChunk = { size: 0, contentArray: [] };

  for (const dir of sortedDirs) {
    const group = dirGroups.get(dir);

    if (group.size > maxChunkSizeBytes) {
      // Directory too large — pack files individually
      for (const fileObj of group.files) {
        if (currentChunk.size + fileObj.size > maxChunkSizeBytes && currentChunk.contentArray.length > 0) {
          chunks.push(currentChunk);
          currentChunk = { size: 0, contentArray: [] };
        }
        currentChunk.contentArray.push(fileObj.content);
        currentChunk.size += fileObj.size;
      }
    } else if (currentChunk.size + group.size <= maxChunkSizeBytes) {
      // Directory fits in current chunk
      for (const f of group.files) currentChunk.contentArray.push(f.content);
      currentChunk.size += group.size;
    } else {
      // Start a new chunk
      chunks.push(currentChunk);
      currentChunk = { size: 0, contentArray: [] };
      for (const f of group.files) currentChunk.contentArray.push(f.content);
      currentChunk.size += group.size;
    }
  }

  if (currentChunk.contentArray.length > 0) chunks.push(currentChunk);
  return chunks;
}

export async function createRepoSnapshot(repoPath, options) {
  // Handle linked project depth settings before processing
  if (options.isLinkedProject) {
    const depthCfg = getDepthConfig(options.linkDepth !== undefined ? options.linkDepth : 0);
    if (depthCfg.skipContent) options.skipContent = true;
    if (depthCfg.skeleton !== undefined) options.skeleton = depthCfg.skeleton;
    if (depthCfg.preserveDocs !== undefined) options.preserveDocs = depthCfg.preserveDocs;
    if (depthCfg.maxLinesPerFile !== undefined) options.maxLinesPerFile = depthCfg.maxLinesPerFile;
  }

  const spinner = ora('Analyzing project...').start();
  try {
    // Ensure snapshots/ is in .gitignore to prevent accidental commits
    await ensureSnapshotsInGitignore(repoPath);

    // Initialize .eck manifest directory if it doesn't exist
    await initializeEckManifest(repoPath);

    // Handle --profile with no argument: list available profiles
    if (options.profile === true) {
      spinner.stop();
      const profilesPath = path.join(repoPath, '.eck', 'profiles.json');
      try {
        const profilesContent = await fs.readFile(profilesPath, 'utf-8');
        const profiles = JSON.parse(profilesContent);
        const profileNames = Object.keys(profiles).filter(name => !name.startsWith('_'));

        if (profileNames.length === 0) {
          console.log(chalk.yellow('\n⚠️  No profiles found in .eck/profiles.json'));
          console.log(`\nTo create profiles, run: ${chalk.green('eck-snapshot generate-profile-guide')}`);
          process.exit(0);
        }

        console.log(chalk.cyan('\n📋 Available Profiles:\n'));
        profileNames.forEach((name, index) => {
          const profile = profiles[name];
          const description = profile.description || 'No description';
          console.log(`${chalk.bold((index + 1) + '.')} ${chalk.green(name)}`);
          console.log(`   ${chalk.gray(description)}`);
          if (profile.include && profile.include.length > 0) {
            console.log(`   ${chalk.gray('Include:')} ${profile.include.slice(0, 3).join(', ')}${profile.include.length > 3 ? '...' : ''}`);
          }
          console.log('');
        });

        // Generate ready-to-copy command with all profiles
        const allProfilesString = profileNames.join(',');
        console.log(chalk.cyan('📝 Ready-to-Copy Command (all profiles):'));
        console.log(chalk.bold(`\neck-snapshot '{"name": "eck_snapshot", "arguments": {"profile": "${allProfilesString}"}}'\n`));
        console.log(chalk.gray('💡 Tip: Copy the command above and remove profiles you don\'t need'));
        process.exit(0);
      } catch (error) {
        spinner.stop();
        if (error.code === 'ENOENT') {
          console.log(chalk.yellow('\n⚠️  profiles.json not found'));
          console.log(`\nTo create profiles, run: ${chalk.green('eck-snapshot generate-profile-guide')}`);
        } else {
          console.log(chalk.red(`\n❌ Error reading profiles: ${error.message}`));
        }
        process.exit(1);
      }
    }

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
    const isJas = options.jas;
    const isJao = options.jao;
    const isJaz = options.jaz;

    // If NOT in Junior Architect mode, hide JA-specific documentation to prevent context pollution
    if (!options.withJa && !isJas && !isJao && !isJaz) {
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

    const allTypesForEstimation = getAllDetectedTypes(projectDetection);
    const estimation = await estimateProjectTokens(repoPath, config, allTypesForEstimation);
    spinner.info(`Estimated project size: ~${Math.round(estimation.estimatedTokens).toLocaleString()} tokens.`);

    spinner.succeed('Creating snapshots...');

    // --- LOGIC UPDATE: Always include content ---
    // The Architect needs full visibility of the code to make decisions.
    // We strictly use processProjectFiles for all modes.

    let stats, contentArray, successfulFileObjects, allFiles, processedRepoPath;

    const allTypes = getAllDetectedTypes(projectDetection);
    const result = await processProjectFiles(repoPath, options, config, allTypes);
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

      // --- NotebookLM Chunked Export (Brain + Body) ---
      if (options.notebooklm) {
        const mode = options.notebooklm; // 'scout', 'architect', or 'hybrid'
        console.log(chalk.blue(`\n📚 Packing project for NotebookLM (${mode.toUpperCase()} Mode)...`));

        const chunks = packFilesForNotebookLM(successfulFileObjects);
        const shortRepoName = getShortRepoName(repoName);
        const absPath = processedRepoPath.replace(/\\/g, '/');
        const filePrefix = mode === 'architect' ? 'notelm' : (mode === 'hybrid' ? 'hybrid' : 'booklm');

        // Clean up old notebooklm chunks
        try {
          const existingFiles = await fs.readdir(outputPath);
          for (const file of existingFiles) {
            if (file.includes('_booklm_part') || file.includes('_notelm_part') || file.includes('_hybrid_part')) {
              await fs.unlink(path.join(outputPath, file));
            }
          }
        } catch (e) { /* ignore */ }

        // Generate Console System Prompt based on Mode
        let systemPrompt = '';
        if (mode === 'scout') {
          systemPrompt += `You are an expert code analyst and retrieval specialist.\n`;
          systemPrompt += `Your goal is NOT to write code, but to help the primary Architect find exact files in this repository.\n`;
          systemPrompt += `When asked about a feature, bug, or module, analyze the provided sources and output precise bash commands to extract them.\n\n`;
          systemPrompt += `RULES FOR FETCH COMMANDS:\n`;
          systemPrompt += `1. Always start with: \`cd ${absPath}\`\n`;
          systemPrompt += `2. Use relative glob patterns: \`eck-snapshot fetch "**/auth.js" "**/userController.js"\`\n`;
          systemPrompt += `3. Output commands in a bash block with a brief explanation of why you selected those files.\n`;
        } 
        else if (mode === 'architect') {
          systemPrompt += `You are the Senior Software Architect for this project.\n`;
          systemPrompt += `Analyze the provided source documents to solve complex structural problems, design new features, and propose refactoring strategies.\n\n`;
          systemPrompt += `RULES FOR CODE GENERATION:\n`;
          systemPrompt += `1. Output precise code modifications using Eck-Protocol v2.\n`;
          systemPrompt += `2. Wrap the entire response in quadruple backticks (\`\`\`\`).\n`;
          systemPrompt += `3. Use \`<file path="..." action="replace">\` XML tags for files.\n`;
          systemPrompt += `4. Always consult the BRAIN document (part 0) before answering to understand project constraints.\n`;
        } 
        else if (mode === 'hybrid') {
          systemPrompt += `You are a Senior Software Architect managing a multi-repository ecosystem.\n\n`;
          systemPrompt += `YOUR DATA SOURCES:\n`;
          systemPrompt += `1. Primary Project (part0_BRAIN, part1, etc.): The main repository you are actively developing.\n`;
          systemPrompt += `2. Linked Projects (link_*.md): Companion repositories (e.g., backend + mobile). You CAN modify code here if cross-project sync is needed.\n`;
          systemPrompt += `3. Scouted Projects (scout_*.md): External repositories loaded STRICTLY for read-only reference. NEVER write code for scouted projects.\n\n`;
          systemPrompt += `RULES:\n`;
          systemPrompt += `- Use Eck-Protocol v2 format (quadruple backticks \`\`\`\`, <file> tags) for ALL code generation.\n`;
          systemPrompt += `- If modifying a Linked Project, clearly specify the project path.\n`;
          systemPrompt += `- If you need missing file contents from linked/scouted projects, output bash commands to fetch them: \`cd /path/to/project && eck-snapshot fetch "**/api.rs"\`.\n`;
        }

        // --- Part 0: The Brain (Manifests + Tree ONLY) ---
        let part0 = `# 🧠 NOTEBOOKLM KNOWLEDGE BASE — PART 0 (THE BRAIN)\n`;
        part0 += `**Primary Project:** ${repoName}\n**Absolute Path:** ${absPath}\n\n`;
        part0 += `*(Note: Your core instructions are configured in the Chat Settings / Custom Instructions)*\n\n`;

        // Add .eck manifests
        if (eckManifest) {
          part0 += `## 📑 Project Context & Manifests\n\n`;
          if (eckManifest.context) part0 += `### CONTEXT\n${eckManifest.context}\n\n`;
          if (eckManifest.techDebt) part0 += `### TECH DEBT\n${eckManifest.techDebt}\n\n`;
          if (eckManifest.roadmap) part0 += `### ROADMAP\n${eckManifest.roadmap}\n\n`;
          if (eckManifest.operations) part0 += `### OPERATIONS\n${eckManifest.operations}\n\n`;
          // Include any dynamic .eck files
          if (eckManifest.dynamicFiles) {
            for (const [name, content] of Object.entries(eckManifest.dynamicFiles)) {
              part0 += `### ${name.replace('.md', '').toUpperCase()}\n${content}\n\n`;
            }
          }
        }

        // Add full directory tree
        if (directoryTree) {
          part0 += `## 🌳 Global Directory Structure\n\`\`\`text\n${directoryTree}\n\`\`\`\n`;
        }

        const part0Name = `eck_${shortRepoName}_${filePrefix}_part0_BRAIN.md`;
        await fs.writeFile(path.join(outputPath, part0Name), part0);
        console.log(chalk.magenta(`   🧠 Part 0 (Brain): ${part0Name}`));

        // --- Parts 1-N: The Body (Source Code Only) ---
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const header = `--- NOTEBOOKLM SOURCE CODE — PART ${i + 1} OF ${chunks.length} ---\n\n`;
          const body = header + chunk.contentArray.join('');

          const fname = `eck_${shortRepoName}_${filePrefix}_part${i + 1}.md`;
          await fs.writeFile(path.join(outputPath, fname), body);
          console.log(chalk.cyan(`   📄 Part ${i + 1}/${chunks.length}: ${fname} (${formatSize(chunk.size)})`));
        }

        console.log(chalk.green(`\n✅ NotebookLM export complete in ${outputPath}`));
        
        // --- CONSOLE OUTPUT INSTRUCTIONS ---
        console.log('\n⚙️  ' + chalk.yellow.bold(`NOTEBOOKLM SYSTEM PROMPT CONFIGURATION (${mode.toUpperCase()} MODE):`));
        console.log('---------------------------------------------------');
        console.log(`1. Open NotebookLM and go to: ${chalk.bold('Chat konfigurieren -> Benutzerdefiniert')} (Configure Chat -> Custom)`);
        console.log(`2. Copy the text below and paste it into the prompt window:`);
        
        console.log('\n' + chalk.bgWhite.black(' --- COPY BELOW THIS LINE --- '));
        console.log(chalk.cyan(systemPrompt));
        console.log(chalk.bgWhite.black(' --- COPY ABOVE THIS LINE --- ') + '\n');
        
        console.log(`3. Upload Part 0 and Parts 1-${chunks.length} as sources.`);
        if (mode === 'hybrid') {
          console.log(`4. Upload your 'link_*.md' and 'scout_*.md' files as additional sources.`);
        }

        await saveGitAnchor(processedRepoPath);
        return;
      }

      // --- Standard Snapshot Mode ---
      let fileBody = '';
      if (directoryTree) {
        fileBody += `\n## Directory Structure\n\n\`\`\`\n${directoryTree}\`\`\`\n\n`;
      }
      if (!options.skipContent) {
        fileBody += contentArray.join('');
      }

      // Helper to write snapshot file
      const writeSnapshot = async (suffix, isAgentMode) => {
        let header = '';
        if (options.isLinkedProject) {
          const absPath = processedRepoPath.replace(/\\/g, '/');
          header = `# 🔗 LINKED PROJECT: [${repoName}]\n\n`;
          header += `**ABSOLUTE PATH:** \`${absPath}\`\n`;
          header += `**CROSS-CONTEXT MODE:** This is a linked companion project provided for reference. DO NOT generate code for it directly in your response unless explicitly asked. To inspect files inside this project, use your tool (or ask the user) to run ONE of the following commands:\n\n`;
          header += `**Option A: Short format (Best for Windows PowerShell / CMD)**\n`;
          header += `\`eck-snapshot fetch "${absPath}/src/example.js"\`\n\n`;
          header += `**Option B: Pure JSON format (Best for Linux/Mac Bash/Zsh)**\n`;
          header += `\`eck-snapshot '{"name": "eck_fetch", "arguments": {"patterns": ["${absPath}/src/example.js"]}}'\`\n\n`;
          if (options.skipContent) {
            header += `*(Source code omitted due to linkDepth=0. Directory structure only.)*\n\n`;
          }
        } else {
          const opts = { ...options, agent: false, jas: isJas, jao: isJao, jaz: isJaz };
          header = await generateEnhancedAIHeader({ stats, repoName, mode: 'file', eckManifest, options: opts, repoPath: processedRepoPath }, isGitRepo);
        }

        // Compact filename format
        const shortHash = gitHash ? gitHash.substring(0, 7) : '';
        const shortRepoName = getShortRepoName(repoName);

        let fname = options.isLinkedProject ? `link_${shortRepoName}${timestamp}` : `eck${shortRepoName}${timestamp}`;
        if (shortHash) fname += `_${shortHash}`;

        // Add mode suffix
        if (options.skeleton) {
          fname += '_sk';
        } else if (suffix) {
          fname += suffix;
        }

        const fullContent = header + fileBody;
        const sizeKB = Math.max(1, Math.round(Buffer.byteLength(fullContent, 'utf-8') / 1024));
        fname += `_${sizeKB}kb.${fileExtension}`;
        const fpath = path.join(outputPath, fname);
        await fs.writeFile(fpath, fullContent);
        const approxTokens = Math.round(fullContent.length / 4);
        const tokensStr = approxTokens < 1000 ? `${approxTokens}` : `${(approxTokens / 1000).toFixed(1)}k`;
        console.log(`📄 Generated Snapshot: ${fname} (${sizeKB} KB | ~${tokensStr} tokens)`);

        // --- FEATURE: Active Snapshot ---
        if (!isAgentMode) {
          try {
            if (options.isLinkedProject) {
              // Link snapshots go to .eck/links/
              const linksDir = path.join(originalCwd, '.eck', 'links');
              await fs.mkdir(linksDir, { recursive: true });
              await fs.writeFile(path.join(linksDir, fname), fullContent);
              const approxTokens = Math.round(fullContent.length / 4);
              const tokensStr = approxTokens < 1000 ? `${approxTokens}` : `${(approxTokens / 1000).toFixed(1)}k`;
              console.log(chalk.cyan(`🔗 Link saved to .eck/links/${fname}`));
              console.log(chalk.gray(`   Size: ${sizeKB} KB | ~${tokensStr} tokens`));
            } else {
              // Main snapshots go to .eck/lastsnapshot/
              const snapDir = path.join(originalCwd, '.eck', 'lastsnapshot');
              await fs.mkdir(snapDir, { recursive: true });

              // Clean up OLD snapshots (keep AnswerToSA.md)
              const existingFiles = await fs.readdir(snapDir);
              for (const file of existingFiles) {
                if ((file.startsWith('eck') && file.endsWith('.md')) || file === 'answer.md') {
                  await fs.unlink(path.join(snapDir, file));
                }
              }

              await fs.writeFile(path.join(snapDir, fname), fullContent);
              console.log(chalk.cyan(`📋 Active snapshot updated in .eck/lastsnapshot/: ${fname}`));
            }
          } catch (e) {
            // Non-critical failure
            console.warn(chalk.yellow(`⚠️  Could not update active snapshot: ${e.message}`));
          }
        }
        // --------------------------------------------

        return fpath;
      };

      // Generate snapshot file for ALL modes
      if (isJas) {
        architectFilePath = await writeSnapshot('_jas', true);
      } else if (isJao) {
        architectFilePath = await writeSnapshot('_jao', true);
      } else if (isJaz) {
        architectFilePath = await writeSnapshot('_jaz', true);
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
      if (isJaz) claudeMode = 'jaz';

      // Claude Code exclusively uses CLAUDE.md
      if (isJas || isJao || (!isJaz && !options.withJa)) {
        await updateClaudeMd(processedRepoPath, claudeMode, directoryTree, confidentialFiles, { zh: options.zh });
        // Ensure .mcp.json with eck-core is present so Claude Code agents have MCP tools
        try {
          const mcpCreated = await ensureProjectMcpConfig(processedRepoPath);
          if (mcpCreated) {
            console.log(chalk.green('🔌 Created .mcp.json with eck-core MCP server'));
          }
        } catch (e) {
          // Non-critical — agent can still use manual fallback
        }
      }

      // OpenCode exclusively uses AGENTS.md
      if (isJaz || (!isJas && !isJao && !options.withJa)) {
        await generateOpenCodeAgents(processedRepoPath, claudeMode, directoryTree, confidentialFiles, { zh: options.zh });
        // Ensure local opencode.json has eck-core MCP server
        try {
          const mcpCreated = await ensureProjectOpenCodeConfig(processedRepoPath);
          if (mcpCreated) {
            console.log(chalk.green('🔌 Added eck-core to local opencode.json'));
          }
        } catch (e) {
          // Non-critical — agent can still use manual fallback
        }

        // Ensure Codex config if the directory exists
        try {
          const codexMcpCreated = await ensureProjectCodexConfig(processedRepoPath);
          if (codexMcpCreated) {
            console.log(chalk.green('🔌 Added eck-core to .codex/config.toml'));
          }
        } catch (e) {
          // Non-critical
        }
      }

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

      // Output AI Prompt Suggestion for stubborn LLMs
      console.log('\n🤖 AI PROMPT SUGGESTION (Crucial for ChatGPT, helpful for others):');
      console.log('---------------------------------------------------');
      console.log(chalk.yellow('💡 Tip: Gemini and Grok handle large files best. ChatGPT works but can be slow.'));
      console.log('If your AI ignores the file instructions and acts as an external reviewer,');
      console.log('copy and paste this exact text as your FIRST prompt along with the snapshot file:\n');
      console.log(chalk.cyan.bold('Read the SYSTEM DIRECTIVE at the very beginning of the attached file. Immediately assume the role of Senior Architect as instructed, then await my first task.\n'));

    } finally {
      process.chdir(originalCwd); // Final reset back to original CWD
    }
  } catch (error) {
    spinner.fail(`Operation failed: ${error.message}`);
    process.exit(1);
  }
}
