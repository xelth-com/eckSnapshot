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
    environments: {
        local_dev: {
            name: "Local Development",
            description: "Local development environment with full GUI and development tools available",
            hasGUI: true,
            allowedCommands: [
                "npm install", "npm run dev", "npm run build", "npm test",
                "git commands", "file operations", "IDE/editor commands",
                "browser automation", "GUI applications", "electron apps"
            ],
            prohibitedCommands: [],
            detectionPatterns: {
                NODE_ENV: ["development", "dev"],
                USER: ["developer", "dev", "admin", "xelth"],
                checkDisplayVariable: true
            }
        },
        production_server: {
            name: "Production Server",
            description: "Headless production server environment without GUI capabilities",
            hasGUI: false,
            allowedCommands: [
                "npm install --production", "npm run start", "npm run build",
                "systemctl commands", "docker commands", "file operations",
                "database operations", "API testing", "log analysis"
            ],
            prohibitedCommands: [
                "GUI applications", "electron apps", "browser automation",
                "IDE/editor launching", "display-dependent commands",
                "npm run dev", "development servers with hot reload"
            ],
            detectionPatterns: {
                NODE_ENV: ["production", "prod"],
                USER: ["root", "app", "deploy", "ubuntu", "ec2-user"],
                HOSTNAME: ["*-server", "*-prod", "*production*"],
                checkDisplayVariable: false
            }
        },
        ci_cd: {
            name: "CI/CD Pipeline",
            description: "Continuous integration/deployment environment",
            hasGUI: false,
            allowedCommands: [
                "npm ci", "npm run build", "npm test", "npm run lint",
                "docker build", "docker push", "deployment scripts",
                "artifact generation", "static analysis tools"
            ],
            prohibitedCommands: [
                "interactive commands", "GUI applications", "development servers",
                "watch modes", "interactive prompts", "browser automation"
            ],
            detectionPatterns: {
                CI: ["true"],
                GITHUB_ACTIONS: ["true"],
                JENKINS_URL: ["*"],
                GITLAB_CI: ["true"],
                TRAVIS: ["true"],
                checkDisplayVariable: false
            }
        }
    }
};