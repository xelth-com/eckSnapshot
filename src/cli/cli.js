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

  const helpGuide = `eck-snapshot (v4.1.0) - AI-Native Repository Context Tool.

--- 🚀 Core Workflow: Optimized for Web LLMs (Gemini/ChatGPT) ---

1. Initial Context (Maximum Compression)
   Create a lightweight map of your entire project. Bodies of functions are hidden.
   This fits huge monoliths into the context window.
   
   $ eck-snapshot --skeleton
   -> Generates: .eck/snapshots/<name>_sk.md (Upload this to AI)

2. Lazy Loading (On-Demand Details)
   If the AI needs to see the implementation of specific files, it will ask you.
   You can display multiple files at once to copy-paste back to the chat.
   
   $ eck-snapshot show src/auth.js src/utils/hash.js

3. Working & Updating
   As you apply changes, the AI loses context. Instead of re-sending the full repo,
   send only what changed since the last snapshot.
   
   $ eck-snapshot update
   -> Generates: .eck/snapshots/update_<timestamp>.md (Contains changed files + git diff)

--- 🛠️ Managing Context Profiles ---

Option A: Auto-Detection (Best for start)
   Uses AI to scan folders and suggest profiles (backend, frontend, etc).
   $ eck-snapshot profile-detect

Option B: Manual Guide (Best for large repos)
   If the project is too big for auto-detection, this generates a prompt text file
   that you can paste into a powerful Web LLM (like Gemini 1.5 Pro) to design profiles manually.
   
   1. Run:  $ eck-snapshot generate-profile-guide
   2. Open: .eck/profile_generation_guide.md
   3. Copy: Paste the content into your AI chat.
   4. Save: Take the JSON response and save it to .eck/profiles.json

Option C: Using Profiles
   $ eck-snapshot --profile backend
   $ eck-snapshot --profile "frontend,-**/*.test.js" (Ad-hoc filtering)

--- 🧩 Auxiliary Commands ---

- restore:            Restore files from a snapshot to disk.
- prune:              Use AI to shrink a snapshot file by importance.
- ask-claude:        Delegate tasks to Claude CLI agent.
- setup-gemini:       Configure gemini-cli integration.
`;

  program
    .name('eck-snapshot')
    .description('A lightweight, platform-independent CLI for creating project snapshots.')
    .version('4.1.0')
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
        console.error(`Failed to execute prompt: ${error.message}`);
        process.exit(1);
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
    .description('Output the full content of specific file(s) (for AI lazy loading)')
    .argument('<filePaths...>', 'Space-separated paths to files')
    .action(showFile);

  program.parse(process.argv);
}
