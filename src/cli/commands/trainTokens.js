import chalk from 'chalk';
import ora from 'ora';
import { addTrainingPoint, showEstimationStats, syncTokenWeights } from '../../utils/tokenEstimator.js';

export async function runTokenTools(payload) {
  const toolName = payload.name;
  const args = payload.arguments || {};

  if (toolName === 'eck_train_tokens') {
    await handleTrainTokens(args);
  } else if (toolName === 'eck_token_stats') {
    await handleTokenStats();
  }
}

async function handleTrainTokens(args) {
  const { projectType, fileSizeBytes, estimatedTokens, actualTokens } = args;

  if (!projectType || fileSizeBytes === undefined || estimatedTokens === undefined || actualTokens === undefined) {
    console.log(chalk.red('❌ Error: Missing required arguments for eck_train_tokens.'));
    console.log(chalk.yellow('Expected: { projectType, fileSizeBytes, estimatedTokens, actualTokens }'));
    return;
  }

  const spinner = ora('Calibrating token estimation polynomial...').start();
  try {
    await addTrainingPoint(
      projectType,
      Number(fileSizeBytes),
      Number(estimatedTokens),
      Number(actualTokens)
    );
    spinner.succeed('Token estimation calibrated successfully.');
  } catch (error) {
    spinner.fail(`Calibration failed: ${error.message}`);
  }
}

async function handleTokenStats() {
  const spinner = ora('Fetching latest token statistics and weights...').start();
  try {
    await syncTokenWeights(true);
    spinner.stop();
    await showEstimationStats();
  } catch (error) {
    spinner.fail(`Failed to fetch statistics: ${error.message}`);
  }
}
