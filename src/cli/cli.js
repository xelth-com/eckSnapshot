import { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { createRepoSnapshot } from './commands/createSnapshot.js';
import { updateSnapshot } from './commands/updateSnapshot.js';
import { restoreSnapshot } from './commands/restoreSnapshot.js';
import { pruneSnapshot } from './commands/pruneSnapshot.js';
import { generateConsilium } from './commands/consilium.js';
import { detectProject, testFileParsing } from './commands/detectProject.js';
import { trainTokens, showTokenStats } from './commands/trainTokens.js';
import { askGpt } from './commands/askGpt.js';
import { ask as askGptService } from '../services/gptService.js';
import { executePrompt, executePromptWithSession } from '../services/claudeCliService.js';
import { detectProfiles } from './commands/detectProfiles.js';
import { generateProfileGuide } from './commands/generateProfileGuide.js';
import { setupGemini } from './commands/setupGemini.js';
import { generateAutoDocs } from './commands/autoDocs.js';
import { showFile } from './commands/showFile.js';
import inquirer from 'inquirer';
import ora from 'ora';
import { execa } from 'execa';
import chalk from 'chalk';

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

// Main run function that sets up the CLI
export function run() {
  const program = new Command();

  const helpGuide = `eck-snapshot (v4.0.0) - A lightweight, platform-independent CLI for creating project snapshots.

--- Getting Started: Environment Setup ---

This tool is designed to work with Large Language Models (LLMs). For the best results, you'll need:
1. An 'Architect' LLM (like Gemini, GPT-4, or Grok) to analyze snapshots.
2. A 'Coder' LLM (like Claude Code) to execute coding tasks.

--- Core Workflow: A Step-by-Step Guide ---

Step 1: Create a Full Project Snapshot
This is your primary command. It scans your project and packs all code into a single file.

> Usage:
  $ eck-snapshot

-> This creates a file like 'myProject_snapshot_... .md' in the .eck/snapshots/ directory.
   You can now pass this file to your Architect LLM for analysis.


Step 2: Handle Large Projects with Auto-Profiling
If your project is too big for the LLM's context window, \`profile-detect\` will automatically
slice it into logical parts (profiles) using AI.

> Usage:
  $ eck-snapshot profile-detect

-> Output:
  ✨ Detected Profiles:
  ---------------------------
    - cli
    - services
    - core
    - templates
    - docs
    - config


Step 3: Use Profiles to Create Focused Snapshots
Use the --profile option to create smaller snapshots of specific project areas.

> Example 1: Combine and exclude profiles
  $ eck-snapshot --profile "core,services,cli,-docs,-config"

-> Creates a snapshot with code from the 'core', 'services', and 'cli' profiles,
   while excluding anything from 'docs' and 'config'.

> Example 2: Use ad-hoc glob patterns
  $ eck-snapshot --profile "src/**/*.js,-**/*.test.js"

-> Includes all .js files in the 'src' directory and its subdirectories,
   but excludes any file ending in '.test.js'.
   Note: Quotes are required for complex patterns.


Step 4: Intelligently Prune a Snapshot
If a snapshot is still too large, \`prune\` uses AI to shrink it to a target size,
keeping only the most important files.

> Usage:
  $ eck-snapshot prune myProject_snapshot.md --target-size 500KB


Step 5 (Alternative): Truncate Files by Line Count
A faster, non-AI method to reduce size by keeping only the top N lines of each file.
Useful for a high-level overview.

> Usage:
  $ eck-snapshot --max-lines-per-file 200

--- Auxiliary Commands ---

- restore:                  Restore a project from a snapshot file.
- generate-profile-guide:   Creates a guide for manual profile creation. Use this if 'profile-detect' fails on very large projects, as it allows you to use an LLM with a larger context window (e.g., a web UI).
- detect:                   Show how eckSnapshot identifies your project type.
- ask-gpt / ask-claude:     Directly query the configured AI coder agents.
- setup-gemini:             Auto-configure integration with gemini-cli.
`;

  program
    .name('eck-snapshot')
    .description('A lightweight, platform-independent CLI for creating project snapshots.')
    .version('4.0.0')
    .addHelpText('before', helpGuide);

  // Main snapshot command
  program
    .command('snapshot', { isDefault: true })
    .description('Create a multi-agent aware snapshot of a repository')
    .argument('[repoPath]', 'Path to the repository', process.cwd())
    .option('-o, --output <dir>', 'Output directory')
    .option('--no-tree', 'Exclude directory tree')
    .option('-v, --verbose', 'Show detailed processing')
    .option('--max-file-size <size>', 'Maximum file size', '10MB')
    .option('--max-total-size <size>', 'Maximum total size', '100MB')
    .option('--max-depth <number>', 'Maximum tree depth', (val) => parseInt(val), 10)
    .option('--config <path>', 'Configuration file path')
    .option('--include-hidden', 'Include hidden files')
    .option('--format <type>', 'Output format: md, json', 'md')
    .option('--no-ai-header', 'Skip AI instructions')
    .option('-d, --dir', 'Directory mode')
    .option('--enhanced', 'Use enhanced multi-agent headers (default: true)', true)
    .option('--profile <name>', 'Filter files using profiles and/or ad-hoc glob patterns.')
    .option('--agent', 'Generate a snapshot optimized for a command-line agent')
    .option('--with-ja', 'Generate a detailed snapshot for the Junior Architect agent')
    .option('--skeleton', 'Enable skeleton mode: strip function bodies to save context window tokens')
    .option('--max-lines-per-file <number>', 'Truncate files to max N lines (e.g., 200 for compact snapshots)', (val) => parseInt(val))
    .action(createRepoSnapshot)
    .addHelpText('after', `
Profile Usage Guide:
  Profiles allow you to curate focused snapshots by filtering files using glob patterns.
  Define reusable profiles in .eck/profiles.json or use ad-hoc patterns directly.

Profile Structure (.eck/profiles.json):
  {
    "backend": {
      "include": ["src/api/**", "src/services/**"],
      "exclude": ["**/*.test.js"]
    },
    "frontend": {
      "include": ["src/components/**", "src/pages/**"],
      "exclude": ["**/*.spec.js"]
    }
  }

Examples:
  --profile backend
    Uses the 'backend' profile defined in .eck/profiles.json

  --profile "backend,-**/tests/**"
    Uses 'backend' profile, then excludes all test directories

  --profile "src/**/*.js,-**/*.test.js"
    Ad-hoc filtering: includes all JS files in src/, excludes test files

  --profile "frontend,src/utils/**"
    Combines 'frontend' profile with additional utility files

Glob Pattern Reference:
  **          Matches any number of directories
  *           Matches any characters within a directory level
  {a,b}       Matches either 'a' or 'b'
  [0-9]       Matches any digit
  -pattern    Prefix with '-' to exclude matching files

Creating Custom Profiles:
  1. Run: eck-snapshot generate-profile-guide
  2. Follow the generated guide in .eck/profile_generation_guide.md
  3. Save your custom profiles to .eck/profiles.json

  Alternatively, use AI detection:
    eck-snapshot profile-detect   (auto-generates profiles using AI)
`);

  // Update snapshot command
  program
    .command('update')
    .description('Create a delta snapshot of changed files since the last full snapshot')
    .argument('[repoPath]', 'Path to the repository', process.cwd())
    .option('--config <path>', 'Configuration file path')
    .action(updateSnapshot);

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
    .action(restoreSnapshot);

  // Prune command
  program
    .command('prune')
    .description('Intelligently reduce snapshot size using AI file ranking')
    .argument('<snapshot_file>', 'Path to the snapshot file to prune')
    .option('--target-size <size>', 'Target size (e.g., 500KB, 1MB)', '500KB')
    .action(pruneSnapshot);

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

  program
    .command('ask-gpt')
    .description('Delegate tasks to OpenAI Codex agent with automatic authentication')
    .argument('<payload>', 'JSON payload string (e.g. \'{"objective": "Calculate 5+2"}\')')
    .option('-v, --verbose', 'Enable verbose logging and detailed execution output')
    .option('--model <name>', 'Model to use (default: gpt-5-codex)', 'gpt-5-codex')
    .option('--reasoning <level>', 'Reasoning level: low, medium, high (default: high)', 'high')
    .action((payloadArg, cmd) => askGpt(payloadArg, cmd))
    .addHelpText('after', `
Examples:
  Ask a simple question:
    eck-snapshot ask-gpt '{"objective": "What is 5+2?"}'

  Request code changes with context:
    eck-snapshot ask-gpt '{
      "target_agent": "local_dev",
      "task_id": "feature-123",
      "payload": {
        "objective": "Add error handling to login function",
        "files_to_modify": [{"path": "src/auth.js", "action": "modify"}]
      },
      "post_execution_steps": {
        "journal_entry": {
          "type": "feat",
          "scope": "auth",
          "summary": "Add error handling"
        }
      }
    }' --verbose

Prerequisites:
  1. Install Codex CLI: npm install -g @openai/codex
  2. Login: codex login (requires ChatGPT Plus/Pro subscription)
  3. The command automatically loads .eck project context

Authentication:
  - Uses your existing 'codex login' credentials
  - Auto-retries on authentication errors
  - Supports ChatGPT Plus/Pro subscriptions
`);

  // Project detection command
  program
    .command('detect')
    .description('Detect and display project type and configuration')
    .argument('[projectPath]', 'Path to the project', process.cwd())
    .option('-v, --verbose', 'Show detailed detection results')
    .action(detectProject);

  // Android parsing test command
  program
    .command('test-android')
    .description('Test Android file parsing capabilities')
    .argument('<filePath>', 'Path to Android source file (.kt or .java)')
    .option('--show-content', 'Show content preview of parsed segments')
    .action(testFileParsing);

  // Token training command
  program
    .command('train-tokens')
    .description('Train token estimation with actual results')
    .argument('<projectType>', 'Project type (android, nodejs, python, etc.)')
    .argument('<fileSizeBytes>', 'File size in bytes')
    .argument('<estimatedTokens>', 'Estimated token count')
    .argument('<actualTokens>', 'Actual token count from LLM')
    .action(trainTokens);

  // Token statistics command
  program
    .command('token-stats')
    .description('Show token estimation statistics and accuracy')
    .action(showTokenStats);

  // Profile detection command
  program
    .command('profile-detect')
    .description('Use AI to scan the directory tree and auto-generate local context profiles (saves to .eck/profiles.json)')
    .argument('[repoPath]', 'Path to the repository', process.cwd())
    .action(detectProfiles);

  program
    .command('generate-profile-guide')
    .description('Generate a markdown guide with a prompt and directory tree for manual profile creation')
    .argument('[repoPath]', 'Path to the repository', process.cwd())
    .option('--config <path>', 'Configuration file path')
    .action((repoPath, options) => generateProfileGuide(repoPath, options));

  // Ask Claude command
  program
    .command('ask-claude')
    .description('Execute a prompt using claude-code CLI and return JSON response')
    .argument('<prompt>', 'Prompt to send to Claude')
    .option('-c, --continue', 'Continue the most recent conversation')
    .action(async (prompt, options) => {
      try {
        const result = await executePrompt(prompt, options.continue);
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.warn(`⚠️ Claude failed: ${error.message}`);
        console.log('🔄 Failing over to GPT for task...');
        try {
          const payload = (typeof prompt === 'string' && prompt.startsWith('{')) ? prompt : JSON.stringify({ objective: prompt });
          const gptResult = await askGptService(payload, { verbose: false });
          console.log(JSON.stringify(gptResult, null, 2));
        } catch (gptError) {
          console.error('Failed to execute prompt with both Claude and GPT:', gptError.message);
          process.exit(1);
        }
      }
    });

  // Ask Claude with specific session
  program
    .command('ask-claude-session')
    .description('Execute a prompt using specific session ID')
    .argument('<sessionId>', 'Session ID to resume')
    .argument('<prompt>', 'Prompt to send to Claude')
    .action(async (sessionId, prompt) => {
      try {
        // Directly use the provided session ID
        const result = await executePromptWithSession(prompt, sessionId);
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('Failed to execute prompt:', error.message);
        process.exit(1);
      }
    });




  program
    .command('generate-ai-prompt')
    .description('Generate a specific AI prompt from a template.')
    .option('--role <role>', 'The role for which to generate a prompt', 'architect')
    .action(async (options) => {
      try {
        const templatePath = path.join(__dirname, '..', 'templates', `${options.role}-prompt.template.md`);
        const template = await fs.readFile(templatePath, 'utf-8');
        // In the future, we can inject dynamic data here from setup.json
        console.log(template);
      } catch (error) {
        console.error(`Failed to generate prompt for role '${options.role}':`, error.message);
        process.exit(1);
      }
    });

  // Setup Gemini command
  program
    .command('setup-gemini')
    .description('Generate claude.toml configuration for gemini-cli integration with dynamic paths')
    .option('-v, --verbose', 'Show detailed output and error information')
    .action(setupGemini);

  // Auto-docs command
  program
    .command('docs-auto')
    .description('Auto-generate documentation from gemini-extension.json files')
    .action(generateAutoDocs);

  // Show file command (for skeleton mode lazy loading)
  program
    .command('show')
    .description('Output the full content of a specific file (for AI lazy loading)')
    .argument('<filePath>', 'Path to the file')
    .action(showFile);

  program.parse(process.argv);
}
