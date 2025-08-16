import { execa } from 'execa';
import path from 'path';
import ora from 'ora';
import { segmentFile } from '../../core/segmenter.js';
import { embeddingService } from '../../services/embedding.js';
import { LocalIndex } from 'vectra';

async function getProjectFiles(projectPath) {
  const { stdout } = await execa('git', ['ls-files'], { cwd: projectPath });
  return stdout.split('\n').filter(Boolean);
}

export async function indexProject(projectPath, options) {
  const spinner = ora('Initializing project indexing...').start();
  const indexPath = path.resolve(projectPath, './.ecksnapshot_index');
  const index = new LocalIndex(indexPath);

  try {
    if (!await index.isIndexCreated()) {
      await index.createIndex();
    }

    spinner.text = 'Finding project files...';
    const files = await getProjectFiles(projectPath);
    
    for (const file of files) {
      const fullPath = path.join(projectPath, file);
      spinner.text = `Segmenting: ${file}`;
      const segments = await segmentFile(fullPath);
      
      spinner.text = `Generating embeddings for ${segments.length} segments in ${file}`;
      for (const segment of segments) {
        const vector = await embeddingService.generateEmbedding(segment.content);
        await index.insertItem({ vector, metadata: { ...segment } });
      }
    }

    spinner.succeed(`Project indexed successfully! Index created at: ${indexPath}`);
  } catch (error) {
    spinner.fail(`Indexing failed: ${error.message}`);
    if (!process.env.GEMINI_API_KEY) {
      console.error('Please make sure the GEMINI_API_KEY environment variable is set.');
    }
  }
}