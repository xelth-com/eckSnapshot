import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import pRetry from 'p-retry';
import ora from 'ora';
import { loadProjectEckManifest } from '../utils/fileUtils.js';
import { initiateLogin } from './authService.js';
import which from 'which';

const SYSTEM_PROMPT = 'You are a Coder agent. Apply code changes per JSON spec. Respond only in JSON: {success: bool, changes: array, errors: array, post_steps: object}';

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Checks if the codex CLI tool is available in the system's PATH.
 * Throws an error if not found.
 */
async function ensureCodexCliExists() {
  try {
    await which('codex');
  } catch (error) {
    throw new Error('The `codex` CLI tool is not installed or not in your PATH. Please install it from https://github.com/openai/codex to use this command.');
  }
}

/**
 * Delegates an apply_code_changes payload to the codex CLI with auto-login.
 * @param {string|object} payload - JSON string or object payload to forward to the agent.
 * @param {{ verbose?: boolean }} [options]
 * @returns {Promise<object>}
 */
export async function ask(payload, options = {}) {
  const { verbose = false } = options;
  await ensureCodexCliExists();

  const run = async () => {
    const spinner = verbose ? null : ora('Sending payload to Codex agent...').start();
    try {
      const payloadObject = await parsePayload(payload);
      const manifest = await loadProjectEckManifest(process.cwd());
      const userPrompt = buildUserPrompt(payloadObject, manifest);

      const args = [
        'exec',
        // Use full-auto mode to prevent interactive prompts from the agent,
        // as this service is designed for non-interactive delegation.
        '--full-auto',
        `${SYSTEM_PROMPT}\n\n${userPrompt}`
      ];

      debug(verbose, `Executing: codex ${args.join(' ')}`);

      const cliResult = await execa('codex', args, {
        cwd: process.cwd(),
        timeout: 300000 // 5-minute timeout
      });

      const output = cliResult?.stdout?.trim();
      if (!output) {
        throw new Error('codex CLI returned empty response');
      }

      // Try to parse the output as JSON first
      try {
        const parsed = JSON.parse(output);
        if (parsed.post_steps || parsed.post_execution_steps) {
          const postSteps = parsed.post_steps || parsed.post_execution_steps;
          await handlePostExecutionSteps(postSteps, payloadObject);
          parsed.mcp_feedback = postSteps?.mcp_feedback || null;
        }
        spinner?.succeed('Codex agent completed the task.');
        return parsed;
      } catch (e) {
        // If not JSON, treat as text response
        spinner?.succeed('Codex agent completed the task.');
        return { success: true, changes: [], errors: [], response_text: output };
      }

    } catch (error) {
        spinner?.fail('Codex execution failed.');
        handleCliError(error); // This will throw a specific error type
    }
  };

  return pRetry(run, {
    retries: 1, // Only retry once after a successful login
    minTimeout: 0,
    onFailedAttempt: async (error) => {
      if (error.name === 'AuthError') {
        await initiateLogin();
      } else {
        throw error; // Don't retry for other errors, fail immediately
      }
    }
  });
}


async function parsePayload(payload) {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch (error) {
      throw new Error(`Failed to parse payload JSON: ${error.message}`);
    }
  }
  if (typeof payload === 'object' && payload !== null) {
    return payload;
  }
  throw new Error('Invalid payload type. Expected JSON string or object.');
}

function buildUserPrompt(payloadObject, manifest) {
  const payloadString = JSON.stringify(payloadObject);
  if (!manifest) {
    return payloadString;
  }

  const sections = [];
  if (manifest.context) {
    sections.push('## .eck Context\n' + manifest.context);
  }
  if (manifest.operations) {
    sections.push('## .eck Operations\n' + manifest.operations);
  }
  if (manifest.journal) {
    sections.push('## .eck Journal\n' + manifest.journal);
  }
  if (manifest.environment && Object.keys(manifest.environment).length > 0) {
    sections.push('## .eck Environment\n' + JSON.stringify(manifest.environment, null, 2));
  }

  if (sections.length === 0) {
    return payloadString;
  }

  return `${payloadString}\n\n# Project Context\n${sections.join('\n\n')}`;
}

function debug(verbose, message) {
  if (verbose) {
    console.log(`[ask-gpt] ${message}`);
  }
}

function handleCliError(error) {
  const combined = `${error?.message || ''} ${error?.stderr || ''} ${error?.stdout || ''}`.toLowerCase();
  // Check for text that `codex` outputs when auth is missing.
  if (combined.includes('authentication is required') || combined.includes('please run `codex login`')) {
    const authError = new Error('Codex authentication is required. Attempting to log in.');
    authError.name = 'AuthError';
    throw authError;
  }

  throw new Error(`codex CLI failed: ${error.stderr || error.message}`);
}

async function handlePostExecutionSteps(postSteps, payloadObject) {
  if (!postSteps || typeof postSteps !== 'object') {
    return;
  }

  if (postSteps.journal_entry) {
    await applyJournalEntry(postSteps.journal_entry, payloadObject);
  }

  if (postSteps.mcp_feedback) {
    logMcpFeedback(postSteps.mcp_feedback);
  }
}

async function applyJournalEntry(entry, payloadObject) {
  const journalEntry = normalizeJournalEntry(entry);
  const journalPath = path.join(process.cwd(), '.eck', 'JOURNAL.md');

  await fs.mkdir(path.dirname(journalPath), { recursive: true });

  let existing = '';
  try {
    existing = await fs.readFile(journalPath, 'utf-8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Failed to read JOURNAL.md: ${error.message}`);
    }
  }

  const taskId = payloadObject?.task_id || payloadObject?.payload?.task_id || journalEntry.task_id || 'ask-gpt';
  const isoDate = new Date().toISOString();

  const frontmatter = [
    '---',
    `task_id: ${taskId}`,
    `date: ${isoDate}`,
    `type: ${journalEntry.type}`,
    `scope: ${journalEntry.scope}`,
    '---',
    ''
  ].join('\n');

  const summary = journalEntry.summary ? `## ${journalEntry.summary}\n` : '';
  const details = journalEntry.details ? `${journalEntry.details}\n` : '';

  const entryBlock = `${frontmatter}${summary ? `${summary}\n` : ''}${details}\n`;

  const existingTrimmed = existing ? existing.replace(/^\n+/, '') : '';
  const newContent = `${entryBlock}${existingTrimmed}`.replace(/\n{3,}/g, '\n\n');

  await fs.writeFile(journalPath, newContent.trimEnd() + '\n');

  await stageJournal(journalPath);
  await commitJournal(journalEntry);
}

function normalizeJournalEntry(entry) {
  return {
    type: entry.type || 'chore',
    scope: entry.scope || 'journal',
    summary: entry.summary || 'Update journal entry',
    details: entry.details || ''
  };
}

async function stageJournal(journalPath) {
  const relativePath = path.relative(process.cwd(), journalPath);
  try {
    await execa('git', ['add', relativePath], { cwd: process.cwd() });
  } catch (error) {
    throw new Error(`Failed to stage journal entry: ${error.message}`);
  }
}

async function commitJournal(entry) {
  const scopePart = entry.scope ? `(${entry.scope})` : '';
  const summary = (entry.summary || 'Update journal entry').replace(/\s+/g, ' ').trim();
  const commitMessage = `${entry.type}${scopePart}: ${summary}`;

  try {
    await execa('git', ['commit', '-m', commitMessage], { cwd: process.cwd() });
  } catch (error) {
    const text = `${error?.stderr || ''} ${error?.stdout || ''}`.toLowerCase();
    if (text.includes('nothing to commit')) {
      console.warn('Journal entry already committed or no changes to commit.');
      return;
    }
    throw new Error(`Failed to commit journal entry: ${error.message}`);
  }
}

function logMcpFeedback(feedback) {
  if (!feedback) {
    return;
  }

  const errors = Array.isArray(feedback.errors) ? feedback.errors : [];
  if (!feedback.success || errors.length > 0) {
    console.warn('MCP feedback indicates issues:', errors.length > 0 ? errors : feedback);
  } else {
    console.log('MCP feedback:', feedback);
  }
}