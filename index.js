#!/usr/bin/env node

import { Command } from 'commander';
import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import isBinaryPath from 'is-binary-path';
import { fileURLToPath } from 'url';
import ignore from 'ignore';
import { SingleBar, Presets } from 'cli-progress';
import pLimit from 'p-limit';
import zlib from 'zlib';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gzip = promisify(zlib.gzip);

const DEFAULT_CONFIG = {
  filesToIgnore: ['package-lock.json', '*.log', 'yarn.lock'],
  extensionsToIgnore: ['.sqlite3', '.db', '.DS_Store', '.env', '.pyc', '.class', '.o', '.so', '.dylib'],
  dirsToIgnore: ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.nuxt/', 'target/', 'bin/', 'obj/'],
  maxFileSize: '10MB',
  maxTotalSize: '100MB',
  maxDepth: 10,
  concurrency: 10
};

function parseSize(sizeStr) {
  const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) throw new Error(`Invalid size format: ${sizeStr}`);
  const [, size, unit = 'B'] = match;
  return Math.floor(parseFloat(size) * units[unit.toUpperCase()]);
}

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Correctly matches a file path against glob-like patterns.
 * @param {string} filePath - The path of the file to check.
 * @param {string[]} patterns - An array of patterns to match against.
 * @returns {boolean} - True if the file path matches any of the patterns.
 */
function matchesPattern(filePath, patterns) {
    const fileName = path.basename(filePath);
    return patterns.some(pattern => {
        // This is a robust way to convert simple globs to regex
        // 1. Escape all special regex characters.
        // 2. Convert the glob star '*' into the regex '.*'.
        // 3. Anchor the pattern to match the whole string.
        const regexPattern = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
        try {
            const regex = new RegExp(regexPattern);
            return regex.test(fileName);
        } catch (e) {
            console.warn(`⚠️ Invalid regex pattern in config: "${pattern}"`);
            return false;
        }
    });
}


async function loadConfig(configPath) {
  let config = { ...DEFAULT_CONFIG };
  
  if (configPath) {
    try {
      const configModule = await import(path.resolve(configPath));
      config = { ...config, ...configModule.default };
      console.log(`✅ Configuration loaded from: ${configPath}`);
    } catch (error) {
      console.warn(`⚠️  Warning: Could not load config file: ${configPath}`);
    }
  } else {
    const possibleConfigs = [
      '.ecksnapshot.config.js',
      '.ecksnapshot.config.mjs',
      'ecksnapshot.config.js'
    ];
    
    for (const configFile of possibleConfigs) {
      try {
        await fs.access(configFile);
        const configModule = await import(path.resolve(configFile));
        config = { ...config, ...configModule.default };
        console.log(`✅ Configuration loaded from: ${configFile}`);
        break;
      } catch {
        // Config file doesn't exist, continue
      }
    }
  }
  
  return config;
}

async function checkGitAvailability() {
  try {
    await execa('git', ['--version']);
  } catch (error) {
    throw new Error('Git is not installed or not available in PATH');
  }
}

async function checkGitRepository(repoPath) {
  try {
    await execa('git', ['rev-parse', '--git-dir'], { cwd: repoPath });
  } catch (error) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }
}

async function loadGitignore(repoPath) {
  try {
    const gitignoreContent = await fs.readFile(path.join(repoPath, '.gitignore'), 'utf-8');
    const ig = ignore().add(gitignoreContent);
    console.log('✅ .gitignore patterns loaded');
    return ig;
  } catch {
    console.log('ℹ️  No .gitignore file found or could not be read');
    return ignore();
  }
}

async function readFileWithSizeCheck(filePath, maxFileSize) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > maxFileSize) {
      throw new Error(`File too large: ${formatSize(stats.size)}`);
    }
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.message.includes('too large')) throw error;
    throw new Error(`Could not read file: ${error.message}`);
  }
}

async function generateDirectoryTree(dir, prefix = '', allFiles, depth = 0, maxDepth = 10, config) {
  if (depth > maxDepth) return '';
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const sortedEntries = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    let tree = '';
    const validEntries = [];
    
    for (const entry of sortedEntries) {
      if (config.dirsToIgnore.some(d => entry.name.includes(d.replace('/', '')))) continue;
      
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
      
      if (entry.isDirectory() || allFiles.includes(relativePath)) {
        validEntries.push({ entry, fullPath, relativePath });
      }
    }
    
    for (let i = 0; i < validEntries.length; i++) {
      const { entry, fullPath, relativePath } = validEntries[i];
      const isLast = i === validEntries.length - 1;
      
      const connector = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');

      if (entry.isDirectory()) {
        tree += `${prefix}${connector}${entry.name}/\n`;
        tree += await generateDirectoryTree(fullPath, nextPrefix, allFiles, depth + 1, maxDepth, config);
      } else {
        tree += `${prefix}${connector}${entry.name}\n`;
      }
    }
    return tree;
  } catch (error) {
    console.warn(`⚠️  Warning: Could not read directory: ${dir}`);
    return '';
  }
}

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
    const errorReason = error.message.includes('too large') ? 'file-too-large' : 'read-error';
    
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

async function createRepoSnapshot(repoPath, options) {
  const absoluteRepoPath = path.resolve(repoPath);
  const absoluteOutputPath = path.resolve(options.output);
  const originalCwd = process.cwd();

  console.log(`🚀 Starting snapshot for repository: ${absoluteRepoPath}`);
  console.log(`📁 Snapshots will be saved to: ${absoluteOutputPath}`);

  try {
    const config = await loadConfig(options.config);
    config.maxFileSize = options.maxFileSize || config.maxFileSize;
    config.maxTotalSize = options.maxTotalSize || config.maxTotalSize;
    config.maxDepth = options.maxDepth || config.maxDepth;
    config.includeHidden = options.includeHidden || false;

    await checkGitAvailability();
    await checkGitRepository(absoluteRepoPath);
    
    process.chdir(absoluteRepoPath);
    console.log('✅ Successfully changed working directory');

    const gitignore = await loadGitignore(absoluteRepoPath);

    console.log('📋 Fetching file list from Git...');
    const { stdout } = await execa('git', ['ls-files']);
    const allFiles = stdout.split('\n').filter(Boolean);
    console.log(`📊 Found ${allFiles.length} total files in the repository`);

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

    console.log('📝 Processing files...');
    const limit = pLimit(config.concurrency);
    const progressBar = options.verbose ? null : new SingleBar({
      format: 'Progress |{bar}| {percentage}% | {value}/{total} files | ETA: {eta}s',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    }, Presets.shades_classic);

    if (progressBar) progressBar.start(allFiles.length, 0);

    const filePromises = allFiles.map((filePath, index) => 
      limit(async () => {
        const result = await processFile(filePath, config, gitignore, stats);
        
        if (progressBar) {
          progressBar.update(index + 1);
        } else if (options.verbose) {
          if (result.skipped) {
            console.log(`⏭️  Skipping: ${filePath} (${result.reason})`);
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
          console.warn(`⚠️  Warning: Approaching size limit. Some files may be excluded.`);
          break;
        }
        contentArray.push(result.value.content);
        totalSize += result.value.size;
      }
    }
    
    snapshotContent += contentArray.join('');
    const totalChars = snapshotContent.length;
    const estimatedTokens = Math.round(totalChars / 4);

    const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const repoName = path.basename(absoluteRepoPath);
    const extension = options.format === 'json' ? 'json' : 'txt';
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
    console.log(`⏭️  Skipped files: ${stats.skippedFiles}`);
    console.log(`🔢 Binary files skipped: ${stats.binaryFiles}`);
    console.log(`📏 Large files skipped: ${stats.largeFiles}`);
    if (options.tree) console.log('🌳 Directory tree included');
    if (options.compress) console.log('🗜️  File compressed with gzip');
    console.log(`📊 Total characters: ${totalChars.toLocaleString('en-US')}`);
    console.log(`🎯 Estimated tokens: ~${estimatedTokens.toLocaleString('en-US')}`);
    console.log(`💾 File size: ${formatSize(totalChars)}`);
    
    if (stats.includedFileTypes.size > 0) {
      console.log('\n📋 Included File Types Distribution:');
      const sortedIncludedTypes = Array.from(stats.includedFileTypes.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10); 
      
      for (const [ext, count] of sortedIncludedTypes) {
        console.log(`  ${ext}: ${count} files`);
      }
    }

    if (stats.skippedFileTypes.size > 0) {
      console.log('\n⏭️  Skipped File Types Distribution:');
      const sortedSkippedTypes = Array.from(stats.skippedFileTypes.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10); 
      
      for (const [ext, count] of sortedSkippedTypes) {
        console.log(`  ${ext}: ${count} files`);
      }
    }

    if (stats.skipReasons.size > 0) {
      console.log('\n📊 Skip Reasons:');
      const sortedReasons = Array.from(stats.skipReasons.entries())
        .sort(([,a], [,b]) => b - a);
      
      const reasonLabels = {
        'ignored-directory': 'Ignored directories',
        'ignored-extension': 'Ignored extensions',
        'ignored-pattern': 'Ignored patterns',
        'gitignore': 'Gitignore rules',
        'binary-file': 'Binary files',
        'hidden-file': 'Hidden files',
        'file-too-large': 'Files too large',
        'read-error': 'Read errors'
      };
      
      for (const [reason, count] of sortedReasons) {
        const label = reasonLabels[reason] || reason;
        console.log(`  ${label}: ${count} files`);
        
        if (stats.skippedFilesDetails.has(reason)) {
          const files = stats.skippedFilesDetails.get(reason);
          const filesToShow = files.slice(0, 10);
          
          for (const {file, ext} of filesToShow) {
            console.log(`    • ${file} (${ext})`);
          }
          
          if (files.length > 10) {
            console.log(`    ... and ${files.length - 10} more files`);
          }
        }
        console.log(); 
      }
    }

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
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
    } else if (error.message.includes('Not a git repository')) {
      console.error(error.message);
      console.error('Please run this command from within a Git repository or provide a valid repository path.');
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

// CLI setup
const program = new Command();

program
  .name('eck-snapshot')
  .description('A CLI tool to create a single text snapshot of a local Git repository.')
  .version('2.0.0')
  .argument('[repoPath]', 'Path to the git repository to snapshot.', process.cwd())
  .option('-o, --output <dir>', 'Output directory for the snapshot file.', path.join(__dirname, 'snapshots'))
  .option('--no-tree', 'Do not include the directory tree in the snapshot.')
  .option('-v, --verbose', 'Show detailed processing information, including skipped files.')
  .option('--max-file-size <size>', 'Maximum file size to include (e.g., 10MB)', '10MB')
  .option('--max-total-size <size>', 'Maximum total snapshot size (e.g., 100MB)', '100MB')
  .option('--max-depth <number>', 'Maximum directory depth for tree generation', parseInt, 10)
  .option('--config <path>', 'Path to configuration file')
  .option('--compress', 'Compress output file with gzip')
  .option('--include-hidden', 'Include hidden files (starting with .)')
  .option('--format <type>', 'Output format: txt, json', 'txt')
  .action(createRepoSnapshot);

program.parse(process.argv);