import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import pLimit from 'p-limit';
import { SingleBar, Presets } from 'cli-progress';
import isBinaryPath from 'is-binary-path';
import zlib from 'zlib';
import { promisify } from 'util';

import {
  parseSize, formatSize, matchesPattern, checkGitAvailability, 
  checkGitRepository, scanDirectoryRecursively, loadGitignore, 
  readFileWithSizeCheck, generateDirectoryTree, loadConfig
} from '../../utils/fileUtils.js';
import { generateEnhancedAIHeader } from '../../utils/aiHeader.js';

const gzip = promisify(zlib.gzip);

async function processFile(filePath, config, gitignore, stats) {
  const fileName = path.basename(filePath);
  const fileExt = path.extname(filePath) || 'no-extension';
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  let skipReason = null;
  
  if (config.dirsToIgnore.some(dir => normalizedPath.startsWith(dir))) {
    skipReason = 'ignored-directory';
  } else if (config.extensionsToIgnore.includes(path.extname(filePath))) {
    skipReason = 'ignored-extension';
  } else if (matchesPattern(filePath, config.filesToIgnore)) {
    skipReason = 'ignored-pattern';
  } else if (gitignore.ignores(normalizedPath)) {
    skipReason = 'gitignore';
  } else if (isBinaryPath(filePath)) {
    skipReason = 'binary-file';
  } else if (!config.includeHidden && fileName.startsWith('.')) {
    skipReason = 'hidden-file';
  }

  if (skipReason) {
    stats.skippedFiles++;
    stats.skippedFileTypes.set(fileExt, (stats.skippedFileTypes.get(fileExt) || 0) + 1);
    stats.skipReasons.set(skipReason, (stats.skipReasons.get(skipReason) || 0) + 1);
    
    if (!stats.skippedFilesDetails.has(skipReason)) {
      stats.skippedFilesDetails.set(skipReason, []);
    }
    stats.skippedFilesDetails.get(skipReason).push({ file: filePath, ext: fileExt });
    
    if (skipReason === 'binary-file') stats.binaryFiles++;
    return { skipped: true, reason: skipReason };
  }

  try {
    const content = await readFileWithSizeCheck(filePath, parseSize(config.maxFileSize));
    const fileContent = `--- File: /${normalizedPath} ---\n\n${content}\n\n`;
    
    stats.includedFiles++;
    stats.includedFileTypes.set(fileExt, (stats.includedFileTypes.get(fileExt) || 0) + 1);
    return { content: fileContent, size: fileContent.length };
  } catch (error) {
    const errorReason = error.message.includes('too large') ?
      'file-too-large' : 'read-error';
    
    stats.errors.push({ file: filePath, error: error.message });
    stats.skippedFiles++;
    stats.skippedFileTypes.set(fileExt, (stats.skippedFileTypes.get(fileExt) || 0) + 1);
    stats.skipReasons.set(errorReason, (stats.skipReasons.get(errorReason) || 0) + 1);
    
    if (!stats.skippedFilesDetails.has(errorReason)) {
      stats.skippedFilesDetails.set(errorReason, []);
    }
    stats.skippedFilesDetails.get(errorReason).push({ file: filePath, ext: fileExt });
    
    if (error.message.includes('too large')) {
      stats.largeFiles++;
    }
    
    return { skipped: true, reason: error.message };
  }
}

export async function createRepoSnapshot(repoPath, options) {
  const absoluteRepoPath = path.resolve(repoPath);
  const absoluteOutputPath = path.resolve(options.output);
  const originalCwd = process.cwd();

  console.log(`🚀 Starting snapshot for ${options.dir ? 'directory' : 'repository'}: ${absoluteRepoPath}`);
  console.log(`📁 Snapshots will be saved to: ${absoluteOutputPath}`);

  try {
    const config = await loadConfig(options.config);
    config.maxFileSize = options.maxFileSize || config.maxFileSize;
    config.maxTotalSize = options.maxTotalSize || config.maxTotalSize;
    config.maxDepth = options.maxDepth || config.maxDepth;
    config.includeHidden = options.includeHidden || false;
    
    let allFiles = [];
    let gitignore = null;
    let isGitRepo = false;
    
    if (!options.dir) {
      await checkGitAvailability();
      isGitRepo = await checkGitRepository(absoluteRepoPath);
      
      if (!isGitRepo) {
        console.log('ℹ️ Not a git repository, switching to directory mode');
        options.dir = true;
      }
    }
    
    process.chdir(absoluteRepoPath);
    console.log('✅ Successfully changed working directory');

    if (options.dir) {
      console.log('📋 Scanning directory recursively...');
      allFiles = await scanDirectoryRecursively(absoluteRepoPath, config);
      gitignore = await loadGitignore(absoluteRepoPath);
      console.log(`📊 Found ${allFiles.length} total files in the directory`);
    } else {
      gitignore = await loadGitignore(absoluteRepoPath);
      console.log('📋 Fetching file list from Git...');
      const { stdout } = await execa('git', ['ls-files']);
      allFiles = stdout.split('\n').filter(Boolean);
      console.log(`📊 Found ${allFiles.length} total files in the repository`);
    }

    const stats = {
      totalFiles: allFiles.length,
      includedFiles: 0,
      skippedFiles: 0,
      binaryFiles: 0,
      largeFiles: 0,
      errors: [],
      includedFileTypes: new Map(),
      skippedFileTypes: new Map(),
      skipReasons: new Map(),
      skippedFilesDetails: new Map()
    };
    
    let snapshotContent = '';

    if (options.tree) {
      console.log('🌳 Generating directory tree...');
      const tree = await generateDirectoryTree(absoluteRepoPath, '', allFiles, 0, config.maxDepth, config);
      snapshotContent += 'Directory Structure:\n\n';
      snapshotContent += tree;
      snapshotContent += '\n\n';
    }

    console.log('📁 Processing files...');
    const limit = pLimit(config.concurrency);
    
    const progressBar = options.verbose ?
      null : new SingleBar({
        format: 'Progress |{bar}| {percentage}% | {value}/{total} files | ETA: {eta}s',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      }, Presets.shades_classic);
    
    if (progressBar) progressBar.start(allFiles.length, 0);

    let processedCount = 0;
    const filePromises = allFiles.map((filePath) => 
      limit(async () => {
        const result = await processFile(filePath, config, gitignore, stats);
        
        processedCount++;
        if (progressBar) {
          progressBar.update(processedCount);
        } else if (options.verbose) {
          if (result.skipped) {
            console.log(`⏭️ Skipping: ${filePath} (${result.reason})`);
          } else {
            console.log(`✅ Processed: ${filePath}`);
          }
        }
        
        return result;
      })
    );
    
    const results = await Promise.allSettled(filePromises);
    if (progressBar) progressBar.stop();

    const contentArray = [];
    let totalSize = 0;
    const maxTotalSize = parseSize(config.maxTotalSize);
    
    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn(`⚠️ Promise rejected: ${result.reason}`);
        continue;
      }
      if (result.value && result.value.content) {
        if (totalSize + result.value.size > maxTotalSize) {
          console.warn(`⚠️ Warning: Approaching size limit. Some files may be excluded.`);
          break;
        }
        contentArray.push(result.value.content);
        totalSize += result.value.size;
      }
    }
    
    const repoName = path.basename(absoluteRepoPath);
    
    // Use enhanced header with agent support
    const header = generateEnhancedAIHeader(stats, repoName, options.aiHeader !== false, config);
    
    snapshotContent = header + snapshotContent + contentArray.join('');

    const totalChars = snapshotContent.length;
    const estimatedTokens = Math.round(totalChars / 4);

    const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const extension = options.format === 'json' ? 'json' : 'md';
    let outputFilename = `${repoName}_snapshot_${timestamp}.${extension}`;
    
    if (options.compress) {
      outputFilename += '.gz';
    }

    const fullOutputFilePath = path.join(absoluteOutputPath, outputFilename);
    let finalContent = snapshotContent;
    
    if (options.format === 'json') {
      const jsonData = {
        repository: repoName,
        timestamp: new Date().toISOString(),
        multiAgentSupport: true,
        stats: {
          ...stats,
          includedFileTypes: Object.fromEntries(stats.includedFileTypes),
          skippedFileTypes: Object.fromEntries(stats.skippedFileTypes),
          skipReasons: Object.fromEntries(stats.skipReasons),
          skippedFilesDetails: Object.fromEntries(
            Array.from(stats.skippedFilesDetails.entries()).map(([reason, files]) => [
              reason, 
              files.map(({file, ext}) => ({file, ext}))
            ])
          )
        },
        content: snapshotContent
      };
      finalContent = JSON.stringify(jsonData, null, 2);
    }

    await fs.mkdir(absoluteOutputPath, { recursive: true });
    
    if (options.compress) {
      const compressed = await gzip(finalContent);
      await fs.writeFile(fullOutputFilePath, compressed);
    } else {
      await fs.writeFile(fullOutputFilePath, finalContent);
    }

    console.log('\n📊 Snapshot Summary');
    console.log('='.repeat(50));
    console.log(`🎉 Snapshot created successfully!`);
    console.log(`📄 File saved to: ${fullOutputFilePath}`);
    console.log(`📈 Included text files: ${stats.includedFiles} of ${stats.totalFiles}`);
    console.log(`⏭️ Skipped files: ${stats.skippedFiles}`);
    console.log(`📢 Binary files skipped: ${stats.binaryFiles}`);
    console.log(`📏 Large files skipped: ${stats.largeFiles}`);
    if (options.tree) console.log('🌳 Directory tree included');
    if (options.compress) console.log('🗜️ File compressed with gzip');
    console.log(`📊 Total characters: ${totalChars.toLocaleString('en-US')}`);
    console.log(`🎯 Estimated tokens: ~${estimatedTokens.toLocaleString('en-US')}`);
    console.log(`💾 File size: ${formatSize(totalChars)}`);
    console.log(`🤖 Multi-Agent Support: ENABLED`);
    console.log(`🧠 Consilium Protocol: READY`);
    
    if (stats.includedFileTypes.size > 0) {
      console.log('\n📋 Included File Types Distribution:');
      const sortedIncludedTypes = Array.from(stats.includedFileTypes.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
      for (const [ext, count] of sortedIncludedTypes) {
        console.log(`  ${ext}: ${count} files`);
      }
    }

    if (stats.errors.length > 0) {
      console.log('\n⚠️ Errors encountered:');
      stats.errors.slice(0, 5).forEach(({ file, error }) => {
        console.log(`  ${file}: ${error}`);
      });
      if (stats.errors.length > 5) {
        console.log(`  ... and ${stats.errors.length - 5} more errors`);
      }
    }
    
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('\n❌ An error occurred:');
    if (error.code === 'ENOENT' && error.path && error.path.includes('.git')) {
      console.error(`Error: The path "${absoluteRepoPath}" does not seem to be a Git repository.`);
    } else if (error.message.includes('Git is not installed')) {
      console.error('Error: Git is not installed or not available in PATH.');
      console.error('Please install Git and ensure it\'s available in your system PATH.');
    } else {
      console.error(error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  } finally {
    process.chdir(originalCwd);
  }
}