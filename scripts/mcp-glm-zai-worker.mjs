#!/usr/bin/env node
/**
 * MCP GLM Z.AI Worker - Provides specialized worker agents via GLM-4.7 (Z.AI Coding Plan)
 * Replacement for MiniMax M2.1 worker. Used by Claude Code (Sonnet/Opus) to delegate
 * heavy coding tasks and save tokens.
 *
 * Setup (Claude Code):
 *   claude mcp add glm-zai -- node scripts/mcp-glm-zai-worker.mjs
 *
 * Setup (OpenCode):
 *   Add to opencode MCP config with the same command path.
 *
 * Environment:
 *   ZAI_API_KEY or ANTHROPIC_AUTH_TOKEN must be set.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";
import pRetry from "p-retry";
import fs from "fs/promises";
import path from "path";

const API_KEY = process.env.ZAI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

if (!API_KEY) {
  console.error("ERROR: ZAI_API_KEY (or ANTHROPIC_AUTH_TOKEN) environment variable is not set");
  console.error("Get your key at https://z.ai and export ZAI_API_KEY=your-key");
  process.exit(1);
}

const glmClient = new Anthropic({
  apiKey: API_KEY,
  baseURL: "https://api.z.ai/api/anthropic",
});

// Shared persona preamble.
// WHY: the same first rule and convention-following rule were duplicated across
// all five personas — one drifted edit would silently desynchronize worker behavior.
const SHARED_RULES = `Rules:
- Return ONLY the code or diffs. No explanations unless critical.
- Follow the existing project conventions you see in the provided files.`;

// Define Personas - specialized worker roles
const PERSONAS = {
  frontend: `You are an Expert Frontend Developer (GLM-4.7).
Focus: React, Vue, Svelte, Tailwind, CSS, UI/UX, responsive design.
Goal: Implement the requested UI component, page, or frontend logic.
${SHARED_RULES}
- Use modern ES modules syntax.
- Ensure accessibility basics (semantic HTML, ARIA where needed).`,

  backend: `You are a Senior Backend Engineer (GLM-4.7).
Focus: Node.js, Python, Go, SQL, API design, Auth, WebSocket.
Goal: Implement robust business logic, API endpoints, and data handling.
${SHARED_RULES}
- Follow RESTful principles.
- Include proper error handling.
- Write secure code (no SQL injection, XSS, etc).`,

  qa: `You are a QA Automation Engineer (GLM-4.7).
Focus: Unit tests, Integration tests, E2E tests, Edge cases.
Goal: Write comprehensive tests for the provided code.
${SHARED_RULES}
- Use the testing framework already in the project (Jest, Vitest, pytest, etc).
- Use AAA pattern (Arrange, Act, Assert).
- Cover happy paths, edge cases, and error scenarios.
- Aim for >80% coverage of the provided code.`,

  refactor: `You are a Code Quality Specialist (GLM-4.7).
Focus: Clean Code, DRY, SOLID, Performance optimization, readability.
Goal: Refactor the provided code to be cleaner, faster, and more maintainable.
${SHARED_RULES}
- Preserve existing functionality (no behavior changes).
- Reduce complexity and duplication.
- Improve naming and structure.`,

  general: `You are an Expert Full-Stack Developer (GLM-4.7).
Focus: Full-stack web development, problem-solving, debugging.
Goal: Complete the requested task efficiently and correctly.
${SHARED_RULES}
- Write clean, maintainable code.
- Consider edge cases.`
};

// Per-file context budget. WHY: a multi-megabyte file (lockfile, bundle, dump)
// passed via file_paths would blow the GLM context window and waste the whole
// delegation call. Files over the cap are truncated head-first with a marker.
const MAX_FILE_BYTES = 256 * 1024;

const server = new Server(
  { name: "glm-zai-worker", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// 1. Register Tools Dynamically
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Object.keys(PERSONAS).map((role) => ({
    name: `glm_zai_${role}`,
    description: `Delegate task to GLM Z.AI ${role.toUpperCase()} Specialist (GLM-4.7). Cost-effective worker for heavy coding tasks.`,
    inputSchema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description:
            "Detailed technical instruction for the worker. Be specific about what to implement/change.",
        },
        file_paths: {
          type: "array",
          items: { type: "string" },
          description:
            "List of files the worker needs to read as context (paths relative to project root).",
        },
        context_summary: {
          type: "string",
          description:
            "Brief context about the project and what we are building (optional but recommended).",
        },
        project_root: {
          type: "string",
          description:
            "Absolute path to the project root used to resolve file_paths. Defaults to the MCP server's working directory.",
        },
        max_tokens: {
          type: "number",
          description:
            "Maximum output tokens for the worker response (default 16384).",
        },
      },
      required: ["instruction"],
    },
  }));

  return { tools };
});

// 2. Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;

  if (!toolName.startsWith("glm_zai_")) {
    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${toolName}. Available: ${Object.keys(PERSONAS)
            .map((p) => `glm_zai_${p}`)
            .join(", ")}`,
        },
      ],
      isError: true,
    };
  }

  const role = toolName.replace("glm_zai_", "");
  const {
    instruction,
    file_paths = [],
    context_summary = "",
    project_root = "",
    max_tokens = 16384,
  } = request.params.arguments;

  try {
    // Read files internally to avoid sending file content through the supervisor.
    // project_root makes resolution independent of where the MCP server process
    // was spawned (process.cwd() is unreliable across harness configurations).
    const resolveBase = project_root || process.cwd();
    let heavyContext = "";
    const missingFiles = [];

    for (const filePath of file_paths) {
      try {
        const absolutePath = path.resolve(resolveBase, filePath);
        let content = await fs.readFile(absolutePath, "utf-8");
        if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) {
          content = content.slice(0, MAX_FILE_BYTES)
            + `\n\n[... TRUNCATED by worker: file exceeds ${MAX_FILE_BYTES / 1024}KB context budget ...]`;
        }
        heavyContext += `\n=== FILE: ${filePath} ===\n${content}\n=== END FILE ===\n`;
      } catch (e) {
        missingFiles.push(`${filePath} (${e.code || e.message})`);
      }
    }

    if (missingFiles.length > 0 && file_paths.length > 0 && missingFiles.length === file_paths.length) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Could not read any files: ${missingFiles.join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const systemPrompt = PERSONAS[role] || PERSONAS.general;

    let userMessage = "";
    if (context_summary) {
      userMessage += `PROJECT CONTEXT: ${context_summary}\n\n`;
    }
    userMessage += `TASK: ${instruction}\n`;
    if (missingFiles.length > 0) {
      userMessage += `\nWARNING: Could not read some files: ${missingFiles.join(", ")}\n`;
    }
    if (heavyContext) {
      userMessage += `\nSOURCE FILES:\n${heavyContext}`;
    }

    // TODO(token-economy): add Anthropic prompt caching (cache_control: ephemeral)
    // on the system prompt + file context once verified against the Z.AI endpoint —
    // it is Anthropic-SDK-compatible but cache support is unconfirmed. Highest-leverage
    // optimization for iterative delegation loops (see ARCHITECTURAL_AUDIT.md §3).
    const response = await pRetry(
      () => glmClient.messages.create({
        model: "GLM-4.7",
        max_tokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      {
        retries: 2,
        onFailedAttempt: (error) => {
          // Don't retry auth errors or invalid requests
          if (error.status === 401 || error.status === 400 || error.status === 403) {
            throw error;
          }
        },
      }
    );

    let resultText = "";
    if (response.content && Array.isArray(response.content)) {
      resultText = response.content
        .filter((block) => block.type === "text")
        .map((b) => b.text)
        .join("\n\n");
    } else {
      resultText = "No content returned from GLM Z.AI.";
    }

    // Surface token usage so the supervisor can manage the delegation token economy
    // (previously response.usage was silently discarded).
    let usageFooter = "";
    if (response.usage) {
      const inTok = response.usage.input_tokens ?? "?";
      const outTok = response.usage.output_tokens ?? "?";
      usageFooter = `\n\n---\n_tokens: ${inTok} in / ${outTok} out_`;
    }

    return {
      content: [
        {
          type: "text",
          text: `## GLM Z.AI (${role.toUpperCase()}) Output\n\n${resultText}${usageFooter}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `GLM Z.AI API Error: ${error.message}\n\nEnsure ZAI_API_KEY is set. Get your key at https://z.ai`,
        },
      ],
      isError: true,
    };
  }
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
