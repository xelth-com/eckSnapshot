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

import {
  parseSize, formatSize, matchesPattern, checkGitRepository, 
  scanDirectoryRecursively, loadGitignore, readFileWithSizeCheck, 
  generateDirectoryTree, loadConfig, displayProjectInfo, loadProjectEckManifest,
  ensureSnapshotsInGitignore, initializeEckManifest
} from '../../utils/fileUtils.js';
import { detectProjectType, getProjectSpecificFiltering } from '../../utils/projectDetector.js';
import { estimateTokensWithPolynomial, generateTrainingCommand } from '../../utils/tokenEstimator.js';
import { indexProject } from './indexProject.js';
import { loadSetupConfig, getProfile } from '../../config.js';
import { applyProfileFilter } from '../../utils/fileUtils.js';

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

async function getProjectFiles(projectPath, config) {
  const isGitRepo = await checkGitRepository(projectPath);
  if (isGitRepo) {
    const { stdout } = await execa('git', ['ls-files'], { cwd: projectPath });
    return stdout.split('\n').filter(Boolean);
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

async function runFileSnapshot(repoPath, options, config, estimation = null, projectType = null, filenameSuffix = '') {
  const originalCwd = process.cwd();
  console.log(`\n📸 Creating snapshot of: ${path.basename(repoPath)}`);
  console.log(`📁 Repository path: ${repoPath}`);
  
  // Initialize detailed stats with skip tracking
  const stats = {
    totalFiles: 0,
    includedFiles: 0,
    excludedFiles: 0,
    binaryFiles: 0,
    oversizedFiles: 0,
    ignoredFiles: 0,
    totalSize: 0,
    processedSize: 0,
    errors: [],
    skipReasons: new Map(),
    skippedFilesDetails: new Map()
  };

  try {
    process.chdir(repoPath);
    
    // Get all files and setup gitignore
    console.log('🔍 Scanning repository...');
    let allFiles = await getProjectFiles(repoPath, config);

    // --- Apply Advanced Profile Filtering ---
    if (options.profile) {
      console.log(`Applying profile filter: '${options.profile}'...`);
      allFiles = await applyProfileFilter(allFiles, options.profile, repoPath);
      console.log(`Filtered down to ${allFiles.length} files based on profile rules.`);
      if (allFiles.length === 0) {
        throw new Error(`Profile filter '${options.profile}' resulted in 0 files. Aborting.`);
      }
    }
    // --- End Profile Filtering ---
    const gitignore = await loadGitignore(repoPath);
    stats.totalFiles = allFiles.length;
    
    console.log(`📊 Found ${stats.totalFiles} files`);
    
    // Generate directory tree if enabled (config.tree can be overridden by --no-tree flag)
    let directoryTree = '';
    const shouldIncludeTree = config.tree && !options.noTree;
    if (shouldIncludeTree) {
      console.log('🌳 Generating directory tree...');
      directoryTree = await generateDirectoryTree(repoPath, '', allFiles, 0, config.maxDepth || 10, config);
    }
    
    // Setup progress bar
    const progressBar = new SingleBar({
      format: '📄 Processing |{bar}| {percentage}% | {value}/{total} files | {filename}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    }, Presets.rect);
    progressBar.start(allFiles.length, 0);
    
    // Helper function to track skipped files
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
        
        const content = await readFileWithSizeCheck(fullPath, maxFileSize);
        stats.includedFiles++;
        stats.processedSize += fileStats.size;
        
        return {
          content: `--- File: /${normalizedPath} ---\n\n${content}\n\n`,
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
    
    // Prepare basic info
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const repoName = path.basename(repoPath);
    const gitHash = await getGitCommitHash(repoPath);
    
    // Determine if AI header should be included
    // Priority: command line flag (aiHeader) overrides config setting (aiHeaderEnabled)
    // Commander.js converts --no-ai-header to aiHeader: false
    const shouldIncludeAiHeader = config.aiHeaderEnabled && (options.aiHeader !== false);
    
    // Check if this is a Git repository
    const isGitRepo = await checkGitRepository(repoPath);
    
    // Load .eck manifest if it exists
    const eckManifest = await loadProjectEckManifest(repoPath);
    
    // Generate AI header if needed (for both formats)
    let aiHeader = '';
    if (shouldIncludeAiHeader) {
      aiHeader = await generateEnhancedAIHeader({ stats, repoName, mode: 'file', eckManifest, options, repoPath }, isGitRepo);
    }
    
    // Prepare content based on format
    const outputPath = options.output || path.resolve(originalCwd, config.output);
    await fs.mkdir(outputPath, { recursive: true });
    
    let outputContent = '';
    let outputFilename = '';
    let fileExtension = options.format || config.defaultFormat || 'md';
    
    if (fileExtension === 'json') {
      // JSON format - convert Maps to objects for serialization
      const serializableStats = {
        ...stats,
        skipReasons: Object.fromEntries(stats.skipReasons),
        skippedFilesDetails: Object.fromEntries(stats.skippedFilesDetails)
      };
      
      const jsonOutput = {
        metadata: {
          repoName,
          timestamp: new Date().toISOString(),
          toolVersion: '4.0.0',
          format: 'json'
        },
        statistics: serializableStats,
        directoryTree: directoryTree,
        aiInstructionsHeader: aiHeader,
        files: contentArray.map(content => {
          const match = content.match(/--- File: \/(.+) ---\n\n([\s\S]*?)\n\n$/);
          return {
            path: match[1],
            content: match[2]
          };
        })
      };
      outputContent = JSON.stringify(jsonOutput, null, 2);
      const baseFilename = gitHash 
        ? `${repoName}_snapshot_${timestamp}_${gitHash}` 
        : `${repoName}_snapshot_${timestamp}`;

      outputFilename = `${baseFilename}${filenameSuffix}.${fileExtension}`;
    } else {
      // Markdown format (default)
      outputContent = aiHeader;
      
      if (directoryTree) {
        outputContent += '\n## Directory Structure\n\n```\n' + directoryTree + '```\n\n';
      }
      
      outputContent += contentArray.join('');
      const baseFilenameMd = gitHash 
        ? `${repoName}_snapshot_${timestamp}_${gitHash}` 
        : `${repoName}_snapshot_${timestamp}`;

      outputFilename = `${baseFilenameMd}${filenameSuffix}.${fileExtension}`;
    }
    
    const fullOutputFilePath = path.join(outputPath, outputFilename);
    await fs.writeFile(fullOutputFilePath, outputContent);
    
    // Print detailed summary
    console.log('\n✅ Snapshot completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📄 Output file: ${fullOutputFilePath}`);
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
    if (estimation && projectType && !options.profile) { // Do not show training prompt if a profile is used, as estimates will mismatch
      const trainingCommand = generateTrainingCommand(projectType, estimation.estimatedTokens, estimation.totalSize, repoPath);
      console.log('\n🎯 To improve token estimation accuracy, run this command after checking actual tokens:');
      console.log(`${trainingCommand}[ACTUAL_TOKENS_HERE]`);
      console.log('   Replace [ACTUAL_TOKENS_HERE] with the real token count from your LLM');
    }
    
  } finally {
    process.chdir(originalCwd);
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
          const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
          await execa('git', ['commit', '-m', `chore(snapshot): Auto-commit before snapshot [${timestamp}]`], { cwd: repoPath });
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
      smartModeTokenThreshold: setupConfig.smartMode.tokenThreshold,
      defaultFormat: setupConfig.output?.defaultFormat || 'md',
      aiHeaderEnabled: setupConfig.aiInstructions?.header?.defaultEnabled ?? true,
      ...options // Command-line options have the final say
    };
    
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

    if (estimation.estimatedTokens > config.smartModeTokenThreshold) {
      spinner.succeed('Project is large. Switching to vector indexing mode.');
      await indexProject(repoPath, options);
    } else {
      spinner.succeed('Project is small. Creating a single-file snapshot.');
      // Call 1: Standard Architect Snapshot
      await runFileSnapshot(repoPath, options, config, estimation, projectDetection.type, '');
      
      // Call 2: Junior Architect (_ja) Snapshot (if not a vector build)
      // Only run if this isn't *already* an agent build or a profile build
      if (!options.profile && !options.agent) {
        spinner.text = 'Generating Junior Architect (_ja) snapshot...';
        
        // Create new options for the JA snapshot
        const jaOptions = { 
          ...options, 
          agent: true,    // This triggers the detailed 'agent' format
          profile: null,  // Ensure JA snapshot is not profiled
          noTree: false,  // Ensure JA snapshot *has* a tree
          noAiHeader: false // Ensure JA snapshot *has* a header
        };
        
        // Call runFileSnapshot *again* with the new options and suffix
        await runFileSnapshot(repoPath, jaOptions, config, estimation, projectDetection.type, '_ja');
        spinner.succeed('Junior Architect snapshot generated.');
      }
    }
  } catch (error) {
    spinner.fail(`Operation failed: ${error.message}`);
    process.exit(1);
  }
}