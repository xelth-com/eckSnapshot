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
        name: "eck_fail_task",
        description: "Use this if you are stuck, blocked, or unable to complete the task. It saves your report to AnswerToSA.md and generates an emergency snapshot WITHOUT committing broken code. Do NOT use this if tests pass.",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Detailed explanation of why you are blocked, what you tried, and what the Architect should know."
            }
          },
          required: ["status"]
        }
      },
      {
        name: "eck_finish_task",
        description: "Completes the current coding task. 1) Overwrites AnswerToSA.md with status for the Architect. 2) Stages all changes. 3) Commits with the provided message. 4) Automatically updates the context snapshot. WARNING: USE ONLY ONCE PER TASK WHEN 100% FINISHED. Do NOT use this for intermediate saves or testing during your debugging loop.",
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
      },
      {
        name: "eck_manifest_edit",
        description: "Atomically edits an .eck manifest file (like TECH_DEBT.md, ROADMAP.md) WITHOUT reading the entire file into context. Use this to save tokens.",
        inputSchema: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "Name of the file in .eck/ (e.g., 'TECH_DEBT.md')"
            },
            action: {
              type: "string",
              enum: ["append_to_section", "replace_text"],
              description: "Action to perform: append bullet to a section, or replace specific text."
            },
            section_header: {
              type: "string",
              description: "For 'append_to_section': The exact markdown header to append under (e.g., '## Active', '# Sprint 1')."
            },
            content: {
              type: "string",
              description: "The text to append (e.g., '- [ ] Fix memory leak'), or the new text for replace_text."
            },
            target_text: {
              type: "string",
              description: "For 'replace_text': The exact old text you want to find and replace (e.g., '- [ ] Bug 123')."
            }
          },
          required: ["file", "action", "content"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "eck_fail_task") {
    const { status } = request.params.arguments;
    const workDir = process.cwd();

    try {
      const answerDir = path.join(workDir, '.eck', 'lastsnapshot');
      await fs.mkdir(answerDir, { recursive: true });
      await fs.writeFile(
        path.join(answerDir, 'AnswerToSA.md'),
        `# Agent Report (BLOCKED/FAILED)\n\n${status}\n`,
        'utf-8'
      );

      const cliPath = path.join(PROJECT_ROOT, "index.js");
      const { stdout } = await execa("node", [cliPath, JSON.stringify({ name: "eck_update_auto", arguments: { fail: true } })], { cwd: workDir, timeout: 120000 });

      let result;
      try {
        result = JSON.parse(stdout);
      } catch (e) {
        return { content: [{ type: "text", text: `⚠️ Task aborted, but snapshot update returned invalid JSON: ${stdout}` }] };
      }

      return {
        content: [{
          type: "text",
          text: `🚨 Task marked as FAILED.\n📝 AnswerToSA.md updated\n📸 Emergency Snapshot: ${result.snapshot_file} (${result.files_count} files)`
        }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `❌ Error: ${error.message}\n${error.stderr || ''}` }], isError: true };
    }
  }

  if (request.params.name === "eck_manifest_edit") {
    const { file, action, section_header, content, target_text } = request.params.arguments;
    const workDir = process.cwd();
    const manifestPath = path.join(workDir, '.eck', file);

    try {
      let fileContent = '';
      try {
        fileContent = await fs.readFile(manifestPath, 'utf-8');
      } catch (e) {
        if (e.code === 'ENOENT') {
          fileContent = `# ${file.replace('.md', '')}\n\n`;
        } else {
          throw e;
        }
      }

      let updatedContent = fileContent;

      if (action === 'replace_text') {
        if (!target_text) throw new Error("target_text is required for replace_text action");
        if (!fileContent.includes(target_text)) throw new Error(`Target text not found in ${file}`);
        updatedContent = fileContent.replace(target_text, content);
      } else if (action === 'append_to_section') {
        if (!section_header) throw new Error("section_header is required for append_to_section action");
        
        const regex = new RegExp(`^(${section_header.replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\$&')}\\s*\\r?\\n)`, 'm');
        const match = regex.exec(fileContent);
        
        if (match) {
          const insertPos = match.index + match[0].length;
          updatedContent = fileContent.slice(0, insertPos) + content + '\n' + fileContent.slice(insertPos);
        } else {
          const suffix = fileContent.endsWith('\n') ? '' : '\n';
          updatedContent = fileContent + suffix + '\n' + section_header + '\n' + content + '\n';
        }
      }

      await fs.writeFile(manifestPath, updatedContent, 'utf-8');
      return {
        content: [{ type: "text", text: `✅ Successfully edited ${file}` }]
      };

    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Error editing manifest: ${error.message}` }],
        isError: true
      };
    }
  }

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
      const { stdout } = await execa("node", [cliPath, JSON.stringify({ name: "eck_update_auto" })], { cwd: workDir, timeout: 120000 });

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
