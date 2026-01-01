#!/usr/bin/env node
/**
 * MCP Server: MiniMax Heavy Lifter (Fixed for M2.1 Thinking Blocks)
 * Handles file reading internally and correctly parses MiniMax reasoning responses.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

// Initialize MiniMax client using Anthropic SDK
const minimaxClient = new Anthropic({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: "https://api.minimax.io/anthropic", // Standard endpoint
});

const server = new Server(
  { name: "minimax-worker", version: "1.0.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "delegate_coding_task",
        description: "DELEGATE HEAVY TASKS HERE. Use this for coding, refactoring, or analysis. DO NOT read files yourself. Pass file paths, and this tool will read them, send them to MiniMax M2.1, and return the solution.",
        inputSchema: {
          type: "object",
          properties: {
            instruction: {
              type: "string",
              description: "Detailed instruction for the Senior Developer (MiniMax). Be specific about what needs to change.",
            },
            file_paths: {
              type: "array",
              items: { type: "string" },
              description: "List of relative file paths. The tool will read their content internally.",
            },
            context_summary: {
              type: "string",
              description: "Brief summary of the project context or related files that aren't included in file_paths.",
            }
          },
          required: ["instruction", "file_paths"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "delegate_coding_task") {
    const { instruction, file_paths, context_summary } = request.params.arguments;

    try {
      // 1. Internal File Reading
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
          content: [{ type: "text", text: `Error: Could not read the following files locally: ${missingFiles.join(", ")}` }],
          isError: true,
        };
      }

      // 2. Construct Prompt for MiniMax
      const systemPrompt = `You are MiniMax-M2.1, an expert Senior Software Engineer.
Your task is to implement code changes based on the provided context.

GUIDELINES:
- Return ONLY the necessary code or diffs.
- Do not be chatty.
- If writing a full file, format it inside markdown code blocks.`;

      const userMessage = `
PROJECT CONTEXT SUMMARY:
${context_summary || "None provided."}

TASK INSTRUCTION:
${instruction}

SOURCE FILES:
${heavyContext}
`;

      // 3. Call MiniMax via Anthropic SDK
      const response = await minimaxClient.messages.create({
        model: "MiniMax-M2.1",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      // 4. Robust Response Parsing (Fix for Thinking Blocks)
      let resultText = "";

      // MiniMax M2.1 returns [{ type: 'thinking', thinking: '...' }, { type: 'text', text: '...' }]
      if (response.content && Array.isArray(response.content)) {
        // Filter for text blocks specifically
        const textBlocks = response.content.filter(block => block.type === 'text');
        if (textBlocks.length > 0) {
          resultText = textBlocks.map(b => b.text).join('\n\n');
        } else {
          // Fallback: try to grab content from the first block if it's a string (unlikely but possible)
          // or dump JSON if we can't find text
          resultText = JSON.stringify(response.content, null, 2);
        }
      } else {
        resultText = "No content returned from MiniMax.";
      }

      return {
        content: [
          {
            type: "text",
            text: `## MiniMax Worker Result\n\n${resultText}`,
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `MiniMax API Error: ${error.message}\n\nHint: Check API Key and endpoint.`,
          },
        ],
        isError: true,
      };
    }
  }
  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
await server.connect(transport);
