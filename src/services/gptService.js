import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import { loadProjectEckManifest } from '../utils/fileUtils.js';

const SYSTEM_PROMPT = 'You are a Coder agent. Apply code changes per JSON spec. Respond only in JSON: {success: bool, changes: array, errors: array, post_steps: object}';

/**
 * Delegates an apply_code_changes payload to the ChatGPT CLI.
 * @param {string|object} payload - JSON string or object payload to forward to GPT.
 * @param {{ verbose?: boolean }} [options]
 * @returns {Promise<object>}
 */
export async function ask(payload, options = {}) {
  const { verbose = false } = options;
  const payloadObject = await parsePayload(payload);
  const manifest = await loadProjectEckManifest(process.cwd());
  const userPrompt = buildUserPrompt(payloadObject, manifest);
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const args = [
    'chatgpt',
    '--model',
    model,
    '--stream',
    'false',
    `${SYSTEM_PROMPT}\n\n${userPrompt}`
  ];

  const env = { ...process.env };
  if (process.env.CHATGPT_SESSION_PATH) {
    env.CHATGPT_SESSION_PATH = process.env.CHATGPT_SESSION_PATH;
  }

  debug(verbose, `Executing chatgpt CLI with model ${model}`);

  let cliResult;
  try {
    cliResult = await execa('npx', args, {
      cwd: process.cwd(),
      env
    });
  } catch (error) {
    handleCliError(error);
  }

  const output = cliResult?.stdout?.trim();
  if (!output) {
    throw new Error('chatgpt CLI returned empty response');
  }

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(`Failed to parse chatgpt JSON response: ${error.message}`);
  }

  if (parsed.post_steps || parsed.post_execution_steps) {
    const postSteps = parsed.post_steps || parsed.post_execution_steps;
    await handlePostExecutionSteps(postSteps, payloadObject);
    parsed.post_steps = postSteps;
    parsed.mcp_feedback = postSteps?.mcp_feedback || null;
  }

  return parsed;
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
  if (combined.includes('session') || combined.includes('login')) {
    throw new Error('ChatGPT session expired or missing. Please run `npx chatgpt login` and ensure CHATGPT_SESSION_PATH is set.');
  }

  throw new Error(`chatgpt CLI failed: ${error.message}`);
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
