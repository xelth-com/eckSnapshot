import ora from 'ora';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { embeddingService } from '../../services/embedding.js';
import { LocalIndex } from 'vectra';
import { generateEnhancedAIHeader } from '../../utils/aiHeader.js';
import { sanitizeForFilename } from '../../utils/fileUtils.js';
import { loadSetupConfig } from '../../config.js';

async function queryWithImport(query, options) {
    const importSpinner = ora(`Loading portable index from ${path.basename(options.import)}...`).start();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ecksnapshot-'));
    const index = new LocalIndex(tempDir);

    try {
        await index.createIndex();
        const fileContent = await fs.readFile(options.import, 'utf-8');
        const items = JSON.parse(fileContent);
        for (const item of items) {
            await index.upsertItem(item);
        }
        importSpinner.succeed(`Loaded ${items.length} items into a temporary in-memory index.`);
        
        // The rest of the query logic is the same as the original function
        return await performQuery(query, options, index);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

async function performQuery(query, options, index) {
    const querySpinner = ora('Generating embedding for your query...').start();
    
    try {
        const queryVector = await embeddingService.generateEmbedding(query, 'RETRIEVAL_QUERY');
        
        querySpinner.text = 'Searching for relevant code segments...';
        const results = await index.queryItems(queryVector, options.k || 10);

        if (results.length === 0) {
            querySpinner.warn('No relevant code segments found for your query.');
            return 'No results found.';
        }

        querySpinner.text = 'Assembling context-aware snapshot...';
        const header = await generateEnhancedAIHeader({
            repoName: options.import ? path.basename(options.import, '.json').split('_')[0] : path.basename(process.cwd()),
            userQuery: query,
            mode: 'vector'
        });
        
        let snapshotContent = header;
        const includedFiles = new Set();
        for (const result of results) {
            includedFiles.add(result.item.metadata.filePath);
        }

        for (const file of includedFiles) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                const relativePath = options.import ? file : path.relative(process.cwd(), file);
                snapshotContent += `--- File: /${relativePath} ---\n\n${content}\n\n`;
            } catch (error) {
                // File might not exist anymore, skip it
                console.warn(`Warning: Could not read file ${file}`);
            }
        }

        const config = await loadSetupConfig();
        const sanitizedQuery = sanitizeForFilename(query);
        const importBaseName = options.import ? path.basename(options.import, '.json') : 'query_result';
        const defaultRagFilename = `${importBaseName}_rag_${sanitizedQuery}.md`;

        const outputPath = config.output?.defaultPath || './snapshots';
        await fs.mkdir(outputPath, { recursive: true });
        const finalDefaultPath = path.join(outputPath, defaultRagFilename);

        const outputFile = options.output || finalDefaultPath;

        await fs.writeFile(outputFile, snapshotContent);
        querySpinner.succeed(`Snapshot generated at: ${outputFile}`);
        return `Snapshot generated at: ${outputFile}`;
    } catch (error) {
        querySpinner.fail(`Query processing failed: ${error.message}`);
        throw error;
    }
}

export async function queryProject(query, options) {
  if (options.import) {
    const spinner = ora('Initializing context-aware query from portable index...').start();
    try {
        const resultMessage = await queryWithImport(query, options);
        spinner.succeed('Query from portable index completed successfully.');
    } catch(error) {
        spinner.fail(`Query from import failed: ${error.message}`);
        if (!process.env.GEMINI_API_KEY) {
            console.error('Please make sure the GEMINI_API_KEY environment variable is set.');
        }
    }
    return;
  }

  // Original logic for querying the local .ecksnapshot_index directory
  const spinner = ora('Initializing context-aware query...').start();
  const indexPath = path.resolve(process.cwd(), './.ecksnapshot_index');
  const index = new LocalIndex(indexPath);

  try {
    if (!await index.isIndexCreated()) {
      throw new Error('Project index not found. Please run `eck-snapshot index` first.');
    }

    await performQuery(query, options, index);
  } catch (error) {
      spinner.fail(`Query failed: ${error.message}`);
      if (!process.env.GEMINI_API_KEY) {
        console.error('Please make sure the GEMINI_API_KEY environment variable is set.');
      }
  }
}