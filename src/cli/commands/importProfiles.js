import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { parseProfileTags } from '../../utils/eckProtocolParser.js';

/**
 * Imports profile definitions from an Eck-Protocol (Profile Variant) LLM response
 * file and merges them into the local `.eck/profiles.json`.
 * Explains WHY it exists: `generate-profile-guide` produces a prompt whose LLM answer
 * arrives as <profile> markup tags, not JSON. Without this importer the user would have
 * to hand-convert markup into profiles.json — this command closes the round-trip
 * (guide → external LLM → profile-import → ready-to-use profiles).
 *
 * @param {string} repoPath - Absolute path to the target repository
 * @param {object} args - Arguments object; `file` is the path to the saved LLM response
 * @returns {Promise<void>}
 */
export async function importProfiles(repoPath, args = {}) {
  if (!args.file) {
    console.log(chalk.red('❌ Missing "file" argument.'));
    console.log(chalk.yellow('Usage: eck-snapshot profile-import <llm-response.md>'));
    process.exit(1);
  }

  const resolved = path.resolve(repoPath, args.file);
  let text;
  try {
    text = await fs.readFile(resolved, 'utf-8');
  } catch (e) {
    console.log(chalk.red(`❌ Cannot read response file: ${resolved}`));
    process.exit(1);
  }

  const parsed = parseProfileTags(text);
  const names = Object.keys(parsed);
  if (names.length === 0) {
    console.log(chalk.red('❌ No <profile name="..."> tags found in the response file.'));
    console.log(chalk.yellow('Expected Eck-Protocol (Profile Variant) markup — see the format section in .eck/profile/generation_guide.md'));
    process.exit(1);
  }

  const emptyIncludes = names.filter(n => parsed[n].include.length === 0);
  if (emptyIncludes.length > 0) {
    console.log(chalk.yellow(`⚠️  Profiles with empty Include lists (they will match nothing): ${emptyIncludes.join(', ')}`));
  }

  const profilesPath = path.join(repoPath, '.eck', 'profiles.json');
  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(profilesPath, 'utf-8'));
  } catch (e) { /* no existing profiles.json, start fresh */ }

  const added = names.filter(n => !(n in existing));
  const updated = names.filter(n => n in existing);
  const merged = { ...existing, ...parsed };

  await fs.mkdir(path.dirname(profilesPath), { recursive: true });
  await fs.writeFile(profilesPath, JSON.stringify(merged, null, 2), 'utf-8');

  console.log(chalk.green(`✅ Imported ${names.length} profile(s) into .eck/profiles.json`));
  if (added.length > 0) console.log(`   Added:   ${chalk.green(added.join(', '))}`);
  if (updated.length > 0) console.log(`   Updated: ${chalk.cyan(updated.join(', '))}`);
  console.log(chalk.gray('💡 Run `eck-snapshot profile` to list profiles, or `eck-snapshot profile <name>` to snapshot a slice.'));
}
