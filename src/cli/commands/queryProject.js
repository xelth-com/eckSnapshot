import ora from 'ora';
import path from 'path';
import fs from 'fs/promises';
import { getKnex, initDb, destroyDb } from '../../database/postgresConnector.js';
import { generateEmbedding } from '../../services/embeddingService.js';
import { generateEnhancedAIHeader } from '../../utils/aiHeader.js';
import { sanitizeForFilename } from '../../utils/fileUtils.js';

// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export async function queryProject(query, options) {
  const mainSpinner = ora('Запуск гибридного RAG-поиска...').start();
  const knex = getKnex();

  try {
    // Step 1: Get Query Vector
    mainSpinner.text = 'Создание вектора для запроса...';
    const queryVector = await generateEmbedding(query);
    const queryVectorString = JSON.stringify(queryVector);

    // Step 2: Vector Search (using cosine similarity with JSON embeddings)
    mainSpinner.text = 'Векторный поиск релевантных фрагментов...';
    let chunksQuery = knex('code_chunks').select('id', 'embedding', 'file_path', 'code');
    
    // Filter by profile if specified
    if (options.profile) {
        chunksQuery = chunksQuery.where('profile', options.profile);
        mainSpinner.info(`Поиск в профиле: '${options.profile}'`);
    }
    
    const allChunks = await chunksQuery;
    
    // Calculate cosine similarity in JavaScript since we don't have pgvector
    const similarities = allChunks.map(chunk => {
        const chunkEmbedding = JSON.parse(chunk.embedding);
        const similarity = cosineSimilarity(queryVector, chunkEmbedding);
        return { ...chunk, similarity };
    });
    
    // Sort by similarity (highest first) and take top k
    const topResults = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, options.k || 10);
    
    const initialIds = topResults.map(row => row.id);
    if (initialIds.length === 0) {
        mainSpinner.warn('Не найдено релевантных фрагментов кода.');
        return;
    }

    // Step 3: Graph Expansion
    mainSpinner.text = `Расширение контекста через граф (найдено ${initialIds.length} стартовых узлов)...`;
    const graphExpansionResults = await knex.raw(`
        WITH RECURSIVE graph_traversal AS (
            SELECT from_id, to_id FROM relations WHERE from_id = ANY(?)
            UNION
            SELECT r.from_id, r.to_id
            FROM relations r
            INNER JOIN graph_traversal gt ON gt.to_id = r.from_id
        )
        SELECT from_id as id FROM graph_traversal
        UNION
        SELECT to_id as id FROM graph_traversal;
    `, [initialIds]);

    const relatedIds = graphExpansionResults.rows.map(row => row.id);
    const allIds = [...new Set([...initialIds, ...relatedIds])];

    // Step 4: Fetch Code Chunks
    mainSpinner.text = `Извлечение кода для ${allIds.length} связанных фрагментов...`;
    const finalChunks = await knex('code_chunks')
        .whereIn('id', allIds)
        .select('file_path', 'code');

    // Step 5: Assemble Snapshot
    mainSpinner.text = 'Сборка RAG-снапшота...';
    const header = await generateEnhancedAIHeader({
        repoName: path.basename(process.cwd()),
        userQuery: query,
        mode: 'vector'
    });

    // Group code by file path to maintain file structure in the output
    const filesContentMap = new Map();
    for (const chunk of finalChunks) {
        if (!filesContentMap.has(chunk.file_path)) {
            filesContentMap.set(chunk.file_path, []);
        }
        filesContentMap.get(chunk.file_path).push(chunk.code);
    }

    let snapshotContent = header;
    for (const [filePath, codeSnippets] of filesContentMap.entries()) {
        const relativePath = path.relative(process.cwd(), filePath);
        snapshotContent += `--- File: /${relativePath} ---\n\n`;
        snapshotContent += codeSnippets.join('\n\n---\n\n');
        snapshotContent += '\n\n';
    }

    const sanitizedQuery = sanitizeForFilename(query);
    const outputFilename = options.output || `rag_snapshot_${sanitizedQuery}.md`;
    await fs.writeFile(outputFilename, snapshotContent);

    mainSpinner.succeed(`RAG-снапшот успешно создан: ${outputFilename}`);

  } catch (error) {
    mainSpinner.fail(`Ошибка при выполнении запроса: ${error.message}`);
  } finally {
    await destroyDb();
  }
}