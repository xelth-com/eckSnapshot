import { executePrompt as askClaude } from './claudeCliService.js';

/**
 * Dispatches an analytical task to Claude CLI.
 * @param {string} prompt The JSON payload or prompt string for the task.
 * @returns {Promise<object>} The result from Claude.
 */
export async function dispatchAnalysisTask(prompt) {
  return await askClaude(prompt);
}
