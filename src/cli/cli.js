import { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { createRepoSnapshot } from './commands/createSnapshot.js';
import { restoreSnapshot } from './commands/restoreSnapshot.js';
import { generateConsilium } from './commands/consilium.js';
import { indexProject } from './commands/indexProject.js';
import { queryProject } from './commands/queryProject.js';
import { detectProject, testFileParsing } from './commands/detectProject.js';
import { trainTokens, showTokenStats } from './commands/trainTokens.js';
import { askGpt } from './commands/askGpt.js';
import { executePrompt, executePromptWithSession } from '../services/claudeCliService.js';
import { executePrompt as executeGeminiPrompt, executePromptWithPTY } from '../services/geminiWebService.js';
import { detectProfiles } from './commands/detectProfiles.js';
import { setupGemini } from './commands/setupGemini.js';
import { generateAutoDocs } from './commands/autoDocs.js';
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

  program
    .name('eck-snapshot')
    .description('Multi-agent aware snapshot tool for repositories with consilium support')
    .version('4.0.0');

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
    .action(createRepoSnapshot)
    .addHelpText('after', `
Examples for --profile:
  --profile backend                      (Uses the 'backend' profile)
  --profile "backend,-**/tests/**"         (Uses 'backend' profile, excludes all test files)
  --profile "src/**/*.js,-**/*.test.js"  (Includes all JS files in src, excludes tests)

  Combine predefined profiles (from .eck/profiles.json) with ad-hoc glob patterns.
  Prefix a profile name or glob pattern with '-' to exclude it.
`);

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

  // Index command
  program
    .command('index')
    .description('Index the project for intelligent search')
    .argument('[projectPath]', 'Path to the project', process.cwd())
    .option('--profile <name>', 'Use a specific context profile for indexing')
    .option('--export [filename]', 'Export the synchronized index to a JSON file. If no filename is provided, one will be generated.')
    .action(indexProject);

  // Query command
  program
    .command('query')
    .description('Query the project with context-aware search')
    .argument('<query>', 'Search query')
    .option('-k, --top-k <number>', 'Number of top results', (val) => parseInt(val), 10)
    .option('-o, --output <file>', 'Output file for snapshot')
    .option('--profile <name>', 'Use a specific context profile for querying')
    .option('--import <filename>', 'Use a portable index file for the query instead of the local database.')
    .action(queryProject);

  program
    .command('ask-gpt')
    .description('Delegate apply_code_changes payload to ChatGPT CLI')
    .argument('<payload>', 'JSON payload string')
    .option('-v, --verbose', 'Enable verbose logging')
    .action((payloadArg, cmd) => askGpt(payloadArg, cmd));

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
        console.error('Failed to execute prompt:', error.message);
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

  // Ask Gemini command (PTY mode with OAuth - no API key needed)
  program
    .command('ask-gemini')
    .description('Execute a prompt using gemini-cli with OAuth authentication')
    .argument('<prompt>', 'Prompt to send to Gemini')
    .option('--use-api-key', 'Use API key mode instead of OAuth (requires GEMINI_API_KEY)')
    .option('--debug', 'Enable debug mode with detailed logging')
    .action(async (prompt, options) => {
      try {
        let result;
        if (options.useApiKey) {
          console.log('Using API key mode...');
          result = await executeGeminiPrompt(prompt);
        } else {
          // Default: use PTY mode (works with OAuth, no API key needed)
          if (options.debug) {
            console.log('Using PTY mode with OAuth authentication (debug enabled)...');
          }
          result = await executePromptWithPTY(prompt);
        }
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('Failed to execute prompt with Gemini:', error.message);
        if (!options.useApiKey) {
          console.log('💡 Tip: Try using --use-api-key flag if you have GEMINI_API_KEY set');
          console.log('   Or use --debug flag for detailed logging');
        }
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

  program.parse(process.argv);
}
