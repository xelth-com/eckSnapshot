import path from 'path';
import { execa } from 'execa';
import ora from 'ora';
import micromatch from 'micromatch';
import pLimit from 'p-limit';
import { segmentFile } from '../../core/segmenter.js';
import { getKnex, initDb, destroyDb } from '../../database/postgresConnector.js';
import { getCodeSummary, releaseModel as releaseAnalysisModel } from '../../services/analysisService.js';
import { getProfile } from '../../config.js';
import { applyProfileFilter, initializeEckManifest } from '../../utils/fileUtils.js';

async function getProjectFiles(projectPath) {
  const { stdout } = await execa('git', ['ls-files'], { cwd: projectPath });
  return stdout.split('\n').filter(Boolean);
}

function extractOptions(options) {
  if (!options) return {};
  if (typeof options.opts === 'function') {
    return options.opts();
  }
  return options;
}

export async function indexAnalyze(projectPath = process.cwd(), options) {
  const commandOptions = extractOptions(options);
  const targetPath = projectPath || process.cwd();
  const profileName = commandOptions.profile || 'default';
  const mainSpinner = ora('Запуск [1/2]: Анализ кода...').start();
  let hadError = false;

  try {
    await initializeEckManifest(targetPath);
    await initDb();
    const knex = getKnex();

    mainSpinner.text = 'Очистка старых данных...';
    await knex('relations').del();
    await knex('code_chunks').del();
    mainSpinner.succeed('Старый индекс очищен.');

    let files = await getProjectFiles(targetPath);

    const defaultProfile = await getProfile('default', targetPath);
    if (commandOptions.profile) {
      mainSpinner.text = `Применение профиля: '${commandOptions.profile}'...`;
      files = await applyProfileFilter(files, commandOptions.profile, targetPath);
      mainSpinner.info(`Отфильтровано до ${files.length} файлов по профилю: '${commandOptions.profile}'.`);
    } else if (defaultProfile) {
      mainSpinner.text = "Применение профиля: 'default'...";
      files = micromatch(files, defaultProfile.include, { ignore: defaultProfile.exclude });
      mainSpinner.info(`Отфильтровано до ${files.length} файлов профилем 'default'.`);
    }

    if (files.length === 0) {
      throw new Error('Профиль отфильтровал все файлы. Индексация прервана.');
    }

    mainSpinner.text = 'Сегментация файлов...';
    const allProjectChunks = [];
    const allProjectRelations = [];
    for (const relativePath of files) {
      const { chunks, relations } = await segmentFile(path.join(targetPath, relativePath));
      allProjectChunks.push(...chunks);
      allProjectRelations.push(...relations);
    }
    mainSpinner.succeed(`Проект разделен на ${allProjectChunks.length} чанков.`);

    if (allProjectChunks.length === 0) {
      mainSpinner.warn('Нет чанков для анализа.');
    } else {
      mainSpinner.start(`Анализ кода (0/${allProjectChunks.length} чанков)...`);
      const limit = pLimit(2);
      let processed = 0;
      const summaryPromises = allProjectChunks.map((chunk) =>
        limit(async () => {
          chunk.summary = await getCodeSummary(chunk.code);
          processed += 1;
          mainSpinner.text = `Анализ кода (${processed}/${allProjectChunks.length} чанков)...`;
        })
      );
      await Promise.all(summaryPromises);
      mainSpinner.succeed('Анализ кода завершен.');
    }

    if (allProjectChunks.length > 0) {
      mainSpinner.text = 'Сохранение результатов анализа в БД...';
      const chunksToInsert = allProjectChunks.map((chunk) => ({
        file_path: chunk.filePath,
        chunk_type: chunk.chunk_type,
        chunk_name: chunk.chunk_name,
        code: chunk.code,
        summary: chunk.summary,
        tokens: Math.round(chunk.code.length / 4),
        embedding: null,
        content_hash: chunk.contentHash,
        profile: profileName,
      }));

      await knex.batchInsert('code_chunks', chunksToInsert, 30);

      const allDbChunks = await knex('code_chunks')
        .where({ profile: profileName })
        .select('id', 'chunk_name', 'file_path', 'chunk_type');
      const nameToDbId = new Map(allDbChunks.map((chunk) => [chunk.chunk_name, chunk.id]));
      const pathToDbId = new Map(
        allDbChunks
          .filter((chunk) => chunk.chunk_type === 'file')
          .map((chunk) => [chunk.file_path, chunk.id])
      );

      const relationsToInsert = allProjectRelations
        .map((relation) => {
          const fromId = nameToDbId.get(relation.from) || pathToDbId.get(relation.from);
          const toId = nameToDbId.get(relation.to);
          if (fromId && toId) {
            return { from_id: fromId, to_id: toId, relation_type: relation.type };
          }
          return null;
        })
        .filter(Boolean);

      if (relationsToInsert.length > 0) {
        await knex('relations').insert(relationsToInsert);
      }
    }
  } catch (error) {
    hadError = true;
    mainSpinner.fail(`Ошибка на этапе анализа: ${error.message}`);
  } finally {
    await releaseAnalysisModel();
    await destroyDb();
    if (!hadError) {
      mainSpinner.succeed('Этап [1/2] (Анализ) завершен. Запустите eck-snapshot index-embed для завершения.');
    }
  }
}
