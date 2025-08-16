#!/usr/bin/env node

import { Command } from 'commander';
import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import isBinaryPath from 'is-binary-path';
import { fileURLToPath } from 'url';
import ignore from 'ignore';
import { SingleBar, Presets } from 'cli-progress';
import pLimit from 'p-limit';
import zlib from 'zlib';
import { promisify } from 'util';
import inquirer from 'inquirer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const DEFAULT_CONFIG = {
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

/**
 * Generates enhanced AI instructions header with agent boundaries and consilium support
 */
function generateEnhancedAIHeader(stats, repoName, includeAiInstructions = true, config = null) {
  const timestamp = new Date().toISOString();
  
  if (!includeAiInstructions) {
    return `# Repository Snapshot\n\n**Repository:** ${repoName}\n**Generated:** ${timestamp}\n**Tool:** eck-snapshot\n**Files Included:** ${stats.includedFiles} of ${stats.totalFiles}\n\n---\n\n`;
  }

  const agents = config?.agents || DEFAULT_CONFIG.agents;
  const consilium = config?.consilium || DEFAULT_CONFIG.consilium;
  
  return `# AI Agent Instructions - Multi-Agent System

## 1. Repository Snapshot Overview

This is a comprehensive snapshot of **${repoName}** generated on **${timestamp}**.
- **Files Included:** ${stats.includedFiles} of ${stats.totalFiles}
- **Multi-Agent System:** ENABLED
- **Consilium Support:** ${consilium?.enabled ? 'ACTIVE' : 'INACTIVE'}

---

## 2. CRITICAL: Agent Self-Identification Protocol

**⚠️ MANDATORY: Execute these commands IMMEDIATELY before any action:**

\`\`\`bash
# STEP 1: Identify yourself
echo "=== AGENT IDENTIFICATION ==="
whoami
echo "NODE_ENV=$NODE_ENV"
echo "USER=$USER"
echo "HOSTNAME=$HOSTNAME"
echo "CI=$CI"
echo "GITHUB_ACTIONS=$GITHUB_ACTIONS"
echo "DISPLAY=$DISPLAY"
pwd

# STEP 2: Verify capabilities
echo "=== CAPABILITY CHECK ==="
which npm && echo "✓ npm available" || echo "✗ npm not available"
which pm2 && echo "✓ pm2 available" || echo "✗ pm2 not available"
which git && echo "✓ git available" || echo "✗ git not available"
[ -n "$DISPLAY" ] && echo "✓ GUI available" || echo "✗ No GUI (headless)"

# STEP 3: Test environment constraints
echo "=== ENVIRONMENT TEST ==="
if [ -n "$DISPLAY" ]; then
  echo "Environment: Development (GUI available)"
  echo "Can run: npm run dev, electron apps"
else
  echo "Environment: Server/CI (headless)"
  echo "CANNOT run: GUI apps, npm run dev, electron"
  echo "MUST use: server-specific commands only"
fi
\`\`\`

## 3. Agent Role Definitions

${Object.entries(agents).map(([key, agent]) => `
### ${agent.name} (${agent.agentId})
**Description:** ${agent.description}
**GUI Support:** ${agent.hasGUI ? '✓ Yes' : '✗ No (HEADLESS)'}

**File Permissions:**
- ✓ Can modify: ${agent.capabilities.canModifyFiles.join(', ')}
- ✗ Cannot modify: ${agent.capabilities.cannotModifyFiles.join(', ')}

**Command Permissions:**
- ✓ Can execute: ${agent.capabilities.canExecute.join(', ')}
- ✗ MUST NOT execute: ${agent.capabilities.cannotExecute.join(', ')}

**Detection Patterns:**
${JSON.stringify(agent.detectionPatterns, null, 2)}
`).join('\n')}

## 4. Code Boundary Rules

**CRITICAL: Respect agent boundaries in code!**

### Checking Boundaries
Before modifying ANY file, check for ownership markers:
\`\`\`javascript
/* AGENT_BOUNDARY:[OTHER_AGENT_ID] START */
// DO NOT MODIFY - This belongs to another agent
/* AGENT_BOUNDARY:[OTHER_AGENT_ID] END */
\`\`\`

### Marking Your Territory
When adding new code, ALWAYS mark it:
\`\`\`javascript
/* AGENT_BOUNDARY:[YOUR_AGENT_ID] START */
// Your code here
/* AGENT_BOUNDARY:[YOUR_AGENT_ID] END */
\`\`\`

### Conflict Resolution
If you encounter another agent's code:
1. **STOP** - Do not modify
2. **DOCUMENT** - Note what needs coordination
3. **COMMUNICATE** - Request consilium if needed

## 5. Consilium Protocol - Collaborative Decision Making

### When to Trigger Consilium
Complexity assessment (1-10 scale):
- **1-3:** Simple changes - proceed independently
- **4-6:** Moderate complexity - consider consultation
- **7-10:** High complexity - CONSILIUM REQUIRED

### Triggering Consilium
\`\`\`json
{
  "trigger_consilium": true,
  "complexity_score": 8,
  "reason": "Major architectural change affecting multiple systems",
  "type": "architecture_decision",
  "requires_unanimous": false
}
\`\`\`

### Consilium Request Format
\`\`\`json
{
  "consilium_request": {
    "request_id": "cons-${Date.now()}",
    "requesting_agent": "[YOUR_AGENT_ID]",
    "task": {
      "type": "technical_decision",
      "description": "Detailed problem description",
      "current_state": "Current implementation details",
      "proposed_changes": "What you want to change",
      "impact_analysis": {
        "affected_components": [],
        "risk_level": "low|medium|high",
        "rollback_plan": "How to revert if needed"
      }
    },
    "questions_for_consilium": [
      "Specific question 1",
      "Specific question 2"
    ],
    "decision_criteria": {
      "performance": "weight: 0.3",
      "maintainability": "weight: 0.3",
      "security": "weight: 0.4"
    }
  }
}
\`\`\`

## 6. Operational Workflow

### For Development Agent (GUI Environment)
1. Verify GUI availability (DISPLAY variable present)
2. Can run full development stack: \`npm run dev\`
3. Can modify source code and tests
4. Can use browser automation and Electron apps

### For Production Server Agent (Headless)
1. Verify headless environment (no DISPLAY)
2. **NEVER** run GUI commands like \`npm run dev\`
3. Use server-specific commands: \`npm run start:server\`, \`pm2\`
4. Focus on deployment and monitoring tasks
5. Execute deployment scripts: \`./deploy-server.sh\`

### For CI/CD Agent
1. Build and test only
2. No interactive commands
3. Generate artifacts
4. Run automated tests

## 7. Error Prevention Checklist

Before executing ANY command:
- [ ] Have I identified my agent role?
- [ ] Am I in the correct environment?
- [ ] Will this command work in my environment (GUI vs headless)?
- [ ] Am I respecting code boundaries?
- [ ] Do I need consilium approval (complexity > 7)?
- [ ] Have I checked for ownership markers?

## 8. Communication Protocol

### Agent-to-Agent
- Use code boundary markers
- Document handoff points
- Request consilium for conflicts

### Agent-to-Orchestrator
- Report environment constraints
- Flag boundary violations
- Request consilium when needed

### Response Format
\`\`\`json
{
  "agent_response": {
    "agent_id": "[YOUR_AGENT_ID]",
    "environment_detected": "development|production|ci",
    "action_taken": "description",
    "boundaries_respected": true,
    "consilium_needed": false,
    "confidence": 95
  }
}
\`\`\`

---

**Remember:** 
- Development agents CAN run GUI apps
- Server agents CANNOT run GUI apps (headless)
- Always check your environment before acting
- Respect code boundaries
- Use consilium for complex decisions

`;
}

/**
 * Generate a consilium request for complex decisions
 */
async function generateConsiliumRequest(task, complexity, agentId) {
  const request = {
    consilium_request: {
      request_id: `cons-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      requesting_agent: agentId,
      complexity_score: complexity,
      
      task: {
        type: task.type || "technical_decision",
        title: task.title,
        description: task.description,
        current_implementation: task.currentCode || "N/A",
        proposed_solution: task.proposedSolution || "To be determined",
        constraints: task.constraints || [],
        success_criteria: task.criteria || []
      },
      
      consilium_instructions: `
        You are a technical expert participating in a consilium decision.
        
        RESPOND WITH:
        1. Your expert opinion on the best approach
        2. Specific technical recommendations
        3. Potential risks and mitigation strategies
        4. Your confidence level (0-100%)
        
        FORMAT YOUR RESPONSE AS JSON:
        {
          "expert": "[Your Model Name]",
          "role": "[Your assigned role]",
          "recommendation": {
            "approach": "Detailed technical solution",
            "implementation_steps": ["step1", "step2"],
            "key_benefits": ["benefit1", "benefit2"],
            "risks": ["risk1", "risk2"],
            "mitigation": ["strategy1", "strategy2"]
          },
          "alternatives_considered": ["alt1", "alt2"],
          "confidence": 85,
          "critical_warnings": []
        }
      `,
      
      aggregation_rules: {
        minimum_confidence_required: 60,
        consensus_threshold: 0.66,
        veto_roles: ["security_auditor"],
        conflict_resolution: "weighted_average_with_discussion"
      }
    }
  };
  
  return request;
}

/**
 * Process consilium responses and generate final decision
 */
async function processConsiliumResponses(responses, originalRequest) {
  const analysis = {
    consilium_id: originalRequest.request_id,
    timestamp: new Date().toISOString(),
    participants: responses.length,
    
    consensus_analysis: {
      agreement_level: 0,
      common_recommendations: [],
      divergent_opinions: [],
      critical_concerns: []
    },
    
    final_decision: {
      recommended_approach: "",
      implementation_plan: [],
      risk_mitigation: [],
      confidence_score: 0
    },
    
    execution_command: null
  };
  
  // Calculate consensus
  const recommendations = responses.map(r => r.recommendation.approach);
  const confidences = responses.map(r => r.confidence);
  
  // Find common patterns
  const commonElements = findCommonElements(recommendations);
  analysis.consensus_analysis.common_recommendations = commonElements;
  
  // Calculate average confidence
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  analysis.final_decision.confidence_score = Math.round(avgConfidence);
  
  // Check for vetos
  const vetoRoles = ["security_auditor"];
  const hasVeto = responses.some(r => 
    vetoRoles.includes(r.role) && r.critical_warnings.length > 0
  );
  
  if (hasVeto) {
    analysis.final_decision.recommended_approach = "BLOCKED - Security concerns must be addressed";
    analysis.consensus_analysis.critical_concerns = responses
      .filter(r => r.critical_warnings.length > 0)
      .flatMap(r => r.critical_warnings);
  } else {
    // Synthesize final approach
    analysis.final_decision.recommended_approach = synthesizeApproaches(responses);
    analysis.final_decision.implementation_plan = mergeImplementationSteps(responses);
    analysis.final_decision.risk_mitigation = mergeRiskStrategies(responses);
  }
  
  // Generate execution command if consensus reached
  if (avgConfidence >= 60 && !hasVeto) {
    analysis.execution_command = {
      command_for_agent: "implement_consilium_decision",
      consilium_reference: originalRequest.request_id,
      approved_approach: analysis.final_decision.recommended_approach,
      implementation_steps: analysis.final_decision.implementation_plan,
      monitoring_requirements: analysis.final_decision.risk_mitigation
    };
  }
  
  return analysis;
}

// Helper functions for consilium
function findCommonElements(arrays) {
  if (arrays.length === 0) return [];
  return arrays[0].filter(item => 
    arrays.every(arr => arr.includes(item))
  );
}

function synthesizeApproaches(responses) {
  // Get the most common approach elements
  const approaches = responses.map(r => r.recommendation.approach);
  // Simple synthesis - in production, use more sophisticated NLP
  return approaches[0]; // Placeholder - implement proper synthesis
}

function mergeImplementationSteps(responses) {
  const allSteps = responses.flatMap(r => r.recommendation.implementation_steps);
  return [...new Set(allSteps)]; // Remove duplicates
}

function mergeRiskStrategies(responses) {
  const allStrategies = responses.flatMap(r => r.recommendation.mitigation);
  return [...new Set(allStrategies)];
}

/**
 * Check code boundaries in a file
 */
async function checkCodeBoundaries(filePath, agentId) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const boundaryRegex = /\/\* AGENT_BOUNDARY:\[([^\]]+)\] START \*\/([\s\S]*?)\/\* AGENT_BOUNDARY:\[[^\]]+\] END \*\//g;
    
    const boundaries = [];
    let match;
    
    while ((match = boundaryRegex.exec(content)) !== null) {
      boundaries.push({
        owner: match[1],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        content: match[2]
      });
    }
    
    return {
      file: filePath,
      hasBoundaries: boundaries.length > 0,
      boundaries: boundaries,
      canModify: boundaries.every(b => b.owner === agentId || b.owner === 'SHARED')
    };
  } catch (error) {
    return {
      file: filePath,
      error: error.message,
      canModify: true // If can't read, assume can modify (new file)
    };
  }
}

/**
 * Add boundary markers to code
 */
function addBoundaryMarkers(code, agentId) {
  const marker = DEFAULT_CONFIG.codeBoundaries.markers;
  const startMarker = marker.start.replace('[AGENT_ID]', agentId);
  const endMarker = marker.end.replace('[AGENT_ID]', agentId);
  
  return `${startMarker}\n${code}\n${endMarker}`;
}

// Original helper functions (keep all existing ones)
function parseSize(sizeStr) {
  const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) throw new Error(`Invalid size format: ${sizeStr}`);
  const [, size, unit = 'B'] = match;
  return Math.floor(parseFloat(size) * units[unit.toUpperCase()]);
}

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function matchesPattern(filePath, patterns) {
  const fileName = path.basename(filePath);
  return patterns.some(pattern => {
    const regexPattern = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
    try {
      const regex = new RegExp(regexPattern);
      return regex.test(fileName);
    } catch (e) {
      console.warn(`⚠️ Invalid regex pattern in config: "${pattern}"`);
      return false;
    }
  });
}

async function loadConfig(configPath) {
  let config = { ...DEFAULT_CONFIG };
  
  if (configPath) {
    try {
      const configModule = await import(path.resolve(configPath));
      config = { ...config, ...configModule.default };
      console.log(`✅ Configuration loaded from: ${configPath}`);
    } catch (error) {
      console.warn(`⚠️ Warning: Could not load config file: ${configPath}`);
    }
  } else {
    const possibleConfigs = [
      '.ecksnapshot.config.js',
      '.ecksnapshot.config.mjs',
      'ecksnapshot.config.js'
    ];
    
    for (const configFile of possibleConfigs) {
      try {
        await fs.access(configFile);
        const configModule = await import(path.resolve(configFile));
        config = { ...config, ...configModule.default };
        console.log(`✅ Configuration loaded from: ${configFile}`);
        break;
      } catch {
        // Config file doesn't exist, continue
      }
    }
  }
  
  return config;
}

async function checkGitAvailability() {
  try {
    await execa('git', ['--version']);
  } catch (error) {
    throw new Error('Git is not installed or not available in PATH');
  }
}

async function checkGitRepository(repoPath) {
  try {
    await execa('git', ['rev-parse', '--git-dir'], { cwd: repoPath });
    return true;
  } catch (error) {
    return false;
  }
}

async function scanDirectoryRecursively(dirPath, config, relativeTo = dirPath) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');
      
      if (config.dirsToIgnore.some(dir => 
        entry.name === dir.replace('/', '') || 
        relativePath.startsWith(dir)
      )) {
        continue;
      }
      
      if (!config.includeHidden && entry.name.startsWith('.')) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const subFiles = await scanDirectoryRecursively(fullPath, config, relativeTo);
        files.push(...subFiles);
      } else {
        if (config.extensionsToIgnore.includes(path.extname(entry.name)) ||
            matchesPattern(relativePath, config.filesToIgnore)) {
          continue;
        }
        
        files.push(relativePath);
      }
    }
  } catch (error) {
    console.warn(`⚠️ Warning: Could not read directory: ${dirPath} - ${error.message}`);
  }
  
  return files;
}

async function loadGitignore(repoPath) {
  try {
    const gitignoreContent = await fs.readFile(path.join(repoPath, '.gitignore'), 'utf-8');
    const ig = ignore().add(gitignoreContent);
    console.log('✅ .gitignore patterns loaded');
    return ig;
  } catch {
    console.log('ℹ️ No .gitignore file found or could not be read');
    return ignore();
  }
}

async function readFileWithSizeCheck(filePath, maxFileSize) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > maxFileSize) {
      throw new Error(`File too large: ${formatSize(stats.size)}`);
    }
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.message.includes('too large')) throw error;
    throw new Error(`Could not read file: ${error.message}`);
  }
}

async function generateDirectoryTree(dir, prefix = '', allFiles, depth = 0, maxDepth = 10, config) {
  if (depth > maxDepth) return '';
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const sortedEntries = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    let tree = '';
    const validEntries = [];
    
    for (const entry of sortedEntries) {
      if (config.dirsToIgnore.some(d => entry.name.includes(d.replace('/', '')))) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
      if (entry.isDirectory() || allFiles.includes(relativePath)) {
        validEntries.push({ entry, fullPath, relativePath });
      }
    }
    
    for (let i = 0; i < validEntries.length; i++) {
      const { entry, fullPath, relativePath } = validEntries[i];
      const isLast = i === validEntries.length - 1;
      
      const connector = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      
      if (entry.isDirectory()) {
        tree += `${prefix}${connector}${entry.name}/\n`;
        tree += await generateDirectoryTree(fullPath, nextPrefix, allFiles, depth + 1, maxDepth, config);
      } else {
        tree += `${prefix}${connector}${entry.name}\n`;
      }
    }
    
    return tree;
  } catch (error) {
    console.warn(`⚠️ Warning: Could not read directory: ${dir}`);
    return '';
  }
}

async function processFile(filePath, config, gitignore, stats) {
  const fileName = path.basename(filePath);
  const fileExt = path.extname(filePath) || 'no-extension';
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  let skipReason = null;
  
  if (config.dirsToIgnore.some(dir => normalizedPath.startsWith(dir))) {
    skipReason = 'ignored-directory';
  } else if (config.extensionsToIgnore.includes(path.extname(filePath))) {
    skipReason = 'ignored-extension';
  } else if (matchesPattern(filePath, config.filesToIgnore)) {
    skipReason = 'ignored-pattern';
  } else if (gitignore.ignores(normalizedPath)) {
    skipReason = 'gitignore';
  } else if (isBinaryPath(filePath)) {
    skipReason = 'binary-file';
  } else if (!config.includeHidden && fileName.startsWith('.')) {
    skipReason = 'hidden-file';
  }

  if (skipReason) {
    stats.skippedFiles++;
    stats.skippedFileTypes.set(fileExt, (stats.skippedFileTypes.get(fileExt) || 0) + 1);
    stats.skipReasons.set(skipReason, (stats.skipReasons.get(skipReason) || 0) + 1);
    
    if (!stats.skippedFilesDetails.has(skipReason)) {
      stats.skippedFilesDetails.set(skipReason, []);
    }
    stats.skippedFilesDetails.get(skipReason).push({ file: filePath, ext: fileExt });
    
    if (skipReason === 'binary-file') stats.binaryFiles++;
    return { skipped: true, reason: skipReason };
  }

  try {
    const content = await readFileWithSizeCheck(filePath, parseSize(config.maxFileSize));
    const fileContent = `--- File: /${normalizedPath} ---\n\n${content}\n\n`;
    
    stats.includedFiles++;
    stats.includedFileTypes.set(fileExt, (stats.includedFileTypes.get(fileExt) || 0) + 1);
    return { content: fileContent, size: fileContent.length };
  } catch (error) {
    const errorReason = error.message.includes('too large') ?
      'file-too-large' : 'read-error';
    
    stats.errors.push({ file: filePath, error: error.message });
    stats.skippedFiles++;
    stats.skippedFileTypes.set(fileExt, (stats.skippedFileTypes.get(fileExt) || 0) + 1);
    stats.skipReasons.set(errorReason, (stats.skipReasons.get(errorReason) || 0) + 1);
    
    if (!stats.skippedFilesDetails.has(errorReason)) {
      stats.skippedFilesDetails.set(errorReason, []);
    }
    stats.skippedFilesDetails.get(errorReason).push({ file: filePath, ext: fileExt });
    
    if (error.message.includes('too large')) {
      stats.largeFiles++;
    }
    
    return { skipped: true, reason: error.message };
  }
}

// Main snapshot creation function
async function createRepoSnapshot(repoPath, options) {
  const absoluteRepoPath = path.resolve(repoPath);
  const absoluteOutputPath = path.resolve(options.output);
  const originalCwd = process.cwd();

  console.log(`🚀 Starting snapshot for ${options.dir ? 'directory' : 'repository'}: ${absoluteRepoPath}`);
  console.log(`📁 Snapshots will be saved to: ${absoluteOutputPath}`);

  try {
    const config = await loadConfig(options.config);
    config.maxFileSize = options.maxFileSize || config.maxFileSize;
    config.maxTotalSize = options.maxTotalSize || config.maxTotalSize;
    config.maxDepth = options.maxDepth || config.maxDepth;
    config.includeHidden = options.includeHidden || false;
    
    let allFiles = [];
    let gitignore = null;
    let isGitRepo = false;
    
    if (!options.dir) {
      await checkGitAvailability();
      isGitRepo = await checkGitRepository(absoluteRepoPath);
      
      if (!isGitRepo) {
        console.log('ℹ️ Not a git repository, switching to directory mode');
        options.dir = true;
      }
    }
    
    process.chdir(absoluteRepoPath);
    console.log('✅ Successfully changed working directory');

    if (options.dir) {
      console.log('📋 Scanning directory recursively...');
      allFiles = await scanDirectoryRecursively(absoluteRepoPath, config);
      gitignore = ignore();
      console.log(`📊 Found ${allFiles.length} total files in the directory`);
    } else {
      gitignore = await loadGitignore(absoluteRepoPath);
      console.log('📋 Fetching file list from Git...');
      const { stdout } = await execa('git', ['ls-files']);
      allFiles = stdout.split('\n').filter(Boolean);
      console.log(`📊 Found ${allFiles.length} total files in the repository`);
    }

    const stats = {
      totalFiles: allFiles.length,
      includedFiles: 0,
      skippedFiles: 0,
      binaryFiles: 0,
      largeFiles: 0,
      errors: [],
      includedFileTypes: new Map(),
      skippedFileTypes: new Map(),
      skipReasons: new Map(),
      skippedFilesDetails: new Map()
    };
    
    let snapshotContent = '';

    if (options.tree) {
      console.log('🌳 Generating directory tree...');
      const tree = await generateDirectoryTree(absoluteRepoPath, '', allFiles, 0, config.maxDepth, config);
      snapshotContent += 'Directory Structure:\n\n';
      snapshotContent += tree;
      snapshotContent += '\n\n';
    }

    console.log('📁 Processing files...');
    const limit = pLimit(config.concurrency);
    
    const progressBar = options.verbose ?
      null : new SingleBar({
        format: 'Progress |{bar}| {percentage}% | {value}/{total} files | ETA: {eta}s',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      }, Presets.shades_classic);
    
    if (progressBar) progressBar.start(allFiles.length, 0);

    let processedCount = 0;
    const filePromises = allFiles.map((filePath) => 
      limit(async () => {
        const result = await processFile(filePath, config, gitignore, stats);
        
        processedCount++;
        if (progressBar) {
          progressBar.update(processedCount);
        } else if (options.verbose) {
          if (result.skipped) {
            console.log(`⏭️ Skipping: ${filePath} (${result.reason})`);
          } else {
            console.log(`✅ Processed: ${filePath}`);
          }
        }
        
        return result;
      })
    );
    
    const results = await Promise.allSettled(filePromises);
    if (progressBar) progressBar.stop();

    const contentArray = [];
    let totalSize = 0;
    const maxTotalSize = parseSize(config.maxTotalSize);
    
    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn(`⚠️ Promise rejected: ${result.reason}`);
        continue;
      }
      if (result.value && result.value.content) {
        if (totalSize + result.value.size > maxTotalSize) {
          console.warn(`⚠️ Warning: Approaching size limit. Some files may be excluded.`);
          break;
        }
        contentArray.push(result.value.content);
        totalSize += result.value.size;
      }
    }
    
    const repoName = path.basename(absoluteRepoPath);
    
    // Use enhanced header with agent support
    const header = options.enhanced ? 
      generateEnhancedAIHeader(stats, repoName, options.aiHeader !== false, config) :
      generateEnhancedAIHeader(stats, repoName, options.aiHeader !== false, config); // Always use enhanced for now
    
    snapshotContent = header + snapshotContent + contentArray.join('');

    const totalChars = snapshotContent.length;
    const estimatedTokens = Math.round(totalChars / 4);

    const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const extension = options.format === 'json' ? 'json' : 'md';
    let outputFilename = `${repoName}_snapshot_${timestamp}.${extension}`;
    
    if (options.compress) {
      outputFilename += '.gz';
    }

    const fullOutputFilePath = path.join(absoluteOutputPath, outputFilename);
    let finalContent = snapshotContent;
    
    if (options.format === 'json') {
      const jsonData = {
        repository: repoName,
        timestamp: new Date().toISOString(),
        multiAgentSupport: true,
        stats: {
          ...stats,
          includedFileTypes: Object.fromEntries(stats.includedFileTypes),
          skippedFileTypes: Object.fromEntries(stats.skippedFileTypes),
          skipReasons: Object.fromEntries(stats.skipReasons),
          skippedFilesDetails: Object.fromEntries(
            Array.from(stats.skippedFilesDetails.entries()).map(([reason, files]) => [
              reason, 
              files.map(({file, ext}) => ({file, ext}))
            ])
          )
        },
        content: snapshotContent
      };
      finalContent = JSON.stringify(jsonData, null, 2);
    }

    await fs.mkdir(absoluteOutputPath, { recursive: true });
    
    if (options.compress) {
      const compressed = await gzip(finalContent);
      await fs.writeFile(fullOutputFilePath, compressed);
    } else {
      await fs.writeFile(fullOutputFilePath, finalContent);
    }

    console.log('\n📊 Snapshot Summary');
    console.log('='.repeat(50));
    console.log(`🎉 Snapshot created successfully!`);
    console.log(`📄 File saved to: ${fullOutputFilePath}`);
    console.log(`📈 Included text files: ${stats.includedFiles} of ${stats.totalFiles}`);
    console.log(`⏭️ Skipped files: ${stats.skippedFiles}`);
    console.log(`📢 Binary files skipped: ${stats.binaryFiles}`);
    console.log(`📏 Large files skipped: ${stats.largeFiles}`);
    if (options.tree) console.log('🌳 Directory tree included');
    if (options.compress) console.log('🗜️ File compressed with gzip');
    console.log(`📊 Total characters: ${totalChars.toLocaleString('en-US')}`);
    console.log(`🎯 Estimated tokens: ~${estimatedTokens.toLocaleString('en-US')}`);
    console.log(`💾 File size: ${formatSize(totalChars)}`);
    console.log(`🤖 Multi-Agent Support: ENABLED`);
    console.log(`🧠 Consilium Protocol: READY`);
    
    if (stats.includedFileTypes.size > 0) {
      console.log('\n📋 Included File Types Distribution:');
      const sortedIncludedTypes = Array.from(stats.includedFileTypes.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
      for (const [ext, count] of sortedIncludedTypes) {
        console.log(`  ${ext}: ${count} files`);
      }
    }

    if (stats.errors.length > 0) {
      console.log('\n⚠️ Errors encountered:');
      stats.errors.slice(0, 5).forEach(({ file, error }) => {
        console.log(`  ${file}: ${error}`);
      });
      if (stats.errors.length > 5) {
        console.log(`  ... and ${stats.errors.length - 5} more errors`);
      }
    }
    
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('\n❌ An error occurred:');
    if (error.code === 'ENOENT' && error.path && error.path.includes('.git')) {
      console.error(`Error: The path "${absoluteRepoPath}" does not seem to be a Git repository.`);
    } else if (error.message.includes('Git is not installed')) {
      console.error('Error: Git is not installed or not available in PATH.');
      console.error('Please install Git and ensure it\'s available in your system PATH.');
    } else {
      console.error(error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  } finally {
    process.chdir(originalCwd);
  }
}

// Restore function
async function restoreSnapshot(snapshotFile, targetDir, options) {
  const absoluteSnapshotPath = path.resolve(snapshotFile);
  const absoluteTargetDir = path.resolve(targetDir);
  
  console.log(`📄 Starting restore from snapshot: ${absoluteSnapshotPath}`);
  console.log(`📁 Target directory: ${absoluteTargetDir}`);

  try {
    let rawContent;
    
    if (snapshotFile.endsWith('.gz')) {
      const compressedBuffer = await fs.readFile(absoluteSnapshotPath);
      rawContent = (await gunzip(compressedBuffer)).toString('utf-8');
      console.log('✅ Decompressed gzipped snapshot');
    } else {
      rawContent = await fs.readFile(absoluteSnapshotPath, 'utf-8');
    }

    let filesToRestore;
    
    try {
      const jsonData = JSON.parse(rawContent);
      if (jsonData.content) {
        console.log('📄 Detected JSON format, extracting content');
        filesToRestore = parseSnapshotContent(jsonData.content);
      } else {
        throw new Error('JSON format detected, but no "content" key found');
      }
    } catch (e) {
      console.log('📄 Treating snapshot as plain text format');
      filesToRestore = parseSnapshotContent(rawContent);
    }
    
    if (filesToRestore.length === 0) {
      console.warn('⚠️ No files found to restore in the snapshot');
      return;
    }

    if (options.include || options.exclude) {
      filesToRestore = filterFilesToRestore(filesToRestore, options);
      if (filesToRestore.length === 0) {
        console.warn('⚠️ No files remaining after applying filters');
        return;
      }
    }

    const invalidFiles = validateFilePaths(filesToRestore, absoluteTargetDir);
    if (invalidFiles.length > 0) {
      console.error('❌ Invalid file paths detected (potential directory traversal):');
      invalidFiles.forEach(file => console.error(`  ${file}`));
      process.exit(1);
    }

    console.log(`📊 Found ${filesToRestore.length} files to restore`);
    
    if (options.dryRun) {
      console.log('\n🔍 Dry run mode - files that would be restored:');
      filesToRestore.forEach(file => {
        const fullPath = path.join(absoluteTargetDir, file.path);
        console.log(`  ${fullPath}`);
      });
      return;
    }

    if (!options.force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `You are about to write ${filesToRestore.length} files to ${absoluteTargetDir}. Existing files will be overwritten. Continue?`,
        default: false
      }]);
      
      if (!confirm) {
        console.log('🚫 Restore operation cancelled by user');
        return;
      }
    }

    await fs.mkdir(absoluteTargetDir, { recursive: true });
    
    const stats = {
      totalFiles: filesToRestore.length,
      restoredFiles: 0,
      failedFiles: 0,
      errors: []
    };
    
    const progressBar = options.verbose ? null : new SingleBar({
      format: 'Restoring |{bar}| {percentage}% | {value}/{total} files',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    }, Presets.shades_classic);
    
    if (progressBar) progressBar.start(filesToRestore.length, 0);

    const limit = pLimit(options.concurrency || 10);
    const filePromises = filesToRestore.map((file, index) => 
      limit(async () => {
        try {
          const fullPath = path.join(absoluteTargetDir, file.path);
          const dir = path.dirname(fullPath);

          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(fullPath, file.content, 'utf-8');
          
          stats.restoredFiles++;
          
          if (progressBar) {
            progressBar.update(index + 1);
          } else if (options.verbose) {
            console.log(`✅ Restored: ${file.path}`);
          }
          
          return { success: true, file: file.path };
        } catch (error) {
          stats.failedFiles++;
          stats.errors.push({ file: file.path, error: error.message });
          
          if (options.verbose) {
            console.log(`❌ Failed to restore: ${file.path} - ${error.message}`);
          }
          
          return { success: false, file: file.path, error: error.message };
        }
      })
    );

    await Promise.allSettled(filePromises);
    if (progressBar) progressBar.stop();

    console.log('\n📊 Restore Summary');
    console.log('='.repeat(50));
    console.log(`🎉 Restore completed!`);
    console.log(`✅ Successfully restored: ${stats.restoredFiles} files`);
    
    if (stats.failedFiles > 0) {
      console.log(`❌ Failed to restore: ${stats.failedFiles} files`);
      if (stats.errors.length > 0) {
        console.log('\n⚠️ Errors encountered:');
        stats.errors.slice(0, 5).forEach(({ file, error }) => {
          console.log(`  ${file}: ${error}`);
        });
        if (stats.errors.length > 5) {
          console.log(`  ... and ${stats.errors.length - 5} more errors`);
        }
      }
    }
    
    console.log(`📁 Target directory: ${absoluteTargetDir}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('\n❌ An error occurred during restore:');
    console.error(error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function parseSnapshotContent(content) {
  const files = [];
  const fileRegex = /--- File: \/(.+) ---/g;
  const sections = content.split(fileRegex);
  
  for (let i = 1; i < sections.length; i += 2) {
    const filePath = sections[i].trim();
    let fileContent = sections[i + 1] || '';

    if (fileContent.startsWith('\n\n')) {
      fileContent = fileContent.substring(2);
    }
    if (fileContent.endsWith('\n\n')) {
      fileContent = fileContent.substring(0, fileContent.length - 2);
    }
    
    files.push({ path: filePath, content: fileContent });
  }

  return files;
}

function filterFilesToRestore(files, options) {
  let filtered = files;
  
  if (options.include) {
    const includePatterns = Array.isArray(options.include) ?
      options.include : [options.include];
    filtered = filtered.filter(file => 
      includePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file.path);
      })
    );
  }
  
  if (options.exclude) {
    const excludePatterns = Array.isArray(options.exclude) ? 
      options.exclude : [options.exclude];
    filtered = filtered.filter(file => 
      !excludePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file.path);
      })
    );
  }
  
  return filtered;
}

function validateFilePaths(files, targetDir) {
  const invalidFiles = [];
  
  for (const file of files) {
    const normalizedPath = path.normalize(file.path);
    if (normalizedPath.includes('..') || 
        normalizedPath.startsWith('/') || 
        normalizedPath.includes('\0') ||
        /[<>:"|?*]/.test(normalizedPath)) {
      invalidFiles.push(file.path);
    }
  }
  
  return invalidFiles;
}

// New command for generating consilium requests
async function generateConsilium(options) {
  console.log('🧠 Generating Consilium Request...');
  
  const task = {
    type: options.type || 'technical_decision',
    title: options.title || 'Technical Decision Required',
    description: options.description || 'Please provide a description',
    constraints: options.constraints ? options.constraints.split(',') : [],
    currentCode: options.snapshot || null
  };
  
  const complexity = options.complexity || 7;
  const agentId = options.agent || 'AGENT_ORCHESTRATOR';
  
  const request = await generateConsiliumRequest(task, complexity, agentId);
  
  const outputFile = options.output || 'consilium_request.json';
  await fs.writeFile(outputFile, JSON.stringify(request, null, 2));
  
  console.log(`✅ Consilium request saved to: ${outputFile}`);
  console.log('\n📋 Next steps:');
  console.log('1. Send this request to multiple LLM experts');
  console.log('2. Collect their responses');
  console.log('3. Run: eck-snapshot process-consilium <responses.json>');
}

// CLI Setup
const program = new Command();

program
  .name('eck-snapshot')
  .description('Multi-agent aware snapshot tool for repositories with consilium support')
  .version('4.0.0');

// Main snapshot command
program
  .command('snapshot', { isDefault: true })
  .description('Create a multi-agent aware snapshot of a repository')
  .argument('[repoPath]', 'Path to the repository', process.cwd())
  .option('-o, --output <dir>', 'Output directory', path.join(__dirname, 'snapshots'))
  .option('--no-tree', 'Exclude directory tree')
  .option('-v, --verbose', 'Show detailed processing')
  .option('--max-file-size <size>', 'Maximum file size', '10MB')
  .option('--max-total-size <size>', 'Maximum total size', '100MB')
  .option('--max-depth <number>', 'Maximum tree depth', (val) => parseInt(val), 10)
  .option('--config <path>', 'Configuration file path')
  .option('--compress', 'Compress with gzip')
  .option('--include-hidden', 'Include hidden files')
  .option('--format <type>', 'Output format: md, json', 'md')
  .option('--no-ai-header', 'Skip AI instructions')
  .option('-d, --dir', 'Directory mode')
  .option('--enhanced', 'Use enhanced multi-agent headers (default: true)', true)
  .action((repoPath, options) => createRepoSnapshot(repoPath, options));

// Restore command
program
  .command('restore')
  .description('Restore files from a snapshot')
  .argument('<snapshot_file>', 'Snapshot file path')
  .argument('[target_directory]', 'Target directory', process.cwd())
  .option('-f, --force', 'Skip confirmation')
  .option('-v, --verbose', 'Show detailed progress')
  .option('--dry-run', 'Preview without writing')
  .option('--include <patterns...>', 'Include patterns')
  .option('--exclude <patterns...>', 'Exclude patterns')
  .option('--concurrency <number>', 'Concurrent operations', (val) => parseInt(val), 10)
  .action((snapshotFile, targetDir, options) => restoreSnapshot(snapshotFile, targetDir, options));

// Consilium command
program
  .command('consilium')
  .description('Generate a consilium request for complex decisions')
  .option('--type <type>', 'Decision type', 'technical_decision')
  .option('--title <title>', 'Decision title')
  .option('--description <desc>', 'Detailed description')
  .option('--complexity <num>', 'Complexity score (1-10)', (val) => parseInt(val), 7)
  .option('--constraints <list>', 'Comma-separated constraints')
  .option('--snapshot <file>', 'Include snapshot file')
  .option('--agent <id>', 'Requesting agent ID')
  .option('-o, --output <file>', 'Output file', 'consilium_request.json')
  .action(generateConsilium);

// Check boundaries command
program
  .command('check-boundaries')
  .description('Check agent boundaries in a file')
  .argument('<file>', 'File to check')
  .option('--agent <id>', 'Your agent ID')
  .action(async (file, options) => {
    const result = await checkCodeBoundaries(file, options.agent || 'UNKNOWN');
    console.log(JSON.stringify(result, null, 2));
  });

program.parse(process.argv);