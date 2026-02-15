#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * EckSnapshot MCP Server
 * Provides tools for finalizing development tasks with git integration
 */

class EckSnapshotMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'ecksnapshot-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'eck_finish_task',
          description: 'Finalize a completed task by updating AnswerToSA.md, creating a git commit, and generating a delta snapshot. This should be called when a task is fully complete, tested, and ready to be committed. The tool automatically syncs context by running eck-snapshot update-auto.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                description: 'Status update for the Architect: what was done, what issues remain, what needs review',
              },
              message: {
                type: 'string',
                description: 'Git commit message (follow Conventional Commits, e.g. "feat: add login")',
              },
            },
            required: ['status', 'message'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'eck_finish_task') {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const { status, message } = request.params.arguments;
      // Support legacy 'commitMessage' parameter
      const commitMessage = message || request.params.arguments.commitMessage;

      if (!status || !commitMessage) {
        throw new Error('Missing required arguments: status and message are required');
      }

      try {
        const result = await this.finishTask(status, commitMessage);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async finishTask(status, commitMessage) {
    const workDir = process.cwd();
    const answerFilePath = path.join(workDir, '.eck', 'lastsnapshot', 'AnswerToSA.md');

    const steps = [];

    // Step 1: Write AnswerToSA.md (OVERWRITE, not append)
    try {
      await fs.mkdir(path.dirname(answerFilePath), { recursive: true });
      await fs.writeFile(answerFilePath, `# Agent Report\n\n${status}\n`, 'utf-8');
      steps.push({ step: 'update_answer', success: true, message: 'Updated AnswerToSA.md' });
    } catch (error) {
      steps.push({ step: 'update_answer', success: false, error: error.message });
      throw new Error(`Failed to update AnswerToSA.md: ${error.message}`);
    }

    // Step 2: Git add AnswerToSA.md
    try {
      await execa('git', ['add', '.eck/lastsnapshot/AnswerToSA.md'], { cwd: workDir, timeout: 30000 });
      steps.push({ step: 'git_add_answer', success: true });
    } catch (error) {
      steps.push({ step: 'git_add_answer', success: false, error: error.message });
      throw new Error(`Failed to git add AnswerToSA.md: ${error.message}`);
    }

    // Step 3: Git add all other changes
    try {
      await execa('git', ['add', '.'], { cwd: workDir, timeout: 30000 });
      steps.push({ step: 'git_add_all', success: true });
    } catch (error) {
      steps.push({ step: 'git_add_all', success: false, error: error.message });
      throw new Error(`Failed to git add all changes: ${error.message}`);
    }

    // Step 4: Create git commit
    try {
      await execa('git', ['commit', '-m', commitMessage], { cwd: workDir, timeout: 30000 });
      steps.push({ step: 'git_commit', success: true, message: commitMessage });
    } catch (error) {
      steps.push({ step: 'git_commit', success: false, error: error.message });
      throw new Error(`Failed to create commit: ${error.message}`);
    }

    // Step 5: ALWAYS generate update snapshot (using update-auto for silent JSON output)
    try {
      const cliPath = path.join(PROJECT_ROOT, 'index.js');
      const { stdout } = await execa('node', [cliPath, 'update-auto'], { cwd: workDir, timeout: 120000 });

      // Parse JSON output
      let snapshotResult;
      try {
        snapshotResult = JSON.parse(stdout);
      } catch {
        snapshotResult = { raw_output: stdout };
      }

      steps.push({
        step: 'update_snapshot',
        success: snapshotResult.status === 'success',
        snapshot_file: snapshotResult.snapshot_file,
        files_count: snapshotResult.files_count,
        has_agent_report: snapshotResult.has_agent_report,
        message: snapshotResult.message || 'Delta snapshot generated',
      });
    } catch (error) {
      steps.push({
        step: 'update_snapshot',
        success: false,
        error: error.message,
        message: 'Snapshot generation failed (non-critical)',
      });
      // Don't throw here, snapshot failure shouldn't block task completion
    }

    return {
      success: true,
      message: 'Task finalized successfully',
      steps,
      commitMessage,
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('EckSnapshot MCP server running on stdio');
  }
}

// Start the server
const server = new EckSnapshotMCPServer();
server.run().catch(console.error);
