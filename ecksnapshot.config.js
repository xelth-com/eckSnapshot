// .ecksnapshot.config.js

// Я заменил "module.exports =" на "export default"
export default {
    filesToIgnore: [
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml'
    ],
    extensionsToIgnore: [
        '.sqlite3',
        '.db',
        '.DS_Store',
        '.env',
        '.log',
        '.tmp',
        '.bak',
        '.swp',
        '.ico',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg'
    ],
    dirsToIgnore: [
        'node_modules/',
        '.git/',
        '.idea/',
        'snapshots/',
        'dist/',
        'build/',
        'coverage/'
    ],
    // Agent Environment Identification Protocol Configuration
    environments: {
        local_dev: {
            name: "Local Development Environment",
            description: "Local development machine with full GUI and development tools",
            capabilities: [
                "Full GUI access", "Browser automation", "IDE/editor launching",
                "Interactive development", "File system access", "Network access",
                "Package installation", "Git operations", "Testing frameworks"
            ],
            uniqueSignature: "AGENT_ENV_LOCAL_DEV",
            detectionPatterns: {
                USER: ["xelth", "developer", "dev", "admin"],
                NODE_ENV: ["development", "dev", ""],
                DISPLAY: ["*"],
                checkDisplayVariable: true,
                operatingSystem: ["Windows_NT", "Darwin", "Linux"]
            },
            allowedOperations: [
                "npm install", "npm run dev", "npm run build", "npm test",
                "git add", "git commit", "git push", "git pull",
                "code .", "vim", "nano", "electron apps",
                "browser automation", "interactive prompts"
            ],
            prohibitedOperations: [
                "systemctl", "service commands", "production deployments"
            ]
        },
        web_server: {
            name: "Web Server Environment", 
            description: "Headless web server without GUI capabilities",
            capabilities: [
                "Command line operations", "File system access", "Network access",
                "Package installation", "Process management", "Log analysis",
                "Database operations", "API operations"
            ],
            uniqueSignature: "AGENT_ENV_WEB_SERVER",
            detectionPatterns: {
                USER: ["root", "www-data", "nginx", "apache", "ubuntu", "ec2-user"],
                NODE_ENV: ["production", "prod", "staging"],
                checkDisplayVariable: false,
                CI: ["", null],
                SERVER_SOFTWARE: ["*"],
                operatingSystem: ["Linux"]
            },
            allowedOperations: [
                "npm install --production", "npm start", "npm run build",
                "systemctl", "service", "docker", "curl", "wget",
                "file operations", "log analysis", "database commands"
            ],
            prohibitedOperations: [
                "GUI applications", "browser automation", "interactive prompts",
                "IDE launching", "development servers", "npm run dev"
            ]
        }
    },

    // Code Ownership and Boundary Configuration
    codeOwnership: {
        boundaryMarkers: {
            start: "AGENT_BOUNDARY_START",
            end: "AGENT_BOUNDARY_END"
        },
        ownershipRules: {
            respectExisting: true,
            requireConfirmation: true,
            trackChanges: true
        }
    },

    // LLM Consilium Configuration
    consilium: {
        defaultMembers: {
            architect: {
                role: "System Architect",
                expertise: ["system design", "architecture patterns", "scalability", "performance"],
                preferredModel: "claude-3.5-sonnet"
            },
            security: {
                role: "Security Specialist", 
                expertise: ["security vulnerabilities", "authentication", "authorization", "data protection"],
                preferredModel: "gpt-4"
            },
            performance: {
                role: "Performance Engineer",
                expertise: ["optimization", "caching", "database performance", "monitoring"],
                preferredModel: "claude-3.5-sonnet"
            },
            ux: {
                role: "UX/UI Specialist",
                expertise: ["user experience", "interface design", "accessibility", "usability"],
                preferredModel: "gpt-4"
            }
        },
        responseFormat: {
            requireStructured: true,
            includeReasoning: true,
            requireConsensus: false,
            allowDissent: true
        },
        taskComplexityThresholds: {
            lowComplexity: ["bug fixes", "simple features", "documentation"],
            mediumComplexity: ["feature implementation", "refactoring", "integration"],
            highComplexity: ["architecture changes", "system redesign", "performance optimization", "security implementation"]
        }
    },

    // New section for adaptive AI instruction generation
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
            },
            ci_cd: {
                active: false,
                name: "CI/CD Pipeline Agent (AGENT_CI_CD)",
                description: "Automated testing and deployment pipeline.",
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