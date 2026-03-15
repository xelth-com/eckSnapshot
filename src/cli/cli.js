import { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import core logic (we bypass the CLI wrapper entirely)
import { createRepoSnapshot } from './commands/createSnapshot.js';
import { updateSnapshot, updateSnapshotJson } from './commands/updateSnapshot.js';
import { setupMcp } from './commands/setupMcp.js';
import { detectProject } from './commands/detectProject.js';
import { runDoctor } from './commands/doctor.js';
import { runReconTool } from './commands/recon.js';
import { runTokenTools } from './commands/trainTokens.js';

// Legacy command shims: translate old positional commands to JSON payloads
// so internal callers (mcp-eck-core.js) keep working after the JSON migration.
const LEGACY_COMMANDS = {
  'update-auto': (args) => ({ name: 'eck_update_auto', arguments: { fail: args.includes('--fail') || args.includes('-f') } }),
  'snapshot':    () => ({ name: 'eck_snapshot', arguments: {} }),
  'update':      (args) => ({ name: 'eck_update', arguments: { fail: args.includes('--fail') || args.includes('-f') } }),
  'setup-mcp':   (args) => ({ name: 'eck_setup_mcp', arguments: { opencode: args.includes('--opencode'), both: args.includes('--both') } }),
  'detect':      () => ({ name: 'eck_detect', arguments: {} }),
  'doctor':      () => ({ name: 'eck_doctor', arguments: {} }),
  'scout':       () => ({ name: 'eck_scout', arguments: {} }),
  'fetch':       (args) => ({ name: 'eck_fetch', arguments: { patterns: args } }),
  'link':        (args) => ({ name: 'eck_snapshot', arguments: { link: args[0], linkDepth: args[1] ? parseInt(args[1], 10) : 0 } }),
};

export function run() {
  // Intercept legacy positional commands before commander parses them
  const rawArgs = process.argv.slice(2);
  const firstArg = rawArgs[0];
  if (firstArg && LEGACY_COMMANDS[firstArg]) {
    const payload = LEGACY_COMMANDS[firstArg](rawArgs.slice(1));
    // Replace argv so commander sees the JSON payload
    process.argv = [process.argv[0], process.argv[1], JSON.stringify(payload)];
  }

  const program = new Command();
  const pkg = createRequire(import.meta.url)('../../package.json');

  const helpGuide = `
eck-snapshot (v${pkg.version}) - AI-Native Repository Context Tool.
===================================================================
⚠️ PURE JSON/MCP INTERFACE ACTIVE ⚠️

This CLI is designed to be operated by AI agents using JSON payloads.
Legacy command-line flags have been removed.

USAGE:
  eck-snapshot '<json_payload>'

AVAILABLE TOOLS:
  - eck_snapshot  : Create a full context snapshot.
                    Args: { profile?: string, skeleton?: boolean, jas/jao/jaz?: boolean, link?: string|string[], linkDepth?: number }
  - eck_update    : Create a delta snapshot.
  - eck_scout     : Reconnaissance (generate tree for external repos).
  - eck_fetch     : Reconnaissance (fetch file contents). Args: { patterns: string[] }
  - eck_setup_mcp : Configure MCP. Args: { opencode?: boolean, both?: boolean }
  - eck_detect    : Detect project type. Args: {}
  - eck_doctor    : Run project health check. Args: {}
  - eck_train_tokens: Calibrate token estimator. Args: { projectType, fileSizeBytes, estimatedTokens, actualTokens }
  - eck_token_stats : Show token estimation accuracy. Args: {}

EXAMPLES:
  eck-snapshot '{"name": "eck_snapshot", "arguments": {"profile": "backend"}}'
  eck-snapshot '{"name": "eck_update"}'
  eck-snapshot '{"name": "eck_scout"}'
  eck-snapshot '{"name": "eck_fetch", "arguments": {"patterns": ["src/**/*.rs"]}}'

HUMAN SHORTHANDS:
  eck-snapshot link ../other-project 4  (Creates snapshot with linked project at depth 4)
`;

  program
    .name('eck-snapshot')
    .version(pkg.version)
    .addHelpText('before', helpGuide)
    .argument('[payload]', 'JSON string representing the MCP tool call')
    .action(async (payloadStr) => {
      // Default behavior for human users: empty call = full snapshot
      if (!payloadStr) {
        console.log(chalk.cyan('🚀 No arguments provided. Defaulting to full repository snapshot...'));
        console.log(chalk.gray('💡 Run `eck-snapshot -h` to see all available JSON tools.\n'));
        await createRepoSnapshot(process.cwd(), {});
        return;
      }

      let payload;
      try {
        payload = JSON.parse(payloadStr.trim());
      } catch (e) {
        console.error(chalk.red('❌ Error: Input must be a valid JSON string.'));
        console.log(chalk.yellow(`Example: eck-snapshot '{"name": "eck_snapshot"}'`));
        process.exit(1);
      }

      const toolName = payload.name;
      const args = payload.arguments || {};
      const cwd = process.cwd();

      try {
        switch (toolName) {
          case 'eck_snapshot':
            await createRepoSnapshot(cwd, args);
            break;
          case 'eck_update':
            await updateSnapshot(cwd, args);
            break;
          case 'eck_update_auto':
            await updateSnapshotJson(cwd, args);
            break;
          case 'eck_setup_mcp':
            await setupMcp(args);
            break;
          case 'eck_detect':
            await detectProject(cwd, args);
            break;
          case 'eck_doctor':
            await runDoctor(cwd);
            break;
          case 'eck_scout':
          case 'eck_fetch':
            await runReconTool(payload);
            break;
          case 'eck_train_tokens':
          case 'eck_token_stats':
            await runTokenTools(payload);
            break;
          default:
            console.log(chalk.red(`❌ Unknown tool: "${toolName}"`));
            console.log(chalk.yellow('Run `eck-snapshot -h` to see available JSON tools.'));
            process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red(`❌ Execution failed for ${toolName}:`), err.message);
        process.exit(1);
      }
    });

  // Start version check in background (non-blocking)
  checkForUpdates(pkg.version);

  program.parse(process.argv);
}

function checkForUpdates(currentVersion) {
  import('execa').then(({ execa }) => {
    execa('npm', ['view', '@xelth/eck-snapshot', 'version'], { timeout: 5000 })
      .then(({ stdout }) => {
        const latest = stdout.trim();
        if (latest && latest !== currentVersion) {
          console.error(`\n${chalk.yellow(`⬆ Update available: ${currentVersion} → ${latest}`)}`);
        }
      })
      .catch(() => {});
  });
}
