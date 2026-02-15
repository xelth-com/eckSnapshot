import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';

const ANCHOR_FILE = '.eck/anchor';

export async function saveGitAnchor(repoPath) {
  try {
    const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
    const anchorPath = path.join(repoPath, ANCHOR_FILE);
    await fs.mkdir(path.dirname(anchorPath), { recursive: true });
    await fs.writeFile(anchorPath, stdout.trim());
    // console.log(`⚓ Git anchor saved: ${stdout.trim().substring(0, 7)}`);
  } catch (e) {
    // Ignore if not a git repo
  }
}

export async function getGitAnchor(repoPath) {
  try {
    const anchorPath = path.join(repoPath, ANCHOR_FILE);
    return await fs.readFile(anchorPath, 'utf-8');
  } catch (e) {
    return null;
  }
}

export async function getChangedFiles(repoPath, anchorHash) {
  try {
    const { stdout } = await execa('git', ['diff', '--name-only', anchorHash, 'HEAD'], { cwd: repoPath });
    return stdout.split('\n').filter(Boolean);
  } catch (e) {
    throw new Error(`Failed to get git diff: ${e.message}`);
  }
}

export async function getGitDiffOutput(repoPath, anchorHash, excludeFiles = []) {
  try {
    const args = ['diff', anchorHash, 'HEAD'];
    if (excludeFiles.length > 0) {
      args.push('--');
      for (const file of excludeFiles) {
        args.push(`:(exclude)${file}`);
      }
    }
    const { stdout } = await execa('git', args, { cwd: repoPath });
    return stdout;
  } catch (e) {
    return '';
  }
}
