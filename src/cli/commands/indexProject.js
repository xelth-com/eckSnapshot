import path from 'path';
import { execa } from 'execa';
import ora from 'ora';
import micromatch from 'micromatch';
import { segmentFile } from '../../core/segmenter.js';
import { getKnex, initDb, destroyDb } from '../../database/postgresConnector.js';
import { generateBatchEmbeddings, releaseModel as releaseEmbeddingModel } from '../../services/embeddingService.js';
import { getCodeSummary } from '../../services/analysisService.js';
import { releaseModel as releaseAnalysisModel } from '../../services/analysisService.js';
import { getProfile } from '../../config.js';
import { applyProfileFilter } from '../../utils/fileUtils.js';
import { initializeEckManifest } from '../../utils/fileUtils.js';

async function getProjectFiles(projectPath) {
  const { stdout } = await execa('git', ['ls-files'], { cwd: projectPath });
  return stdout.split('\n').filter(Boolean);
}

export async function indexProject(projectPath, options) {
  const mainSpinner = ora('Запуск конвейера индексации...').start();
  try {
    // Initialize .eck manifest directory if it doesn't exist
    await initializeEckManifest(projectPath);
    
    await initDb();
    const knex = getKnex();
    let files = await getProjectFiles(projectPath);
    
    // --- Apply Advanced Profile Filtering ---
    const defaultProfile = await getProfile('default', projectPath);
    if (options.profile) {
        mainSpinner.text = `Applying profile filter: '${options.profile}'...`;
        files = await applyProfileFilter(files, options.profile, projectPath);
        mainSpinner.info(`Filtered down to ${files.length} files using profile: '${options.profile}'.`);
    } else if (defaultProfile) {
        mainSpinner.text = "Applying detected 'default' profile...";
        files = micromatch(files, defaultProfile.include, { ignore: defaultProfile.exclude });
        mainSpinner.info(`Filtered down to ${files.length} files using detected 'default' profile.`);
    }
    if (files.length === 0) {
        throw new Error(`Profile filter resulted in 0 files. Aborting.`);
    }
    // --- End Profile Filtering ---

    const profileName = options.profile || 'default';
    mainSpinner.text = 'Получение кэша из базы данных...';
    const existingRows = await knex('code_chunks').where({ profile: profileName }).select('content_hash', 'summary', 'embedding');
    const cache = new Map(existingRows.map(r => [r.content_hash, { summary: r.summary, embedding: r.embedding }]));
    mainSpinner.succeed(`Найдено ${cache.size} кэшированных записей.`);

    const allProjectChunks = [];
    const allProjectRelations = [];
    for (const filePath of files) {
        const { chunks, relations } = await segmentFile(path.join(projectPath, filePath));
        allProjectChunks.push(...chunks);
        allProjectRelations.push(...relations);
    }

    const chunksToProcessAI = allProjectChunks.filter(c => !cache.has(c.contentHash));
    mainSpinner.info(`Всего чанков: ${allProjectChunks.length}. Новых/измененных для ИИ-обработки: ${chunksToProcessAI.length}.`);

    if (chunksToProcessAI.length > 0) {
        mainSpinner.text = `[1/2] Анализ кода (${chunksToProcessAI.length} чанков)...`;
        const summaries = await Promise.all(chunksToProcessAI.map(c => getCodeSummary(c.code)));
        for (let i = 0; i < chunksToProcessAI.length; i++) { chunksToProcessAI[i].summary = summaries[i]; }
        await releaseAnalysisModel();

        mainSpinner.text = `[2/2] Создание эмбеддингов...`;
        const embeddings = await generateBatchEmbeddings(chunksToProcessAI.map(c => c.code));
        for (let i = 0; i < chunksToProcessAI.length; i++) { chunksToProcessAI[i].embedding = embeddings[i]; }
        await releaseEmbeddingModel();
    }

    mainSpinner.text = 'Сохранение данных в БД...';
    const allChunksData = allProjectChunks.map(c => {
        const cached = cache.get(c.contentHash);
        const finalEmbedding = c.embedding || (cached?.embedding ? JSON.parse(cached.embedding) : null);
        return {
            file_path: c.filePath,
            chunk_type: c.chunk_type,
            chunk_name: c.chunk_name,
            code: c.code,
            summary: c.summary || cached?.summary,
            tokens: Math.round(c.code.length / 4),
            embedding: finalEmbedding ? JSON.stringify(finalEmbedding) : null,
            content_hash: c.contentHash,
            profile: profileName,
        };
    });

    if (allChunksData.length > 0) {
      await knex('code_chunks')
          .insert(allChunksData)
          .onConflict('content_hash')
          .merge();
    }

    mainSpinner.text = 'Построение графа связей...';
    const allDbChunks = await knex('code_chunks').where({ profile: profileName }).select('id', 'chunk_name', 'file_path');
    const nameToDbId = new Map(allDbChunks.map(c => [c.chunk_name, c.id]));
    const pathToDbId = new Map(allDbChunks.filter(c => c.chunk_type === 'file').map(c => [c.file_path, c.id]));

    const relationsToInsert = allProjectRelations
        .map(rel => {
            const fromId = nameToDbId.get(rel.from) || pathToDbId.get(rel.from);
            const toId = nameToDbId.get(rel.to);
            if (fromId && toId) {
                return { from_id: fromId, to_id: toId, relation_type: rel.type };
            }
            return null;
        })
        .filter(Boolean);
    
    if (relationsToInsert.length > 0) {
        await knex('relations').del(); // Clear old relations for simplicity
        await knex('relations').insert(relationsToInsert);
        mainSpinner.info(`Сохранено ${relationsToInsert.length} связей в графе.`);
    }

    const currentHashes = new Set(allProjectChunks.map(c => c.contentHash));
    const hashesToDelete = existingRows.filter(r => !currentHashes.has(r.content_hash)).map(r => r.content_hash);
    if (hashesToDelete.length > 0) {
        await knex('code_chunks').whereIn('content_hash', hashesToDelete).del();
        mainSpinner.info(`Удалено ${hashesToDelete.length} устаревших чанков.`);
    }

  } catch (error) {
    mainSpinner.fail(`Ошибка в процессе индексации: ${error.message}`);
  } finally {
    await destroyDb();
    mainSpinner.succeed('Индексация завершена.');
  }
}