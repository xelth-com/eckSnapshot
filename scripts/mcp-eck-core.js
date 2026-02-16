#!/usr/bin/env node
/**
 * MCP Eck Core - Unified task completion tool for Claude Code and OpenCode
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execa } from "execa";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const server = new Server(
  { name: "eck-core", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "eck_finish_task",
        description: "Completes the current coding task. 1) Overwrites AnswerToSA.md with status for the Architect. 2) Stages all changes. 3) Commits with the provided message. 4) Automatically updates the context snapshot. Use this instead of manual git commands.",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Status update for the Architect: what was done, what issues remain, what needs review"
            },
            message: {
              type: "string",
              description: "Git commit message (follow Conventional Commits, e.g. 'feat: add login')"
            }
          },
          required: ["status", "message"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "eck_finish_task") {
    const { status, message } = request.params.arguments;
    const workDir = process.cwd();

    try {
      // 1. Write fresh AnswerToSA.md (OVERWRITE, not append)
      const answerDir = path.join(workDir, '.eck', 'lastsnapshot');
      await fs.mkdir(answerDir, { recursive: true });
      await fs.writeFile(
        path.join(answerDir, 'AnswerToSA.md'),
        `# Agent Report\n\n${status}\n`,
        'utf-8'
      );

      // 2. Git Add
      await execa("git", ["add", "."], { cwd: workDir, timeout: 30000 });

      // 3. Git Commit
      await execa("git", ["commit", "--allow-empty", "-m", message], { cwd: workDir, timeout: 30000 });

      // 4. Auto Update Snapshot
      const cliPath = path.join(PROJECT_ROOT, "index.js");
      const { stdout } = await execa("node", [cliPath, "update-auto"], { cwd: workDir, timeout: 120000 });

      let result;
      try {
        result = JSON.parse(stdout);
      } catch (e) {
        return {
          content: [{ type: "text", text: `✅ Committed: "${message}"\n⚠️ Snapshot update returned invalid JSON: ${stdout}` }]
        };
      }

      if (result.status === "success") {
        return {
          content: [{
            type: "text",
            text: `✅ Committed: "${message}"\n📝 AnswerToSA.md updated\n📸 Snapshot: ${result.snapshot_file} (${result.files_count} files)`
          }]
        };
      } else {
        return {
          content: [{ type: "text", text: `✅ Committed: "${message}"\nℹ️ Snapshot: ${result.message}` }]
        };
      }

    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Error: ${error.message}\n${error.stderr || ''}` }],
        isError: true
      };
    }
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
    isError: true
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);

// --- Graceful Shutdown Handler ---
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    process.exit(0);
  }
});
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
