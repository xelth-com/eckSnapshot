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
import { executePrompt, executePromptWithSession } from '../services/claudeCliService.js';
import { executePrompt as executeGeminiPrompt, executePromptWithPTY } from '../services/geminiWebService.js';
import { detectProfiles } from './commands/detectProfiles.js';
import { startGeminiSession, askGeminiSession, stopGeminiSession, getSessionStatus, sendCommandToSession, waitForSessionReady, startGeminiSessionDaemon } from '../services/geminiWebService.js';
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
    .option('--profile <name>', 'Use a specific context profile (local .eck/profiles.json or global setup.json)')
    .action(createRepoSnapshot);

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

  // Ask Gemini command (PTY mode by default for OAuth support)
  program
    .command('ask-gemini')
    .description('Execute a prompt using gemini-cli with OAuth authentication')
    .argument('<prompt>', 'Prompt to send to Gemini')
    .option('--use-api-key', 'Use API key mode instead of OAuth (requires GEMINI_API_KEY)')
    .action(async (prompt, options) => {
      try {
        let result;
        if (options.useApiKey) {
          console.log('Using API key mode...');
          result = await executeGeminiPrompt(prompt);
        } else {
          console.log('Using OAuth authentication via PTY...');
          result = await executePromptWithPTY(prompt);
        }
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('Failed to execute prompt with Gemini:', error.message);
        if (!options.useApiKey) {
          console.log('💡 Tip: Try using --use-api-key flag if you have GEMINI_API_KEY set');
        }
        process.exit(1);
      }
    });

  async function handleGeminiSession(snapshotPath, options) {
    const spinner = ora('Preparing Gemini session...').start();
    try {
      // Force logout to ensure a clean authentication flow
      spinner.text = 'Clearing previous session credentials...';
      try {
        await execa('gemini', ['auth', 'clean']);
      } catch (e) {
        // This might fail if no auth exists, which is fine.
      }
      try {
        await execa('gemini', ['auth', 'logout']);
      } catch (e) {
        // This is expected if the user is already logged out, so we can ignore it.
        spinner.text = 'No active session found. Proceeding with new login...';
      }

      spinner.text = 'Starting Gemini session...';
      await startGeminiSession({ model: options.model });
      spinner.succeed('Gemini session started.'); // Session is ready now

      const configSpinner = ora('Configuring Gemini agent with architect prompt...').start();
      const templatePath = path.join(__dirname, '..', 'templates', 'architect-prompt.template.md');
      const architectPrompt = await fs.readFile(templatePath, 'utf-8');
      await askGeminiSession(architectPrompt);
      configSpinner.succeed('Agent configured.');

      const snapshotSpinner = ora('Loading snapshot context into session...').start();
      const snapshotLoadPrompt = `Loaded context from snapshot: ${snapshotPath}. I will now begin the task based on my instructions.`;
      const initialResponse = await askGeminiSession(snapshotLoadPrompt);
      snapshotSpinner.succeed('Snapshot context loaded.');
      console.log(chalk.blueBright('\nInitial Analysis:\n'), initialResponse);

      process.on('SIGINT', async () => {
        console.log('\nCaught interrupt signal. Ending session.');
        await stopGeminiSession();
        process.exit();
      });

      while (true) {
        const { prompt } = await inquirer.prompt([
          {
            type: 'input',
            name: 'prompt',
            message: 'Ask Gemini (type exit to end):',
          },
        ]);

        if (prompt.toLowerCase() === 'exit' || prompt.toLowerCase() === 'quit') {
          break;
        }

        if (!prompt.trim()) continue;

        const askSpinner = ora('Getting response from Gemini...').start();
        try {
          let modelResponse = await askGeminiSession(prompt);
          askSpinner.succeed('Response received.');

          const toolRegex = /\[tool_code:\s*([\s\S]*?)\]/g;
          let match;
          const commandsToRun = [];

          while ((match = toolRegex.exec(modelResponse)) !== null) {
            commandsToRun.push(match[1].trim());
          }

          const thought = modelResponse.replace(toolRegex, '').trim();
          if (thought) {
            console.log(chalk.greenBright('\nGemini:\n'), thought);
          }

          if (commandsToRun.length > 0) {
            for (const command of commandsToRun) {
              const toolSpinner = ora(`Gemini agent is running local command: ${chalk.yellow(command)}`).start();
              try {
                const commandParts = command.split(' ');
                const mainCommand = commandParts.shift();
                if (mainCommand !== 'eck-snapshot') {
                  throw new Error('Only eck-snapshot commands are allowed.');
                }
                const { stdout, stderr } = await execa('node', ['index.js', ...commandParts]);
                toolSpinner.succeed(`Local command finished.`);
                const observation = `Observation: \nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;

                const observationSpinner = ora('Gemini is processing the result...').start();
                const finalResponse = await askGeminiSession(observation);
                observationSpinner.succeed('Gemini responded.');
                console.log(chalk.greenBright('\nGemini:\n'), finalResponse);

              } catch (e) {
                toolSpinner.fail('Local command failed.');
                const errorFeedback = `Observation: Command failed with error:\n${e.stderr || e.message}`;
                const errorSpinner = ora('Informing Gemini about the error...').start();
                const errorResponse = await askGeminiSession(errorFeedback);
                errorSpinner.succeed('Gemini responded to error.');
                console.log(chalk.greenBright('\nGemini:\n'), errorResponse);
              }
            }
          } else if (!thought) {
             console.log(chalk.greenBright('\nGemini:\n'), modelResponse);
          }
        } catch (e) {
          askSpinner.fail('Error receiving response.');
          console.error(chalk.red(e.message));
        }
      }
    } catch (error) {
      spinner.fail('Failed to start Gemini session.');
      console.error(chalk.red(error.message));
    } finally {
      const endSpinner = ora('Ending Gemini session...').start();
      await stopGeminiSession();
      endSpinner.succeed('Session ended.');
    }
  }

  program
    .command('gemini-session <snapshot_file>')
    .description('Starts an interactive session with Gemini using a large snapshot as context.')
    .option('--model <modelName>', 'Specify the Gemini model to use')
    .action(handleGeminiSession);

  // Daemon mode for non-interactive session
  program
    .command('session-start [snapshot_file]')
    .description('Start a Gemini session daemon (non-interactive mode)')
    .option('--model <modelName>', 'Specify the Gemini model to use', 'gemini-2.5-pro')
    .action(async (snapshotFile, options) => {
      try {
        const status = getSessionStatus();
        if (status.isActive) {
          console.log('A session is already active. Use session-stop to stop it first.');
          return;
        }

        await startGeminiSessionDaemon({
          model: options.model,
          snapshotFile: snapshotFile
        });
        
        // Keep the process alive in daemon mode
        console.log('Session daemon is running. Use Ctrl+C to stop or run "eck-snapshot session-stop" from another terminal.');
        process.stdin.resume(); // Keep process alive
      } catch (error) {
        console.error('Failed to start session daemon:', error.message);
        process.exit(1);
      }
    });

  // Gemini session status command
  program
    .command('session-status')
    .description('Check the status of the current Gemini session')
    .action(async () => {
      try {
        const status = getSessionStatus();
        console.log(JSON.stringify(status, null, 2));
      } catch (error) {
        console.error('Failed to get session status:', error.message);
        process.exit(1);
      }
    });

  // Send command to active session
  program
    .command('session-send <command>')
    .description('Send a command to the active Gemini session')
    .action(async (command) => {
      try {
        const status = getSessionStatus();
        if (!status.isActive) {
          console.error('No active Gemini session. Start one first with: eck-snapshot gemini-session <snapshot_file>');
          process.exit(1);
        }

        console.log(chalk.blue('Sending command to active session...'));
        const response = await sendCommandToSession(command);
        console.log(chalk.green('\nResponse:'));
        console.log(response);
      } catch (error) {
        console.error('Failed to send command to session:', error.message);
        process.exit(1);
      }
    });

  // Stop active session
  program
    .command('session-stop')
    .description('Stop the active Gemini session')
    .action(async () => {
      try {
        const status = getSessionStatus();
        if (!status.isActive) {
          console.log('No active session to stop.');
          return;
        }

        const spinner = ora('Stopping Gemini session...').start();
        await stopGeminiSession();
        spinner.succeed('Session stopped successfully.');
      } catch (error) {
        console.error('Failed to stop session:', error.message);
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

  program.parse(process.argv);
}