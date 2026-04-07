import { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { createRequire } from 'module';
import os from 'os';
import crypto from 'crypto';
import { ensureSnapshotsInGitignore } from '../utils/fileUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getGlobalConfig() {
  const configPath = path.join(os.homedir(), '.eck', 'cli-config.json');
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    const newConfig = { instanceId: crypto.randomUUID(), telemetryEnabled: true };
    await fs.mkdir(path.dirname(configPath), { recursive: true }).catch(() => {});
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2)).catch(() => {});
    return newConfig;
  }
}

async function setGlobalConfig(updates) {
  const configPath = path.join(os.homedir(), '.eck', 'cli-config.json');
  const current = await getGlobalConfig();
  const next = { ...current, ...updates };
  await fs.writeFile(configPath, JSON.stringify(next, null, 2)).catch(() => {});
  return next;
}

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
  'update-auto': (args) => {
    const baseIdx = args.indexOf('--base');
    const base = baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : undefined;
    return { name: 'eck_update_auto', arguments: { fail: args.includes('--fail') || args.includes('-f'), base } };
  },
  'snapshot':    () => ({ name: 'eck_snapshot', arguments: {} }),
  'update':      (args) => {
    const baseIdx = args.indexOf('--base');
    const base = baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : undefined;
    return { name: 'eck_update', arguments: { fail: args.includes('--fail') || args.includes('-f'), base } };
  },
  'setup-mcp':   (args) => ({ name: 'eck_setup_mcp', arguments: { opencode: args.includes('--opencode'), both: args.includes('--both') } }),
  'detect':      () => ({ name: 'eck_detect', arguments: {} }),
  'doctor':      () => ({ name: 'eck_doctor', arguments: {} }),
  'scout':       (args) => ({ name: 'eck_scout', arguments: { depth: args[0] !== undefined ? parseInt(args[0], 10) : 0 } }),
  'fetch':       (args) => ({ name: 'eck_fetch', arguments: { patterns: args } }),
  'link':        (args) => ({ name: 'eck_snapshot', arguments: { isLinkedProject: true, linkDepth: args[0] !== undefined ? parseInt(args[0], 10) : 0 } }),
  'profile':     (args) => args[0] ? ({ name: 'eck_snapshot', arguments: { profile: args.join(',') } }) : ({ name: 'eck_snapshot', arguments: { profile: true } }),
  'booklm':      () => ({ name: 'eck_snapshot', arguments: { notebooklm: 'scout' } }),
  'notelm':      () => ({ name: 'eck_snapshot', arguments: { notebooklm: 'architect' } }),
  'notebook':    (args) => {
    if (args[0] === 'link') return { name: 'eck_snapshot', arguments: { notebooklm: 'link', linkDepth: args[1] !== undefined ? parseInt(args[1], 10) : 0 } };
    if (args[0] === 'scout') return { name: 'eck_snapshot', arguments: { notebooklm: 'scout', linkDepth: args[1] !== undefined ? parseInt(args[1], 10) : 0 } };
    return { name: 'eck_snapshot', arguments: { notebooklm: 'hybrid' } };
  },
  'telemetry':   (args) => ({ name: 'eck_telemetry', arguments: { action: args[0] } }),
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

[AI AGENTS: PURE JSON/MCP INTERFACE ACTIVE]
This CLI is designed to be operated by AI agents using JSON payloads.
  - eck_snapshot    : { profile, skeleton, jas, link, linkDepth }
  - eck_update      : Delta snapshot
  - eck_scout       : { depth: 0-9 }
  - eck_fetch       : { patterns: [] }
  - eck_setup_mcp   : Configure MCP servers
  - eck_detect      : Detect project type
  - eck_doctor      : Health check

[HUMAN COMMANDS: SHORTHANDS]
Ranked by frequency of use:

  1. eck-snapshot snapshot          Full project snapshot
  2. eck-snapshot update            Delta update (changed files only)
                                     --base <snapshot.md> : Compare against an old snapshot file
  3. eck-snapshot profile [name]    Snapshot filtered by profile (from .eck/profiles.json)
                                     No arg = list available profiles
                                     Example: eck-snapshot profile backend
                                     Multiple: eck-snapshot profile backend,api
  4. eck-snapshot scout [0-9]       Scout external repo. Depths:
                                      0: Tree only (default)
                                      1-4: Truncated (10, 30, 60, 100 lines)
                                      5: Skeleton (Signatures only)
                                      6: Skeleton + docs
                                      7-9: Full content (500, 1000, unlimited)
  5. eck-snapshot fetch <glob>      Fetch specific files (e.g., "src/**/*.js")
  6. eck-snapshot link [0-9]        Linked companion snapshot (same depths)
  7. eck-snapshot booklm            Export for NotebookLM (Scout - fetch generator)
  8. eck-snapshot notelm            Export for NotebookLM (Architect - experimental)
  9. eck-snapshot notebook          Export for NotebookLM (Primary Project)
       eck-snapshot notebook link 5   Export Linked Project for NotebookLM (chunked)
       eck-snapshot notebook scout 5  Export Scouted Project for NotebookLM (chunked)
 10. eck-snapshot setup-mcp         Configure AI agents (Claude Code, OpenCode)
 10. eck-snapshot detect            Detect project type and active filters
 11. eck-snapshot doctor            Check project health and stubs

[FEEDBACK]
  eck-snapshot -e "message"     Send feedback/ideas to developers (read by AI)
  eck-snapshot -E "message"     Send urgent bug report

[DATENSCHUTZ / PRIVACY]
  We respect your privacy. By default, eck-snapshot collects anonymous usage counts
  and crash logs to improve the tool. NO source code or sensitive data is ever sent.
  To completely disable background telemetry:
    eck-snapshot telemetry disable
  To re-enable it:
    eck-snapshot telemetry enable
`;

  program
    .name('eck-snapshot')
    .version(pkg.version)
    .addHelpText('before', helpGuide)
    .argument('[payload]', 'JSON string representing the MCP tool call')
    .option('-e, --feedback <message>', 'Send feedback or report an issue to developers')
    .option('-E, --urgent-feedback <message>', 'Send urgent feedback to developers')
    .action(async (payloadStr, options) => {
      const globalConfig = await getGlobalConfig();

      // --- Handle Feedback Flags ---
      if (options.feedback || options.urgentFeedback) {
        const msg = options.feedback || options.urgentFeedback;
        const type = options.urgentFeedback ? 'URGENT' : 'NORMAL';
        const queuePath = path.join(process.cwd(), '.eck', 'telemetry_queue.json');

        let queue = { instanceId: globalConfig.instanceId, feedback: [], usage: {}, errors: [] };
        try {
          const existing = JSON.parse(await fs.readFile(queuePath, 'utf-8'));
          queue = { ...queue, ...existing };
        } catch(e) { /* no existing queue */ }

        queue.feedback.push({ type, message: msg, date: new Date().toISOString() });

        await fs.mkdir(path.dirname(queuePath), { recursive: true }).catch(() => {});
        await ensureSnapshotsInGitignore(process.cwd()).catch(() => {});
        await fs.writeFile(queuePath, JSON.stringify(queue, null, 2));

        console.log(chalk.green('Feedback saved locally. It will be sent to developers during the next telemetry sync.'));
        console.log(chalk.gray('(Note: Messages are processed by AI for developers)'));
        return;
      }

      // Default behavior for human users: empty call = full snapshot
      if (!payloadStr) {
        console.log(chalk.cyan('🚀 No arguments provided. Defaulting to full repository snapshot...'));
        console.log(chalk.gray('💡 Run `eck-snapshot -h` to see all available JSON tools.\n'));
        payloadStr = '{"name": "eck_snapshot", "arguments": {}}';
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

      // --- Handle Telemetry Config Command ---
      if (toolName === 'eck_telemetry') {
        if (args.action === 'disable') {
          await setGlobalConfig({ telemetryEnabled: false });
          console.log(chalk.yellow('Background telemetry has been disabled.'));
        } else if (args.action === 'enable') {
          await setGlobalConfig({ telemetryEnabled: true });
          console.log(chalk.green('Background telemetry has been enabled. Thank you for supporting the project!'));
        } else {
          console.log(chalk.blue(`Telemetry is currently: ${globalConfig.telemetryEnabled ? 'ENABLED' : 'DISABLED'}`));
          console.log(chalk.gray(`Instance ID: ${globalConfig.instanceId}`));
        }
        return;
      }

      const cwd = process.cwd();
      const queuePath = path.join(cwd, '.eck', 'telemetry_queue.json');

      try {
        // --- Track Usage Locally (Guarded by Privacy Opt-in) ---
        if (globalConfig.telemetryEnabled) {
          try {
            let queue = { instanceId: globalConfig.instanceId, feedback: [], usage: {}, errors: [] };
            try {
              const existing = JSON.parse(await fs.readFile(queuePath, 'utf-8'));
              queue = { ...queue, ...existing };
            } catch(e) { /* no existing queue */ }
            queue.usage[toolName] = (queue.usage[toolName] || 0) + 1;
            await fs.mkdir(path.dirname(queuePath), { recursive: true }).catch(() => {});
            await ensureSnapshotsInGitignore(cwd).catch(() => {});
            await fs.writeFile(queuePath, JSON.stringify(queue, null, 2));
          } catch(e) { /* ignore tracking errors */ }
        }

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
        // --- Track Errors Locally (Guarded by Privacy Opt-in) ---
        if (globalConfig.telemetryEnabled) {
          try {
            let queue = { instanceId: globalConfig.instanceId, feedback: [], usage: {}, errors: [] };
            try {
              const existing = JSON.parse(await fs.readFile(queuePath, 'utf-8'));
              queue = { ...queue, ...existing };
            } catch(e) { /* no existing queue */ }
            queue.errors.push({ tool: toolName, error: err.message, date: new Date().toISOString() });
            await fs.mkdir(path.dirname(queuePath), { recursive: true }).catch(() => {});
            await ensureSnapshotsInGitignore(cwd).catch(() => {});
            await fs.writeFile(queuePath, JSON.stringify(queue, null, 2));
          } catch(e) { /* ignore tracking errors */ }
        }

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
