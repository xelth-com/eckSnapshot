import { execa } from 'execa';
import fs from 'fs/promises';

/**
 * Executes a prompt using the gemini-cli with API key authentication.
 * @param {string} prompt The prompt to send to Gemini.
 * @returns {Promise<object>} A promise that resolves with the final output object from Gemini.
 */
export async function executePrompt(prompt) {
  // Check if API key is available
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY environment variable is required.\n' +
      'Please:\n' +
      '1. Get an API key from: https://aistudio.google.com/apikey\n' +
      '2. Export it: export GEMINI_API_KEY="your_api_key_here"\n' +
      '3. Try the command again'
    );
  }

  const logDir = './.eck/logs';
  await fs.mkdir(logDir, { recursive: true });
  const logFile = `${logDir}/gemini-execution-${Date.now()}.log`;
  const timestamp = new Date().toISOString();

  try {
    const command = 'gemini';
    const args = ['-p', prompt];

    const { stdout, stderr, exitCode } = await execa(command, args, {
      timeout: 120000, // 2-minute timeout
      env: {
        ...process.env,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GOOGLE_API_KEY: process.env.GEMINI_API_KEY
      }
    });

    const logContent = `=== Gemini Execution Log ${timestamp} ===\n` +
                       `Command: ${command} ${args.join(' ')}\n` +
                       `Exit Code: ${exitCode}\n` +
                       `STDOUT:\n${stdout}\n` +
                       `STDERR:\n${stderr}\n` +
                       `=== End Log ===\n\n`;

    await fs.appendFile(logFile, logContent, 'utf8');

    if (stderr) {
      console.warn('Warning from gemini-cli process:', stderr);
    }

    // Clean up the output to extract just the response
    const cleanedOutput = stdout
      .replace(/Loaded cached credentials\./g, '')
      .replace(/\n+/g, '\n')
      .trim();

    return {
      result: cleanedOutput,
      stats: {
        model: 'gemini',
        timestamp: timestamp
      },
    };
  } catch (error) {
    const errorLogContent = `=== Gemini Execution Error ${timestamp} ===\n` +
                           `Prompt: "${prompt}"\n` +
                           `Error: ${error.message}\n` +
                           `Stack: ${error.stack}\n` +
                           `=== End Error Log ===\n\n`;

    await fs.appendFile(logFile, errorLogContent, 'utf8').catch(logError => {
        console.error('Failed to write error log:', logError);
    });

    console.error(`Failed to execute gemini prompt. See log for details: ${logFile}`);
    throw error;
  }
}