import { DEFAULT_CONFIG } from '../config.js';

export function generateEnhancedAIHeader(stats, repoName, includeAiInstructions = true, config = null) {
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