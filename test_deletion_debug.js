import fs from 'fs/promises';
import path from 'path';
import isBinaryPath from 'is-binary-path';
import ignore from 'ignore';
import { getChangedFiles } from './src/utils/gitUtils.js';
import { loadGitignore, matchesPattern } from './src/utils/fileUtils.js';

const repoPath = process.cwd();
const anchor = '7ed08c4a791ffb6575d1a0479795fca0b3e18817';
const changedFiles = await getChangedFiles(repoPath, anchor, false);
console.log('Changed files:', changedFiles);

const gitignore = await loadGitignore(repoPath);
const config = {
  filesToIgnore: [],
  extensionsToIgnore: [],
  dirsToIgnore: [],
  maxFileSize: '1MB'
};

const cleanDirsToIgnore = (config.dirsToIgnore || []).map(d => d.replace(/\/$/, ''));

for (const filePath of changedFiles) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  console.log('\nProcessing:', normalizedPath);

  const isHidden = normalizedPath.split('/').some(part => part.startsWith('.') && part !== '.eck');
  console.log('  Is hidden:', isHidden);

  const isBinary = isBinaryPath(filePath);
  console.log('  Is binary:', isBinary);

  const pathParts = normalizedPath.split('/');
  let isIgnoredDir = false;
  for (let i = 0; i < pathParts.length - 1; i++) {
    if (cleanDirsToIgnore.includes(pathParts[i])) {
      isIgnoredDir = true;
      break;
    }
  }
  console.log('  Is ignored dir:', isIgnoredDir);

  const fileExt = path.extname(filePath);
  const matchesFilePattern = config.filesToIgnore && matchesPattern(normalizedPath, config.filesToIgnore);
  console.log('  Matches file pattern:', matchesFilePattern);
  console.log('  Extension ignored:', fileExt && config.extensionsToIgnore?.includes(fileExt));
  console.log('  Gitignore:', gitignore.ignores(normalizedPath));

  if (!isHidden && !isBinary && !isIgnoredDir && !matchesFilePattern &&
      !(fileExt && config.extensionsToIgnore?.includes(fileExt)) && !gitignore.ignores(normalizedPath)) {
    console.log('  PASSING FILTERS - checking file access');
    const fullPath = path.join(repoPath, filePath);
    try {
      await fs.access(fullPath);
      console.log('  File EXISTS in working tree');
    } catch (accessErr) {
      console.log('  File DOES NOT EXIST in working tree - should output [FILE DELETED]');
    }
  } else {
    console.log('  FILTERED OUT');
  }
}
