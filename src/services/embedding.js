import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import pLimit from 'p-limit';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "embedding-001" });

async function generateEmbedding(text, taskType = 'RETRIEVAL_DOCUMENT') {
  try {
    const result = await model.embedContent({ 
      content: { parts: [{ text }] },
      taskType
    });
    return result.embedding.values;
  } catch (error) {
    console.error('❌ Gemini Embedding Error:', error.message);
    throw error;
  }
}

async function generateBatchEmbeddings(segments, taskType = 'RETRIEVAL_DOCUMENT') {
    if (segments.length === 0) return [];

    const BATCH_COUNT_LIMIT = 100;
    const BATCH_SIZE_LIMIT = 3000000; // 3MB for safety
    const allBatches = [];
    let currentBatch = [];
    let currentBatchSize = 0;

    for (const segment of segments) {
        const segmentSize = Buffer.byteLength(segment.content, 'utf8');
        if (segmentSize > BATCH_SIZE_LIMIT) { // Handle single oversized segments
            console.log(chalk.yellow(`  -> Warning: Segment '${segment.name}' in '${segment.filePath}' is oversized and will be truncated.`));
            segment.content = segment.content.substring(0, 20000) + '... [truncated]'; // Truncate oversized segment
        }
        if (currentBatch.length > 0 && (currentBatch.length >= BATCH_COUNT_LIMIT || currentBatchSize + Buffer.byteLength(segment.content, 'utf8') > BATCH_SIZE_LIMIT)) {
            allBatches.push(currentBatch);
            currentBatch = [];
            currentBatchSize = 0;
        }
        currentBatch.push(segment);
        currentBatchSize += Buffer.byteLength(segment.content, 'utf8');
    }
    if (currentBatch.length > 0) {
        allBatches.push(currentBatch);
    }

    console.log(chalk.cyan(`⏳ Generating embeddings for ${segments.length} segments, divided into ${allBatches.length} safe chunks...`));

    const limit = pLimit(5); // Set concurrency to 5 parallel requests
    let processedCount = 0;

    const promises = allBatches.map((batch, i) => {
        return limit(async () => {
            const batchSizeKB = (Buffer.byteLength(batch.map(s => s.content).join(''), 'utf8') / 1024).toFixed(2);
            console.log(chalk.blue(`  -> Sending chunk ${i + 1}/${allBatches.length} (${batch.length} segments, ${batchSizeKB} KB)...`));
            try {
                const contents = batch.map(s => ({ parts: [{ text: s.content }] }));
                const result = await model.batchEmbedContents({ 
                    requests: contents.map(content => ({ content, taskType }))
                });
                processedCount++;
                console.log(chalk.green(`  <- Chunk ${i + 1}/${allBatches.length} processed successfully.`));
                return result.embeddings.map(e => e.values);
            } catch (error) {
                console.error(chalk.red(`❌ Gemini Batch Embedding Error (Chunk ${i + 1}/${allBatches.length}):`), error.message);
                throw error;
            }
        });
    });

    const chunkResults = await Promise.all(promises);
    const allEmbeddings = chunkResults.flat();

    console.log(chalk.green.bold('✅ Batch embeddings generated successfully.'));
    return allEmbeddings;
}

export const embeddingService = {
  generateEmbedding,
  generateBatchEmbeddings
};