import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

const TELEMETRY_URL = 'https://xelth.com/T/report';

/**
 * Parses the AnswerToSA.md file to extract telemetry data.
 * @param {string} content The markdown content
 * @returns {object|null} The parsed telemetry data or null if invalid
 */
export function parseAgentReport(content) {
  if (!content) return null;

  const data = {
    model_name: 'Unknown',
    agent_role: 'Coder',
    task_scope: 'general',
    status: 'UNKNOWN',
    duration_sec: null,
    error_summary: null
  };

  // Extract Executor (Model Name)
  const executorMatch = content.match(/\*\*Executor:\*\*\s*(.+)/i);
  if (executorMatch) {
    data.model_name = executorMatch[1].trim();
  }

  // Extract Status
  const statusMatch = content.match(/\*\*Status:\*\*\s*\[?(SUCCESS|FAILED|BLOCKED)\]?/i);
  if (statusMatch) {
    data.status = statusMatch[1].toUpperCase();
  }

  // Extract Task Name / Scope
  const titleMatch = content.match(/#\s*Report:\s*(.+)/i);
  if (titleMatch) {
    data.task_scope = titleMatch[1].trim().substring(0, 100);
  }

  // If failed/blocked, capture next few lines as error summary
  if (data.status === 'FAILED' || data.status === 'BLOCKED') {
    const lines = content.split('\n');
    const statusIndex = lines.findIndex(l => l.match(/\*\*Status:\*\*/i));
    if (statusIndex !== -1 && statusIndex + 1 < lines.length) {
      data.error_summary = lines.slice(statusIndex + 1, statusIndex + 4).join(' ').trim().substring(0, 500);
    }
  }

  return data;
}

/**
 * Reads the latest report and pushes it to the telemetry server.
 * @param {string} repoPath
 * @param {boolean} silent If true, suppresses console output (for automated runs)
 */
export async function pushTelemetry(repoPath, silent = false) {
  const reportPath = path.join(repoPath, '.eck', 'lastsnapshot', 'AnswerToSA.md');

  try {
    const content = await fs.readFile(reportPath, 'utf-8');

    // Don't push if already pushed
    if (content.includes('[TELEMETRY: PUSHED]')) {
      if (!silent) console.log(chalk.yellow('i  Telemetry already pushed for this report.'));
      return;
    }

    const payload = parseAgentReport(content);
    if (!payload || payload.status === 'UNKNOWN') {
      if (!silent) console.log(chalk.yellow('i  Could not parse a valid agent report for telemetry.'));
      return;
    }

    const response = await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      if (!silent) console.log(chalk.green(`Telemetry pushed successfully for ${payload.model_name} (${payload.status})`));
      await fs.appendFile(reportPath, '\n\n[TELEMETRY: PUSHED]\n', 'utf-8');
    } else {
      if (!silent) console.log(chalk.red(`Telemetry push failed: ${response.statusText}`));
    }
  } catch (error) {
    if (!silent) {
      if (error.code === 'ENOENT') {
        console.log(chalk.yellow('i  No AnswerToSA.md found. Nothing to push.'));
      } else {
        console.log(chalk.red(`Telemetry error: ${error.message}`));
      }
    }
  }
}
