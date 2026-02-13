import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const SYNC_FILENAME = '.eck-sync.enc';
const ECK_DIR = '.eck';

// Files to include (relative to .eck/). Snapshots excluded intentionally.
const INCLUDE_FILES = [
  'anchor',
  'claude-mcp-config.json',
  'CONTEXT.md',
  'ENVIRONMENT.md',
  'JOURNAL.md',
  'OPERATIONS.md',
  'ROADMAP.md',
  'TECH_DEBT.md',
  'update_seq',
];

// Crypto constants
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha512';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';
const FORMAT_VERSION = 1;

// ── Password ────────────────────────────────────────────────────────

async function getPassword(action = 'encrypt') {
  const envKey = process.env.ECK_SYNC_KEY;
  if (envKey) {
    if (envKey.length < 4) throw new Error('ECK_SYNC_KEY must be at least 4 characters');
    return envKey;
  }

  const verb = action === 'encrypt' ? 'encrypt' : 'decrypt';
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: `Enter password to ${verb} .eck/ environment:`,
    mask: '*',
    validate: (input) => input.length >= 4 || 'Password must be at least 4 characters',
  }]);

  if (action === 'encrypt') {
    const { confirm } = await inquirer.prompt([{
      type: 'password',
      name: 'confirm',
      message: 'Confirm password:',
      mask: '*',
    }]);
    if (password !== confirm) throw new Error('Passwords do not match');
  }

  return password;
}

// ── Encryption ──────────────────────────────────────────────────────

function encrypt(plainBuffer, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Binary: salt(16) + iv(12) + authTag(16) + ciphertext
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

function decrypt(encBuffer, password) {
  const minSize = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;
  if (encBuffer.length < minSize) {
    throw new Error('Encrypted file is too small or corrupted');
  }

  let offset = 0;
  const salt = encBuffer.subarray(offset, offset += SALT_LENGTH);
  const iv = encBuffer.subarray(offset, offset += IV_LENGTH);
  const authTag = encBuffer.subarray(offset, offset += AUTH_TAG_LENGTH);
  const ciphertext = encBuffer.subarray(offset);

  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Decryption failed. Wrong password or corrupted file.');
  }
}

// ── Path templating ─────────────────────────────────────────────────

function templatizePaths(content, projectRoot, homeDir, filename) {
  let result = content;

  if (filename.endsWith('.json')) {
    // JSON files store backslashes escaped: C:\\Users\\...
    const projEsc = projectRoot.replace(/\\/g, '\\\\');
    const homeEsc = homeDir.replace(/\\/g, '\\\\');
    result = result.replaceAll(projEsc, '{{PROJECT_ROOT}}');
    result = result.replaceAll(homeEsc, '{{HOME}}');
  }

  // Forward-slash and raw variants
  const projFwd = projectRoot.replace(/\\/g, '/');
  const homeFwd = homeDir.replace(/\\/g, '/');
  result = result.replaceAll(projectRoot, '{{PROJECT_ROOT}}');
  result = result.replaceAll(projFwd, '{{PROJECT_ROOT}}');
  result = result.replaceAll(homeDir, '{{HOME}}');
  result = result.replaceAll(homeFwd, '{{HOME}}');

  return result;
}

function resolveTemplates(content, projectRoot, homeDir, filename) {
  let result = content;

  if (filename.endsWith('.json')) {
    // JSON needs escaped backslashes on Windows
    const projEsc = projectRoot.replace(/\\/g, '\\\\');
    const homeEsc = homeDir.replace(/\\/g, '\\\\');
    result = result.replaceAll('{{PROJECT_ROOT}}', projEsc);
    result = result.replaceAll('{{HOME}}', homeEsc);
  } else {
    result = result.replaceAll('{{PROJECT_ROOT}}', projectRoot);
    result = result.replaceAll('{{HOME}}', homeDir);
  }

  return result;
}

// ── Push ─────────────────────────────────────────────────────────────

export async function envPush(options = {}) {
  const projectRoot = process.cwd();
  const eckDir = path.join(projectRoot, ECK_DIR);
  const outputPath = path.join(projectRoot, SYNC_FILENAME);
  const homeDir = os.homedir();
  const spinner = ora();

  try {
    // Verify .eck/ exists
    spinner.start('Checking .eck/ directory...');
    try {
      await fs.access(eckDir);
    } catch {
      spinner.fail('.eck/ directory not found');
      console.log(chalk.yellow('Run eck-snapshot first to create .eck/ context files.'));
      process.exit(1);
    }
    spinner.succeed('.eck/ directory found');

    // Read included files
    spinner.start('Reading .eck/ files...');
    const payload = {
      version: FORMAT_VERSION,
      timestamp: new Date().toISOString(),
      files: {},
    };

    let fileCount = 0;
    for (const filename of INCLUDE_FILES) {
      const filePath = path.join(eckDir, filename);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const templated = templatizePaths(content, projectRoot, homeDir, filename);
        payload.files[filename] = { content: templated, encoding: 'utf8' };
        fileCount++;
        if (options.verbose) {
          console.log(chalk.gray(`  + ${filename} (${Buffer.byteLength(content)} bytes)`));
        }
      } catch {
        if (options.verbose) {
          console.log(chalk.gray(`  - ${filename} (not found, skipping)`));
        }
      }
    }

    if (fileCount === 0) {
      spinner.fail('No .eck/ files found to pack');
      process.exit(1);
    }
    spinner.succeed(`Read ${fileCount} files from .eck/`);

    // Compress
    spinner.start('Compressing...');
    const jsonStr = JSON.stringify(payload, null, 2);
    const compressed = await gzip(Buffer.from(jsonStr, 'utf-8'));
    spinner.succeed(`Compressed: ${Buffer.byteLength(jsonStr)} -> ${compressed.length} bytes`);

    // Encrypt
    const password = await getPassword('encrypt');
    spinner.start('Encrypting...');
    const encrypted = encrypt(compressed, password);
    spinner.succeed(`Encrypted: ${encrypted.length} bytes`);

    // Write
    await fs.writeFile(outputPath, encrypted);

    console.log(chalk.green.bold('\nEnvironment pushed successfully!'));
    console.log(chalk.gray(`  Files packed: ${fileCount}`));
    console.log(chalk.gray(`  Output size:  ${encrypted.length} bytes`));
    console.log(chalk.gray(`  Output file:  ${SYNC_FILENAME}`));
    console.log(chalk.yellow('\nCommit .eck-sync.enc to git to share across machines.'));

  } catch (error) {
    spinner.fail(`Push failed: ${error.message}`);
    if (options.verbose) console.error(error.stack);
    process.exit(1);
  }
}

// ── Pull ─────────────────────────────────────────────────────────────

export async function envPull(options = {}) {
  const projectRoot = process.cwd();
  const eckDir = path.join(projectRoot, ECK_DIR);
  const inputPath = path.join(projectRoot, SYNC_FILENAME);
  const homeDir = os.homedir();
  const spinner = ora();

  try {
    // Verify .eck-sync.enc exists
    spinner.start(`Checking ${SYNC_FILENAME}...`);
    try {
      await fs.access(inputPath);
    } catch {
      spinner.fail(`${SYNC_FILENAME} not found in project root`);
      console.log(chalk.yellow('Run "eck-snapshot env push" first, or pull the file from git.'));
      process.exit(1);
    }
    spinner.succeed(`${SYNC_FILENAME} found`);

    // Conflict check
    if (!options.force) {
      try {
        await fs.access(eckDir);
        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: '.eck/ directory already exists. What would you like to do?',
          choices: [
            { name: 'Overwrite existing files', value: 'overwrite' },
            { name: 'Cancel', value: 'cancel' },
          ],
        }]);
        if (action === 'cancel') {
          console.log(chalk.yellow('Pull cancelled.'));
          return;
        }
      } catch {
        // .eck/ doesn't exist, proceed
      }
    }

    // Read + decrypt
    spinner.start('Reading encrypted file...');
    const encrypted = await fs.readFile(inputPath);
    spinner.succeed(`Read ${encrypted.length} bytes`);

    const password = await getPassword('decrypt');
    spinner.start('Decrypting...');
    const compressed = decrypt(encrypted, password);
    spinner.succeed('Decrypted');

    // Decompress + parse
    spinner.start('Decompressing...');
    const jsonBuffer = await gunzip(compressed);
    const payload = JSON.parse(jsonBuffer.toString('utf-8'));
    spinner.succeed('Decompressed');

    if (payload.version !== FORMAT_VERSION) {
      throw new Error(`Unsupported format version: ${payload.version} (expected ${FORMAT_VERSION})`);
    }

    // Restore files
    await fs.mkdir(eckDir, { recursive: true });

    const fileNames = Object.keys(payload.files);
    spinner.start(`Restoring ${fileNames.length} files...`);

    for (const filename of fileNames) {
      const { content } = payload.files[filename];
      const resolved = resolveTemplates(content, projectRoot, homeDir, filename);
      await fs.writeFile(path.join(eckDir, filename), resolved, 'utf-8');
      if (options.verbose) {
        console.log(chalk.gray(`  + ${filename}`));
      }
    }
    spinner.succeed(`Restored ${fileNames.length} files to .eck/`);

    console.log(chalk.green.bold('\nEnvironment pulled successfully!'));
    console.log(chalk.gray(`  Files restored: ${fileNames.length}`));
    console.log(chalk.gray(`  Packed at:      ${payload.timestamp}`));

  } catch (error) {
    spinner.fail(`Pull failed: ${error.message}`);
    if (options.verbose) console.error(error.stack);
    process.exit(1);
  }
}
