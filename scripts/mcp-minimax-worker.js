#!/usr/bin/env node
/**
 * MCP MiniMax Swarm - Provides specialized worker agents via MiniMax M2.1
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;

if (!MINIMAX_API_KEY) {
  console.error("ERROR: MINIMAX_API_KEY environment variable is not set");
  process.exit(1);
}

// Initialize MiniMax client
const minimaxClient = new Anthropic({
  apiKey: MINIMAX_API_KEY,
  baseURL: "https://api.minimax.io/anthropic",
});

// Define Personas
const PERSONAS = {
  "frontend": `You are an Expert Frontend Developer (MiniMax M2.1).
    Focus: React, Vue, Tailwind, CSS, UI/UX.
    Goal: Implement the requested UI component or logic.
    Output: Return ONLY the code or diffs. No explanations.`,

  "backend": `You are a Senior Backend Engineer (MiniMax M2.1).
    Focus: Node.js, Python, Go, SQL, API design, Auth.
    Goal: Implement robust business logic and data handling.
    Output: Return ONLY the code or diffs. No explanations.`,

  "qa": `You are a QA Automation Engineer (MiniMax M2.1).
    Focus: Unit tests, Integration tests, Edge cases.
    Goal: Write comprehensive tests for the provided code.
    Output: Return ONLY the test files.`,

  "refactor": `You are a Code Quality Specialist (MiniMax M2.1).
    Focus: Clean Code, DRY, SOLID, Performance optimization.
    Goal: Refactor the provided code to be cleaner and faster.
    Output: Return ONLY the refactored code.`
};

const server = new Server(
  { name: "minimax-swarm", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// 1. Register Tools Dynamically
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Object.keys(PERSONAS).map(role => ({
    name: `minimax_${role}`,
    description: `Delegate task to ${role.toUpperCase()} Specialist (MiniMax M2.1). Cost-effective worker.`,
    inputSchema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "Detailed technical instruction for the worker."
        },
        file_paths: {
          type: "array",
          items: { type: "string" },
          description: "List of files the worker needs to read (paths relative to root)."
        },
        context_summary: {
          type: "string",
          description: "Brief context about what we are building."
        }
      },
      required: ["instruction", "file_paths"]
    }
  }));

  return { tools };
});

// 2. Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const roleMatch = request.params.name.match(/^minimax_(.+)$/);

  if (!roleMatch || !PERSONAS[roleMatch[1]]) {
    return {
      content: [{ type: "text", text: `Unknown tool/role: ${request.params.name}` }],
      isError: true,
    };
  }

  const role = roleMatch[1];
  const { instruction, file_paths, context_summary } = request.params.arguments;

  try {
    // Read files internally
    let heavyContext = "";
    const missingFiles = [];

    for (const filePath of file_paths) {
      try {
        const absolutePath = path.resolve(process.cwd(), filePath);
        const content = await fs.readFile(absolutePath, "utf-8");
        heavyContext += `\n=== FILE: ${filePath} ===\n${content}\n`;
      } catch (e) {
        missingFiles.push(filePath);
      }
    }

    if (missingFiles.length > 0) {
      return {
        content: [{ type: "text", text: `Error: Could not read files: ${missingFiles.join(", ")}` }],
        isError: true,
      };
    }

    const systemPrompt = PERSONAS[role];
    const userMessage = `
CONTEXT: ${context_summary || "None"}
TASK: ${instruction}

SOURCE FILES:
${heavyContext}
`;

    const response = await minimaxClient.messages.create({
      model: "MiniMax-M2.1",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    let resultText = "";
    if (response.content && Array.isArray(response.content)) {
      resultText = response.content
        .filter(block => block.type === 'text')
        .map(b => b.text)
        .join('\n\n');
    } else {
      resultText = "No content returned from MiniMax.";
    }

    return {
      content: [
        {
          type: "text",
          text: `## MiniMax (${role.toUpperCase()}) Output\n\n${resultText}`,
        },
      ],
    };

  } catch (error) {
    return {
      content: [{ type: "text", text: `MiniMax API Error: ${error.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
