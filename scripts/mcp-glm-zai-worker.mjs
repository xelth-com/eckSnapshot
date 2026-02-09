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

// Define Personas - specialized worker roles
const PERSONAS = {
  frontend: `You are an Expert Frontend Developer (GLM-4.7).
Focus: React, Vue, Svelte, Tailwind, CSS, UI/UX, responsive design.
Goal: Implement the requested UI component, page, or frontend logic.
Rules:
- Return ONLY the code or diffs. No explanations unless critical.
- Follow the existing project conventions you see in the provided files.
- Use modern ES modules syntax.
- Ensure accessibility basics (semantic HTML, ARIA where needed).`,

  backend: `You are a Senior Backend Engineer (GLM-4.7).
Focus: Node.js, Python, Go, SQL, API design, Auth, WebSocket.
Goal: Implement robust business logic, API endpoints, and data handling.
Rules:
- Return ONLY the code or diffs. No explanations unless critical.
- Follow RESTful principles and existing project patterns.
- Include proper error handling.
- Write secure code (no SQL injection, XSS, etc).`,

  qa: `You are a QA Automation Engineer (GLM-4.7).
Focus: Unit tests, Integration tests, E2E tests, Edge cases.
Goal: Write comprehensive tests for the provided code.
Rules:
- Return ONLY the test files. No explanations unless critical.
- Use the testing framework already in the project (Jest, Vitest, pytest, etc).
- Use AAA pattern (Arrange, Act, Assert).
- Cover happy paths, edge cases, and error scenarios.
- Aim for >80% coverage of the provided code.`,

  refactor: `You are a Code Quality Specialist (GLM-4.7).
Focus: Clean Code, DRY, SOLID, Performance optimization, readability.
Goal: Refactor the provided code to be cleaner, faster, and more maintainable.
Rules:
- Return ONLY the refactored code. No explanations unless critical.
- Preserve existing functionality (no behavior changes).
- Reduce complexity and duplication.
- Improve naming and structure.`,

  general: `You are an Expert Full-Stack Developer (GLM-4.7).
Focus: Full-stack web development, problem-solving, debugging.
Goal: Complete the requested task efficiently and correctly.
Rules:
- Return ONLY the code or diffs. No explanations unless critical.
- Follow existing project conventions.
- Write clean, maintainable code.
- Consider edge cases.`
};

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
  } = request.params.arguments;

  try {
    // Read files internally to avoid sending file content through the supervisor
    let heavyContext = "";
    const missingFiles = [];

    for (const filePath of file_paths) {
      try {
        const absolutePath = path.resolve(process.cwd(), filePath);
        const content = await fs.readFile(absolutePath, "utf-8");
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

    const response = await glmClient.messages.create({
      model: "GLM-4.7",
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    let resultText = "";
    if (response.content && Array.isArray(response.content)) {
      resultText = response.content
        .filter((block) => block.type === "text")
        .map((b) => b.text)
        .join("\n\n");
    } else {
      resultText = "No content returned from GLM Z.AI.";
    }

    return {
      content: [
        {
          type: "text",
          text: `## GLM Z.AI (${role.toUpperCase()}) Output\n\n${resultText}`,
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
