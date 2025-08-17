import { execa } from 'execa';
import path from 'path';
import fs from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';
import isBinaryPath from 'is-binary-path';
import { segmentFile } from '../../core/segmenter.js';
import { embeddingService } from '../../services/embedding.js';
import { LocalIndex } from 'vectra';
import { generateTimestamp, formatSize, matchesPattern, loadGitignore } from '../../utils/fileUtils.js';
import { loadSetupConfig } from '../../config.js';

async function getProjectFiles(projectPath) {
  try {
    const { stdout } = await execa('git', ['ls-files', '--exclude-standard', '-co'], { cwd: projectPath });
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    console.error(chalk.red('Error getting project files from git. Make sure you are in a git repository.'));
    throw error;
  }
}

async function readManifest(manifestPath) {
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return {}; // Return empty object if manifest doesn't exist or is invalid
  }
}

async function writeManifest(manifestPath, manifest) {
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function exportIndex(index, manifest, exportPath) {
    const exportSpinner = ora(`Exporting index to ${path.basename(exportPath)}...`).start();
    const data = [];
    const ids = Object.keys(manifest);
    for (const id of ids) {
        const item = await index.getItem(id);
        if (item) {
            data.push(item);
        }
    }
    await fs.writeFile(exportPath, JSON.stringify(data)); // Using more compact format
    exportSpinner.succeed(`Successfully exported ${data.length} items to ${exportPath}`);
}

export async function indexProject(projectPath, options) {
  const mainSpinner = ora(chalk.cyan('Starting project index synchronization...')).start();
  const indexPath = path.resolve(projectPath, './.ecksnapshot_index');
  const manifestPath = path.join(indexPath, 'index-manifest.json');

  try {
    const config = await loadSetupConfig();
    const gitignore = await loadGitignore(projectPath);

    mainSpinner.text = 'Scanning project files...';
    const allFiles = (await execa('git', ['ls-files', '--exclude-standard', '-co'], { cwd: projectPath })).stdout.split('\n').filter(Boolean);

    const stats = {
        totalFiles: allFiles.length,
        includedFiles: 0,
        skippedFiles: 0,
        binaryFiles: 0,
        gitignoredFiles: 0,
        configignoredFiles: 0,
        totalSize: 0,
        includedFileTypes: new Map(),
        skipReasons: new Map()
    };

    const filesToIndex = [];

    for (const file of allFiles) {
        const fullPath = path.join(projectPath, file);
        const fileStats = await fs.stat(fullPath).catch(() => ({ size: 0 }));
        stats.totalSize += fileStats.size;
        const fileExt = path.extname(file) || 'no-extension';

        if (gitignore.ignores(file)) {
            stats.skippedFiles++;
            stats.gitignoredFiles++;
            stats.skipReasons.set('gitignore', (stats.skipReasons.get('gitignore') || 0) + 1);
            continue;
        }
        if (isBinaryPath(file)) {
            stats.skippedFiles++;
            stats.binaryFiles++;
            stats.skipReasons.set('binary', (stats.skipReasons.get('binary') || 0) + 1);
            continue;
        }
        if (config.fileFiltering.extensionsToIgnore.includes(fileExt) || matchesPattern(file, config.fileFiltering.filesToIgnore)) {
            stats.skippedFiles++;
            stats.configignoredFiles++;
            stats.skipReasons.set('config', (stats.skipReasons.get('config') || 0) + 1);
            continue;
        }

        filesToIndex.push(file);
        stats.includedFiles++;
        stats.includedFileTypes.set(fileExt, (stats.includedFileTypes.get(fileExt) || 0) + 1);
    }

    mainSpinner.succeed('File scan complete.');

    await fs.mkdir(indexPath, { recursive: true });
    const index = new LocalIndex(indexPath);
    if (!await index.isIndexCreated()) {
      await index.createIndex();
    }

    const indexSpinner = ora('Reading index manifest...').start();
    const manifest = await readManifest(manifestPath);

    indexSpinner.text = 'Calculating file segments and hashes...';
    const currentState = new Map();
    
    for (const file of filesToIndex) {
      const fullPath = path.join(projectPath, file);
      const segments = await segmentFile(fullPath);
      for (const segment of segments) {
        currentState.set(segment.id, segment);
      }
    }

    indexSpinner.text = 'Comparing current state with manifest...';
    const toAdd = [];
    const toUpdate = [];
    const manifestIds = new Set(Object.keys(manifest));

    for (const [id, segment] of currentState.entries()) {
        if (!manifestIds.has(id)) {
            toAdd.push(segment);
        } else if (manifest[id] !== segment.contentHash) {
            toUpdate.push(segment);
        }
        manifestIds.delete(id);
    }
    const toDelete = manifestIds;
    const upToDateCount = currentState.size - toAdd.length - toUpdate.length;

    indexSpinner.succeed('Comparison complete. Sync Details:');
    console.log(`  - Total segments found:        ${chalk.bold(currentState.size)}`);
    console.log(`  - Segments to add:             ${chalk.green(toAdd.length)}`);
    console.log(`  - Segments to update:          ${chalk.yellow(toUpdate.length)}`);
    console.log(`  - Segments to delete:          ${chalk.red(toDelete.size)}`);
    console.log(`  - Segments up-to-date:         ${chalk.cyan(upToDateCount)}`);

    if (toAdd.length === 0 && toUpdate.length === 0 && toDelete.size === 0) {
      console.log(chalk.green('✅ Index is already up to date.'));
    } else {
      console.log('Starting index update...');

      const segmentsToProcess = [...toAdd, ...toUpdate];
      if (segmentsToProcess.length > 0) {
        const embedSpinner = ora(`Generating embeddings for ${segmentsToProcess.length} modified/new segments...`).start();
        const embeddings = await embeddingService.generateBatchEmbeddings(segmentsToProcess);
        for (let i = 0; i < segmentsToProcess.length; i++) {
          const segment = segmentsToProcess[i];
          await index.upsertItem({ id: segment.id, vector: embeddings[i], metadata: { ...segment } });
          manifest[segment.id] = segment.contentHash;
        }
        embedSpinner.succeed(`${segmentsToProcess.length} segments added or updated in the index.`);
      }

      if (toDelete.size > 0) {
          const deleteSpinner = ora(`Pruning ${toDelete.size} obsolete segments...`).start();
          for (const id of toDelete) {
              await index.deleteItem(id);
              delete manifest[id];
          }
          deleteSpinner.succeed(`${toDelete.size} obsolete segments pruned from the index.`);
      }

      await writeManifest(manifestPath, manifest);
    }

    console.log(`✅ Index synchronization complete!`);

    // Check for export condition
    const shouldExport = (options && options.export) || (config.vectorIndex && config.vectorIndex.autoExportOnIndex);

    if (shouldExport) {
        const projectName = path.basename(projectPath);
        const timestamp = generateTimestamp();
        const defaultFilename = `${projectName}_${timestamp}_vectors.json`;
        const outputPath = config.output?.defaultPath || './snapshots';
        await fs.mkdir(outputPath, { recursive: true });
        const finalDefaultPath = path.join(outputPath, defaultFilename);

        const exportPath = typeof (options && options.export) === 'string' ? options.export : finalDefaultPath;
        await exportIndex(index, manifest, path.resolve(exportPath));
    }

    // Print final statistics
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(chalk.bold('📊 Index Synced. File Statistics:'));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`- Total files in repository:      ${chalk.yellow(stats.totalFiles)}`);
    console.log(`- Files included in index:        ${chalk.green(stats.includedFiles)}`);
    console.log(`- Skipped (binary):               ${chalk.red(stats.binaryFiles)}`);
    console.log(`- Skipped (gitignore):            ${chalk.red(stats.gitignoredFiles)}`);
    console.log(`- Skipped (config rule):          ${chalk.red(stats.configignoredFiles)}`);
    console.log(`- Total project size:             ${chalk.yellow(formatSize(stats.totalSize))}`);

    if (stats.includedFileTypes.size > 0) {
        console.log(chalk.bold('\n📋 Included File Types Distribution:'));
        const sortedTypes = [...stats.includedFileTypes.entries()].sort((a, b) => b[1] - a[1]);
        for (const [ext, count] of sortedTypes) {
            console.log(`  ${ext.padEnd(10)} ${chalk.green(count)} files`);
        }
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    mainSpinner.fail(chalk.red(`Indexing failed: ${error.message}`));
    if (!process.env.GEMINI_API_KEY) {
      console.error(chalk.yellow('Please make sure the GEMINI_API_KEY environment variable is set in your .env file.'));
    }
  }
}