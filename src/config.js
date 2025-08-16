export const DEFAULT_CONFIG = {
  // --- Core Behavior ---
  smartModeTokenThreshold: 200000,

  // --- File Filtering ---
  filesToIgnore: ['package-lock.json', '*.log', 'yarn.lock'],
  extensionsToIgnore: ['.sqlite3', '.db', '.DS_Store', '.env', '.pyc', '.class', '.o', '.so', '.dylib'],
  dirsToIgnore: ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.nuxt/', 'target/', 'bin/', 'obj/'],
  
  // --- Size & Performance Limits ---
  maxFileSize: '10MB',
  maxTotalSize: '100MB',
  maxDepth: 10,
  concurrency: 10,

  // --- Internal AI Instruction Configuration ---
  aiInstructions: {
    architectPersona: {
        role: "Project Manager and Solution Architect AI",
        goal: "Translate user requests into technical plans and then generate precise commands for a code-execution AI agent.",
        workflow: [
            "Analyze User Request in their native language.",
            "Formulate a high-level technical plan.",
            "Propose the plan and await user confirmation before generating commands.",
            "Generate a JSON command block for an execution agent upon approval.",
            "Communicate with the user in their language, but generate agent commands in ENGLISH."
        ]
    },
    executionAgents: {
        local_dev: {
            active: true,
            name: "Local Development Agent (AGENT_LOCAL_DEV)",
            description: "Development environment with full GUI support and development tools.",
            guiSupport: true
        },
        production_server: {
            active: true,
            name: "Production Server Agent (AGENT_PROD_SERVER)",
            description: "Headless production server without GUI capabilities.",
            guiSupport: false
        }
    },
    promptTemplates: {
        fileMode: `
# AI Instructions: Project Architect (File Mode)

## 1. Snapshot Overview
- **Project:** {{repoName}}
- **Mode:** Full Project Snapshot (Single File)
- **Generated:** {{timestamp}}
- **Files Included:** {{stats.includedFiles}} of {{stats.totalFiles}}

## 2. Your Role: {{architectPersona.role}}
- **Your Goal:** {{architectPersona.goal}}

## 3. Available Execution Agents
This section describes the agents you can command. Base your technical plan on their capabilities.
{{agentDefinitions}}
`,
        vectorMode: `
# AI Instructions: Project Architect (Vector Query Mode)

## 1. Snapshot Overview
- **Project:** {{repoName}}
- **Mode:** Context-Aware Snapshot (from Vector Search)
- **User Query:** "{{userQuery}}"
- **Generated:** {{timestamp}}

## 2. Your Role: {{architectPersona.role}}
- **Your Goal:** {{architectPersona.goal}}

## 3. Available Execution Agents
This section describes the agents you can command. The provided code context is tailored for your query.
{{agentDefinitions}}
`
    }
  }
};