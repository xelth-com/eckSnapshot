#!/usr/bin/env node
/**
 * MCP Eck Core - Provides core project management capabilities to Claude
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execa } from "execa";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const server = new Server(
  { name: "eck-core", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "eck_finish_task",
        description: "Completes the current coding task. 1) Stages all changes. 2) Commits with the provided message. 3) Automatically updates the context snapshot. Use this instead of manual git commands.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Git commit message (follow Conventional Commits, e.g. 'feat: add login')"
            }
          },
          required: ["message"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "eck_finish_task") {
    const { message } = request.params.arguments;

    try {
      // 1. Git Add
      await execa("git", ["add", "."], { cwd: process.cwd() });

      // 2. Git Commit
      // We allow empty commits just in case, though unlikely in a finish_task scenario
      await execa("git", ["commit", "--allow-empty", "-m", message], { cwd: process.cwd() });

      // 3. Auto Update Snapshot via CLI
      // We use the local index.js to ensure we use the current version of the tool
      const cliPath = path.join(PROJECT_ROOT, "index.js");
      const { stdout } = await execa("node", [cliPath, "update-auto"], { cwd: process.cwd() });

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
            text: `✅ Task Completed Successfully.\n\n1. 💾 Git Commit: "${message}"\n2. 📸 Context Updated: ${result.snapshot_file} (+${result.files_count} files)\n\nReady for next instruction.`
          }]
        };
      } else if (result.status === "no_changes") {
        return {
          content: [{ type: "text", text: `✅ Committed: "${message}"\nℹ️ No new changes for snapshot update.` }]
        };
      } else {
        return {
          content: [{ type: "text", text: `✅ Committed: "${message}"\n❌ Snapshot Update Failed: ${result.message}` }]
        };
      }

    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Error finishing task: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}` }],
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
