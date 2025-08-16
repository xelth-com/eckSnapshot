export const DEFAULT_CONFIG = {
  filesToIgnore: ['package-lock.json', '*.log', 'yarn.lock'],
  extensionsToIgnore: ['.sqlite3', '.db', '.DS_Store', '.env', '.pyc', '.class', '.o', '.so', '.dylib'],
  dirsToIgnore: ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.nuxt/', 'target/', 'bin/', 'obj/'],
  maxFileSize: '10MB',
  maxTotalSize: '100MB',
  maxDepth: 10,
  concurrency: 10,
  
  // Enhanced agent configuration
  agents: {
    local_dev: {
      name: "Local Development Agent",
      agentId: "AGENT_LOCAL_DEV",
      description: "Development environment with full GUI support and development tools",
      hasGUI: true,
      capabilities: {
        canModifyFiles: ["src/*", "tests/*", "package.json", "config/*"],
        cannotModifyFiles: ["deployment/*", "server/production/*"],
        canExecute: ["npm run dev", "npm test", "git", "electron", "browser"],
        cannotExecute: ["systemctl", "pm2 deploy", "docker push production"]
      },
      detectionPatterns: {
        NODE_ENV: ["development", "dev"],
        DISPLAY: ["*"], // Has display
        USER: ["developer", "dev", "user", "*"],
        CI: ["false", undefined]
      }
    },
    production_server: {
      name: "Production Server Agent",
      agentId: "AGENT_PROD_SERVER",
      description: "Headless production server without GUI capabilities",
      hasGUI: false,
      capabilities: {
        canModifyFiles: ["config/production.js", "logs/*", ".env.production"],
        cannotModifyFiles: ["src/*", "tests/*", "package.json"],
        canExecute: ["pm2", "git pull", "./deploy-server.sh", "npm run start:server"],
        cannotExecute: ["npm run dev", "electron", "browser", "GUI applications"]
      },
      detectionPatterns: {
        NODE_ENV: ["production", "prod"],
        DISPLAY: [undefined, ""],
        USER: ["root", "ubuntu", "ec2-user", "deploy"],
        HOSTNAME: ["*-server", "*-prod", "*production*"]
      }
    },
    ci_cd: {
      name: "CI/CD Pipeline Agent",
      agentId: "AGENT_CI_CD",
      description: "Automated testing and deployment pipeline",
      hasGUI: false,
      capabilities: {
        canModifyFiles: ["build/*", "dist/*", "artifacts/*"],
        cannotModifyFiles: ["src/*", ".env*"],
        canExecute: ["npm ci", "npm run build", "npm test", "docker build"],
        cannotExecute: ["npm run dev", "interactive commands", "GUI tools"]
      },
      detectionPatterns: {
        CI: ["true"],
        GITHUB_ACTIONS: ["true"],
        JENKINS_URL: ["*"],
        GITLAB_CI: ["true"]
      }
    }
  },
  
  // Code boundary system
  codeBoundaries: {
    enabled: true,
    markers: {
      start: "/* AGENT_BOUNDARY:[AGENT_ID] START */",
      end: "/* AGENT_BOUNDARY:[AGENT_ID] END */",
      ownership: "/* OWNED_BY:[AGENT_ID] */"
    }
  },
  
  // Consilium configuration
  consilium: {
    enabled: true,
    triggerComplexityThreshold: 7,
    members: [
      { model: "Claude-3-Opus", role: "senior_architect", focus: "architecture and patterns" },
      { model: "GPT-4-Turbo", role: "performance_expert", focus: "optimization and efficiency" },
      { model: "Grok-2", role: "security_auditor", focus: "security and best practices" }
    ],
    consensusThreshold: 0.66, // 2 out of 3 must agree
    requireUnanimousForCritical: true
  }
};