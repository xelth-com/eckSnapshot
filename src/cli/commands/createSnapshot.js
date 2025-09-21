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
    errors: [],
    skipReasons: new Map(),
    skippedFilesDetails: new Map()
  };

  try {
    process.chdir(repoPath);
    
    console.log('🔍 Scanning repository...');
    let allFiles = await getProjectFiles(repoPath, config);

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
      spinner.succeed('Project is small. Creating dual snapshots...');
      
      // Step 1: Process all files ONCE
      const { 
        stats, 
        contentArray, 
        successfulFileObjects, 
        allFiles, 
        originalCwd: processingOriginalCwd, // We get originalCwd from the processing function
        repoPath: processedRepoPath 
      } = await processProjectFiles(repoPath, options, config, projectDetection.type);

      const originalCwd = process.cwd(); // Get CWD *before* chdir
      process.chdir(processedRepoPath); // Go back to repo path for git hash and tree

      try {
        // --- Common Data --- 
        const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
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

        const fileBody = (directoryTree ? `\n## Directory Structure\n\n\`\`\`\n${directoryTree}\`\`\`\n\n` : '') + contentArray.join('');

        // --- File 1: Architect Snapshot --- 
        const architectOptions = { ...options, agent: false };
        // Load manifest for headers
        const eckManifest = await loadProjectEckManifest(processedRepoPath);
        const isGitRepo = await checkGitRepository(processedRepoPath);

        const architectHeader = await generateEnhancedAIHeader({ stats, repoName, mode: 'file', eckManifest, options: architectOptions, repoPath: processedRepoPath }, isGitRepo);
        const architectBaseFilename = `${repoName}_snapshot_${timestamp}${gitHash ? `_${gitHash}` : ''}`;
        const architectFilename = `${architectBaseFilename}.${fileExtension}`;
        const architectFilePath = path.join(outputPath, architectFilename);
        await fs.writeFile(architectFilePath, architectHeader + fileBody);

        // --- File 2: Junior Architect Snapshot --- 
        let jaFilePath = null;
        if (!options.profile && !options.agent && fileExtension === 'md') { // Only create JA snapshot if main is MD
          console.log('🖋️ Generating Junior Architect (_ja) snapshot...');
          const jaOptions = { ...options, agent: true, noTree: false, noAiHeader: false };
          const jaHeader = await generateEnhancedAIHeader({ stats, repoName, mode: 'file', eckManifest, options: jaOptions, repoPath: processedRepoPath }, isGitRepo);
          const jaFilename = `${architectBaseFilename}_ja.${fileExtension}`;
          jaFilePath = path.join(outputPath, jaFilename);
          await fs.writeFile(jaFilePath, jaHeader + fileBody);
        }

        // --- Combined Report --- 
        console.log('\n✅ Snapshot generation complete!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📄 Architect File: ${architectFilePath}`);
        if (jaFilePath) {
          console.log(`📄 Junior Arch File: ${jaFilePath}`); // This is the new line user requested
        }
        console.log(`📊 Files processed: ${stats.includedFiles}/${stats.totalFiles}`);
        console.log(`📦 Processed size: ${formatSize(stats.processedSize)}`);

        // (Full stats reporting removed for brevity, can be re-added from original `runFileSnapshot`)

        if (estimation && projectDetection.type && !options.profile) {
          const trainingCommand = generateTrainingCommand(projectDetection.type, estimation.estimatedTokens, estimation.totalSize, repoPath);
          console.log('\n🎯 To improve token estimation accuracy, run this command after checking actual tokens:');
          console.log(`${trainingCommand}[ACTUAL_TOKENS_HERE]`);
        }

      } finally {
        process.chdir(originalCwd); // Final reset back to original CWD
      }
    }
  } catch (error) {
    spinner.fail(`Operation failed: ${error.message}`);
    process.exit(1);
  }
}