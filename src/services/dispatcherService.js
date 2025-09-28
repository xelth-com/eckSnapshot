import { ask as askGpt } from './gptService.js';
import { executePrompt as askClaude } from './claudeCliService.js';

/**
 * Dispatches an analytical task to the most efficient AI model with a fallback.
 * Priority 1: Codex (GPT) with low reasoning for speed and cost.
 * Priority 2: Claude as a reliable fallback.
 * @param {string} prompt The JSON payload or prompt string for the task.
 * @returns {Promise<object>} The result from the successful AI agent.
 */
export async function dispatchAnalysisTask(prompt) {
  try {
    console.log('🧠 Dispatcher: Attempting analysis with Codex (low reasoning)...');
    const gptOptions = {
      model: 'gpt-5-codex',
      reasoning: 'low'
    };
    // The 'ask' function expects payload as first arg, and options as second.
    // Since prompt is a string here, we wrap it in an object for consistency if needed,
    // but for simple prompts it can often be passed directly.
    const payload = (typeof prompt === 'string' && prompt.startsWith('{')) ? prompt : JSON.stringify({ objective: prompt });
    return await askGpt(payload, { verbose: false, ...gptOptions });
  } catch (gptError) {
    console.warn(`⚠️ Codex (low reasoning) failed: ${gptError.message}`);
    console.log('🔄 Failing over to Claude for analysis...');
    try {
      return await askClaude(prompt);
    } catch (claudeError) {
      console.error(`❌ Critical Failure: Both Codex and Claude failed for analysis task.`);
      throw new Error(`Primary (Codex) Error: ${gptError.message}\nFallback (Claude) Error: ${claudeError.message}`);
    }
  }
}