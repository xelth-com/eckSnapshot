import ora from 'ora';
import path from 'path';
import fs from 'fs/promises';
import { embeddingService } from '../../services/embedding.js';
import { LocalIndex } from 'vectra';

export async function queryProject(query, options) {
  const spinner = ora('Initializing context-aware query...').start();
  const indexPath = path.resolve(process.cwd(), './.ecksnapshot_index');
  const index = new LocalIndex(indexPath);

  try {
    if (!await index.isIndexCreated()) {
      throw new Error('Project index not found. Please run `eck-snapshot index` first.');
    }

    spinner.text = 'Generating embedding for your query...';
    const queryVector = await embeddingService.generateEmbedding(query, 'RETRIEVAL_QUERY');

    spinner.text = 'Searching for relevant code segments...';
    const results = await index.queryItems(queryVector, options.k || 10);

    if (results.length === 0) {
      spinner.warn('No relevant code segments found for your query.');
      return;
    }

    spinner.text = 'Assembling context-aware snapshot...';
    let snapshotContent = `# Context-Aware Snapshot for Query: "${query}"\n\n---\n\n`;
    const includedFiles = new Set();
    for (const result of results) {
      includedFiles.add(result.item.metadata.filePath);
    }

    for (const file of includedFiles) {
        const content = await fs.readFile(file, 'utf-8');
        snapshotContent += `--- File: /${path.relative(process.cwd(), file)} ---\n\n${content}\n\n`;
    }

    const outputFile = options.output || `snapshot_${Date.now()}.md`;
    await fs.writeFile(outputFile, snapshotContent);
    spinner.succeed(`Snapshot generated at: ${outputFile}`);

  } catch (error) {
    spinner.fail(`Query failed: ${error.message}`);
    if (!process.env.GEMINI_API_KEY) {
      console.error('Please make sure the GEMINI_API_KEY environment variable is set.');
    }
  }
}