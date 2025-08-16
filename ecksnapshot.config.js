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
    }
};