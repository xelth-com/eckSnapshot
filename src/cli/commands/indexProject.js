import path from 'path';
import { execa } from 'execa';
import ora from 'ora';
import { segmentFile } from '../../core/segmenter.js';
import { getKnex, initDb, destroyDb } from '../../database/postgresConnector.js';
import { generateBatchEmbeddings, releaseModel as releaseEmbeddingModel } from '../../services/embeddingService.js';
import { getCodeSummary } from '../../services/analysisService.js';
import { releaseModel as releaseAnalysisModel } from '../../services/analysisService.js';

async function getProjectFiles(projectPath) {
  const { stdout } = await execa('git', ['ls-files'], { cwd: projectPath });
  return stdout.split('\n').filter(Boolean);
}

export async function indexProject(projectPath, options) {
  const mainSpinner = ora('Запуск конвейера индексации...').start();

  try {
    await initDb();
    const knex = getKnex();
    mainSpinner.text = 'Сканирование файлов проекта...';
    const files = await getProjectFiles(projectPath);
    mainSpinner.succeed(`Найдено ${files.length} файлов для обработки.`);

    const chunkIdToDbId = new Map();

    for (const filePath of files) {
        const fileSpinner = ora(`Обработка файла: ${filePath}`).start();
        try {
            const { chunks, relations } = await segmentFile(path.join(projectPath, filePath));
            if (chunks.length === 0) {
                fileSpinner.succeed('Пропущено (нет чанков).');
                continue;
            }

            fileSpinner.text = `[1/3] Анализ кода (${chunks.length} чанков)...`;
            const summaries = await Promise.all(chunks.map(c => getCodeSummary(c.code)));
            for (let i = 0; i < chunks.length; i++) { chunks[i].summary = summaries[i]; }
            await releaseAnalysisModel();

            fileSpinner.text = `[2/3] Создание эмбеддингов...`;
            const embeddings = await generateBatchEmbeddings(chunks.map(c => c.code));
            for (let i = 0; i < chunks.length; i++) { chunks[i].embedding = embeddings[i]; }
            await releaseEmbeddingModel();
            
            fileSpinner.text = `[3/3] Сохранение узлов в БД...`;
            const insertedRows = await knex('code_chunks').insert(chunks.map(c => ({
                file_path: c.filePath,
                chunk_type: c.chunk_type,
                chunk_name: c.chunk_name,
                code: c.code,
                summary: c.summary,
                tokens: Math.round(c.code.length / 4),
                embedding: JSON.stringify(c.embedding)
            }))).returning(['id', 'chunk_name']);
            
            insertedRows.forEach((row, i) => {
              chunkIdToDbId.set(chunks[i].id, row.id);
              chunkIdToDbId.set(chunks[i].chunk_name, row.id);
              chunkIdToDbId.set(row.chunk_name, row.id);
            });
            
            // Map relations to database IDs
            const relationsToInsert = relations
                .map(rel => {
                    let fromId, toId;
                    if (rel.type === 'IMPORTS') {
                        // For imports, from is file path, to is imported module
                        fromId = chunkIdToDbId.get(path.basename(rel.from, path.extname(rel.from)));
                        // For now, skip imports as they need more complex handling
                        return null;
                    } else if (rel.type === 'CALLS') {
                        // For calls, both are function/chunk names
                        fromId = chunkIdToDbId.get(rel.from);
                        toId = chunkIdToDbId.get(rel.to);
                    }
                    return fromId && toId ? { from_id: fromId, to_id: toId, relation_type: rel.type } : null;
                })
                .filter(r => r !== null);

            if (relationsToInsert.length > 0) {
                await knex('relations').insert(relationsToInsert);
            }
            fileSpinner.succeed(`Сохранено ${chunks.length} чанков и ${relationsToInsert.length} связей.`);
        } catch (error) {
            fileSpinner.fail(`Ошибка при обработке ${filePath}: ${error.message}`);
            // Ensure models are released even on error
            await releaseAnalysisModel();
            await releaseEmbeddingModel();
        }
    }

  } catch (error) {
    mainSpinner.fail(`Ошибка в процессе индексации: ${error.message}`);
  } finally {
    await destroyDb();
    mainSpinner.succeed('Индексация завершена. Соединение с БД закрыто.');
  }
}