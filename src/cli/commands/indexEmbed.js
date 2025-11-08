import ora from 'ora';
import { getKnex, initDb, destroyDb } from '../../database/postgresConnector.js';
import { generateBatchEmbeddings, releaseModel as releaseEmbeddingModel } from '../../services/embeddingService.js';

function extractOptions(options) {
  if (!options) return {};
  if (typeof options.opts === 'function') {
    return options.opts();
  }
  return options;
}

export async function indexEmbed(options) {
  const commandOptions = extractOptions(options);
  const profileName = commandOptions.profile;
  const mainSpinner = ora('Запуск [2/2]: Создание эмбеддингов...').start();
  let hadError = false;

  try {
    await initDb();
    const knex = getKnex();

    mainSpinner.text = 'Поиск чанков без эмбеддингов...';
    let query = knex('code_chunks').whereNull('embedding');
    if (profileName) {
      query = query.andWhere({ profile: profileName });
    }

    const chunksToProcess = await query;

    if (chunksToProcess.length === 0) {
      const message = profileName
        ? `Все чанки профиля '${profileName}' уже имеют эмбеддинги. Работа завершена.`
        : 'Все чанки уже имеют эмбеддинги. Работа завершена.';
      mainSpinner.info(message);
      return;
    }

    mainSpinner.info(`Найдено ${chunksToProcess.length} чанков для создания эмбеддингов.`);

    mainSpinner.start('Создание эмбеддингов...');
    const embeddings = await generateBatchEmbeddings(chunksToProcess.map((chunk) => chunk.code));

    mainSpinner.text = 'Сохранение эмбеддингов в БД...';
    for (let index = 0; index < chunksToProcess.length; index += 1) {
      await knex('code_chunks')
        .where({ id: chunksToProcess[index].id })
        .update({ embedding: JSON.stringify(embeddings[index]) });
      mainSpinner.text = `Сохранение эмбеддингов (${index + 1}/${chunksToProcess.length})...`;
    }
    mainSpinner.succeed('Сохранение эмбеддингов завершено.');
  } catch (error) {
    hadError = true;
    mainSpinner.fail(`Ошибка на этапе создания эмбеддингов: ${error.message}`);
  } finally {
    await releaseEmbeddingModel();
    await destroyDb();
    if (!hadError) {
      mainSpinner.succeed('Этап [2/2] (Эмбеддинги) завершен.');
    }
  }
}
