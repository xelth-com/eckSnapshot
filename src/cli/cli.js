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

export function run() {
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
                    Args: { profile?: string, skeleton?: boolean, jas/jao/jaz?: boolean }
  - eck_update    : Create a delta snapshot.
  - eck_setup_mcp : Configure MCP. Args: { opencode?: boolean, both?: boolean }
  - eck_detect    : Detect project type. Args: {}
  - eck_doctor    : Run project health check. Args: {}

EXAMPLES:
  eck-snapshot '{"name": "eck_snapshot", "arguments": {"profile": "backend"}}'
  eck-snapshot '{"name": "eck_update"}'
  eck-snapshot '{"name": "eck_setup_mcp", "arguments": {"both": true}}'
`;

  program
    .name('eck-snapshot')
    .version(pkg.version)
    .addHelpText('before', helpGuide)
    .argument('[payload]', 'JSON string representing the MCP tool call')
    .action(async (payloadStr) => {
      if (!payloadStr) {
        program.help();
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
