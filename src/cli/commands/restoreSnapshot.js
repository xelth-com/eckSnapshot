import fs from 'fs/promises';
import path from 'path';
import { SingleBar, Presets } from 'cli-progress';
import pLimit from 'p-limit';
import zlib from 'zlib';
import { promisify } from 'util';
import inquirer from 'inquirer';

import { parseSnapshotContent, filterFilesToRestore, validateFilePaths } from '../../utils/fileUtils.js';

const gunzip = promisify(zlib.gunzip);

export async function restoreSnapshot(snapshotFile, targetDir, options) {
  const absoluteSnapshotPath = path.resolve(snapshotFile);
  const absoluteTargetDir = path.resolve(targetDir);
  
  console.log(`📄 Starting restore from snapshot: ${absoluteSnapshotPath}`);
  console.log(`📁 Target directory: ${absoluteTargetDir}`);

  try {
    let rawContent;
    
    if (snapshotFile.endsWith('.gz')) {
      const compressedBuffer = await fs.readFile(absoluteSnapshotPath);
      rawContent = (await gunzip(compressedBuffer)).toString('utf-8');
      console.log('✅ Decompressed gzipped snapshot');
    } else {
      rawContent = await fs.readFile(absoluteSnapshotPath, 'utf-8');
    }

    let filesToRestore;
    
    try {
      const jsonData = JSON.parse(rawContent);
      if (jsonData.content) {
        console.log('📄 Detected JSON format, extracting content');
        filesToRestore = parseSnapshotContent(jsonData.content);
      } else {
        throw new Error('JSON format detected, but no "content" key found');
      }
    } catch (e) {
      console.log('📄 Treating snapshot as plain text format');
      filesToRestore = parseSnapshotContent(rawContent);
    }
    
    if (filesToRestore.length === 0) {
      console.warn('⚠️ No files found to restore in the snapshot');
      return;
    }

    if (options.include || options.exclude) {
      filesToRestore = filterFilesToRestore(filesToRestore, options);
      if (filesToRestore.length === 0) {
        console.warn('⚠️ No files remaining after applying filters');
        return;
      }
    }

    const invalidFiles = validateFilePaths(filesToRestore, absoluteTargetDir);
    if (invalidFiles.length > 0) {
      console.error('❌ Invalid file paths detected (potential directory traversal):');
      invalidFiles.forEach(file => console.error(`  ${file}`));
      process.exit(1);
    }

    console.log(`📊 Found ${filesToRestore.length} files to restore`);
    
    if (options.dryRun) {
      console.log('\n🔍 Dry run mode - files that would be restored:');
      filesToRestore.forEach(file => {
        const fullPath = path.join(absoluteTargetDir, file.path);
        console.log(`  ${fullPath}`);
      });
      return;
    }

    if (!options.force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `You are about to write ${filesToRestore.length} files to ${absoluteTargetDir}. Existing files will be overwritten. Continue?`,
        default: false
      }]);
      
      if (!confirm) {
        console.log('🚫 Restore operation cancelled by user');
        return;
      }
    }

    await fs.mkdir(absoluteTargetDir, { recursive: true });
    
    const stats = {
      totalFiles: filesToRestore.length,
      restoredFiles: 0,
      failedFiles: 0,
      errors: []
    };
    
    const progressBar = options.verbose ? null : new SingleBar({
      format: 'Restoring |{bar}| {percentage}% | {value}/{total} files',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    }, Presets.shades_classic);
    
    if (progressBar) progressBar.start(filesToRestore.length, 0);

    const limit = pLimit(options.concurrency || 10);
    const filePromises = filesToRestore.map((file, index) => 
      limit(async () => {
        try {
          const fullPath = path.join(absoluteTargetDir, file.path);
          const dir = path.dirname(fullPath);

          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(fullPath, file.content, 'utf-8');
          
          stats.restoredFiles++;
          
          if (progressBar) {
            progressBar.update(index + 1);
          } else if (options.verbose) {
            console.log(`✅ Restored: ${file.path}`);
          }
          
          return { success: true, file: file.path };
        } catch (error) {
          stats.failedFiles++;
          stats.errors.push({ file: file.path, error: error.message });
          
          if (options.verbose) {
            console.log(`❌ Failed to restore: ${file.path} - ${error.message}`);
          }
          
          return { success: false, file: file.path, error: error.message };
        }
      })
    );

    await Promise.allSettled(filePromises);
    if (progressBar) progressBar.stop();

    console.log('\n📊 Restore Summary');
    console.log('='.repeat(50));
    console.log(`🎉 Restore completed!`);
    console.log(`✅ Successfully restored: ${stats.restoredFiles} files`);
    
    if (stats.failedFiles > 0) {
      console.log(`❌ Failed to restore: ${stats.failedFiles} files`);
      if (stats.errors.length > 0) {
        console.log('\n⚠️ Errors encountered:');
        stats.errors.slice(0, 5).forEach(({ file, error }) => {
          console.log(`  ${file}: ${error}`);
        });
        if (stats.errors.length > 5) {
          console.log(`  ... and ${stats.errors.length - 5} more errors`);
        }
      }
    }
    
    console.log(`📁 Target directory: ${absoluteTargetDir}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('\n❌ An error occurred during restore:');
    console.error(error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}