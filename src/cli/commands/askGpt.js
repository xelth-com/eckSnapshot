import { ask } from '../../services/gptService.js';

/**
 * CLI entry point for ask-gpt command.
 * @param {string} payload - JSON payload string.
 * @param {{ verbose?: boolean, model?: string, reasoning?: string }} options - CLI options.
 */
export async function askGpt(payload, options = {}) {
  const verbose = Boolean(options.verbose);
  const model = options.model || 'gpt-5-codex';
  const reasoning = options.reasoning || 'high';

  if (!payload) {
    console.error('ask-gpt requires a JSON payload argument.');
    process.exitCode = 1;
    return;
  }

  try {
    const result = await ask(payload, { verbose, model, reasoning });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    if (verbose && error?.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}
