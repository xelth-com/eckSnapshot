#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const Anthropic = require("@anthropic-ai/sdk");

const glmClient = new Anthropic({
  apiKey: process.env.ZAI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: "https://api.z.ai/api/anthropic",
});

const PERSONAS = {
  "backend": `You are a Senior Backend Engineer.

Your expertise includes:
- REST API design and implementation
- Database schema design and migrations
- Authentication and authorization
- Microservices architecture
- API documentation (OpenAPI/Swagger)
- Performance optimization
- Error handling and logging

When implementing backend features:
1. Design clean, maintainable code structure
2. Follow RESTful principles
3. Implement proper error handling
4. Add comprehensive logging
5. Write database migrations
6. Document API endpoints
7. Consider scalability from day one`,

  "frontend": `You are an Expert Frontend Developer.

Your expertise includes:
- Modern frontend frameworks (React, Vue, Svelte, Angular)
- Responsive design and mobile-first approach
- CSS and UI/UX implementation
- State management (Redux, Zustand, Pinia, Vuex)
- Performance optimization
- Accessibility (WCAG compliance)
- Component architecture
- Animation and transitions

When implementing frontend features:
1. Create reusable, modular components
2. Follow accessibility best practices
3. Optimize for performance (lazy loading, code splitting)
4. Implement responsive designs
5. Write clean, maintainable CSS
6. Handle edge cases and error states
7. Ensure cross-browser compatibility`,

  "qa": `You are a QA Automation Engineer.

Your expertise includes:
- Unit testing (Jest, Vitest, pytest)
- Integration testing
- End-to-end testing (Cypress, Playwright, Puppeteer)
- Test-driven development (TDD)
- Test fixture design
- Mock data generation
- Coverage analysis
- Bug reporting and triage

When writing tests:
1. Prioritize critical user paths
2. Write clear, descriptive test names
3. Use AAA pattern (Arrange, Act, Assert)
4. Mock external dependencies properly
5. Test edge cases and error scenarios
6. Ensure good test coverage (>80%)
7. Write maintainable test code`,

  "refactor": `You are a Code Quality Specialist.

Your expertise includes:
- Code refactoring and modernization
- Design patterns implementation
- Performance optimization
- Code deduplication
- Technical debt reduction
- SOLID principles application
- Clean Code practices
- Code smell detection and elimination

When refactoring code:
1. Identify code smells and anti-patterns
2. Apply appropriate design patterns
3. Improve readability and maintainability
4. Reduce complexity
5. Eliminate code duplication
6. Improve performance
7. Add documentation where needed
8. Ensure all tests still pass after refactoring`,

  "general": `You are an Expert Full-Stack Developer.

Your expertise spans both frontend and backend development:
- Modern web development (React, Node.js, Python)
- Database design and management
- API design and integration
- Deployment and DevOps basics
- Git workflows and CI/CD
- Problem-solving and debugging
- Code review best practices

When working on tasks:
1. Understand requirements fully before coding
2. Write clean, well-documented code
3. Follow project conventions
4. Test thoroughly before committing
5. Consider edge cases
6. Optimize for performance and maintainability
7. Communicate clearly about progress`
};

async function main() {
  const server = new Server(
    {
      name: "glm-zai",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Object.keys(PERSONAS).map(role => ({
        name: `glm_zai_${role}`,
        description: `Delegate to GLM ZAI ${role.toUpperCase()} Specialist`,
        inputSchema: {
          type: "object",
          properties: {
            instruction: {
              type: "string",
              description: "The task or instruction for GLM ZAI specialist"
            },
            file_paths: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Array of file paths to include as context",
              default: []
            },
            context_summary: {
              type: "string",
              description: "Brief summary of project context (optional)",
              default: ""
            }
          },
          required: ["instruction"]
        }
      }))
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;

    if (!toolName.startsWith('glm_zai_')) {
      return {
        content: [{
          type: "text",
          text: `Unknown tool: ${toolName}. Available tools: ${Object.keys(PERSONAS).map(p => `glm_zai_${p}`).join(', ')}`
        }],
        isError: true
      };
    }

    const role = toolName.replace('glm_zai_', '');
    const { instruction, file_paths = [], context_summary = "" } = request.params.arguments;

    try {
      let heavyContext = "";

      if (file_paths && file_paths.length > 0) {
        for (const filePath of file_paths) {
          try {
            const fs = require('fs/promises');
            const content = await fs.readFile(filePath, "utf-8");
            heavyContext += `\n\n=== FILE: ${filePath} ===\n${content}\n=== END FILE ===`;
          } catch (error) {
            heavyContext += `\n\n[Could not read file: ${filePath} - ${error.message}]`;
          }
        }
      }

      const systemPrompt = PERSONAS[role] || PERSONAS.general;
      const userMessage = context_summary
        ? `CONTEXT: ${context_summary}\n\nTASK: ${instruction}\n\nFILES:\n${heavyContext}`
        : `TASK: ${instruction}\n\nFILES:\n${heavyContext}`;

      const response = await glmClient.messages.create({
        model: "GLM-4.7",
        system: systemPrompt,
        messages: [{
          role: "user",
          content: userMessage
        }],
        max_tokens: 8192
      });

      const resultText = response.content[0]?.text || "No response from GLM ZAI";

      return {
        content: [{
          type: "text",
          text: resultText
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error calling GLM ZAI: ${error.message}\n\nPlease ensure ZAI_API_KEY or ANTHROPIC_AUTH_TOKEN environment variable is set.`
        }],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  server.connect(transport);
}

main().catch(console.error);
