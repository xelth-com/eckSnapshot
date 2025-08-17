import { execa } from 'execa';
import path from 'path';
import fs from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';
import { segmentFile } from '../../core/segmenter.js';
import { embeddingService } from '../../services/embedding.js';
import { LocalIndex } from 'vectra';
import { generateTimestamp } from '../../utils/fileUtils.js';
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
    await fs.mkdir(indexPath, { recursive: true });
    const index = new LocalIndex(indexPath);
    if (!await index.isIndexCreated()) {
      await index.createIndex();
    }

    mainSpinner.text = 'Reading index manifest...';
    const manifest = await readManifest(manifestPath);

    mainSpinner.text = 'Scanning project files and calculating hashes...';
    const files = await getProjectFiles(projectPath);
    const currentState = new Map();
    
    for (const file of files) {
      const fullPath = path.join(projectPath, file);
      const segments = await segmentFile(fullPath);
      for (const segment of segments) {
        currentState.set(segment.id, segment);
      }
    }

    mainSpinner.text = 'Comparing current state with manifest...';
    const toAdd = [];
    const toUpdate = [];
    const toDelete = new Set(Object.keys(manifest));

    for (const [id, segment] of currentState.entries()) {
      toDelete.delete(id); // This segment exists, so don't delete it
      if (!manifest[id]) {
        toAdd.push(segment);
      } else if (manifest[id] !== segment.contentHash) {
        toUpdate.push(segment);
      }
    }

    if (toAdd.length === 0 && toUpdate.length === 0 && toDelete.size === 0) {
      mainSpinner.succeed(chalk.green('Index is already up to date.'));
      return;
    }

    mainSpinner.succeed('Comparison complete. Starting index update.');

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
    console.log(chalk.green.bold('\n✅ Index synchronization complete!'));

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

  } catch (error) {
    mainSpinner.fail(chalk.red(`Indexing failed: ${error.message}`));
    if (!process.env.GEMINI_API_KEY) {
      console.error(chalk.yellow('Please make sure the GEMINI_API_KEY environment variable is set in your .env file.'));
    }
  }
}