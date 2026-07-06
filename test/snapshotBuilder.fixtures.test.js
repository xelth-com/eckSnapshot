import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { discoverFiles, renderFileAtDepth } from '../src/core/snapshotBuilder.js';
import { getDepthConfig } from '../src/core/depthConfig.js';

/**
 * SnapshotBuilder Fixture-Tree Verification Suite.
 * Explains WHY it exists: discoverFiles and renderFileAtDepth are the two filesystem-facing
 * halves of the unified snapshot pipeline (see snapshotBuilder.js header) - ignore-rule
 * layering (global hard-ignore dirs/files/globs, config-level rules, .gitignore) and
 * depth-based rendering (truncation/skeleton/full + ML-peek bypass) had no fixture coverage;
 * only the pure-function pieces (isMlModelFile, computeArtifactMetrics) were pinned in
 * snapshotBuilder.test.js. These tests build small real directory trees under the OS temp
 * dir (outside any git repo, so getProjectFiles() exercises its scanDirectoryRecursively
 * fallback rather than git ls-files) and exercise the actual fs/binary-sniffing code paths.
 */

async function writeTree(root, spec) {
  for (const [relPath, content] of Object.entries(spec)) {
    const fullPath = path.join(root, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
}

describe('SnapshotBuilder discoverFiles (fixture tree)', () => {
  let root;
  let discovered;
  let discoveredWithMlPeek;

  const config = {
    dirsToIgnore: ['dist/'],
    filesToIgnore: ['*.apikey'],
    extensionsToIgnore: ['.sqlite3']
  };

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'eck-snapshot-discover-'));
    await writeTree(root, {
      'src/index.js': 'export const value = 42;\n',
      'README.md': '# Readme\n',
      'notes': 'Plain extensionless text notes.\n',
      'node_modules/pkg/index.js': 'module.exports = {};\n',
      'dist/bundle.js': "console.log('bundle');\n",
      'logs/app.log': 'log line\n',
      'data.sqlite3': 'fake sqlite dump\n',
      'secrets.apikey': 'APIKEY=xxxx\n',
      '.gitignore': 'ignored-by-git.txt\n',
      'ignored-by-git.txt': 'should be excluded via gitignore\n'
    });
    // Extensionless binary file: a NUL byte forces the content-sniffing slow path in
    // isBinaryFile() (the extension fast path can't classify a file with no extension).
    await fs.writeFile(path.join(root, 'firmware'), Buffer.from([0x66, 0x77, 0x00, 0x01]));
    // ML "model": binary content AND an ML_EXTENSIONS-listed extension, to exercise the
    // opt-in mlPeek bypass (isBinaryFile is skipped entirely when mlPeek + isMlModelFile).
    await fs.writeFile(path.join(root, 'model.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]));

    discovered = await discoverFiles(root, config);
    discoveredWithMlPeek = await discoverFiles(root, config, { mlPeek: true });
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('keeps ordinary text files, including extensionless ones', () => {
    expect(discovered).toEqual(expect.arrayContaining(['src/index.js', 'README.md', 'notes']));
  });

  it('excludes the global hard-ignored node_modules directory', () => {
    expect(discovered).not.toEqual(expect.arrayContaining(['node_modules/pkg/index.js']));
  });

  it('excludes directories listed in config.dirsToIgnore', () => {
    expect(discovered).not.toEqual(expect.arrayContaining(['dist/bundle.js']));
  });

  it('excludes files matching the global hard-ignore glob list (*.log)', () => {
    expect(discovered).not.toEqual(expect.arrayContaining(['logs/app.log']));
  });

  it('excludes files matching config.extensionsToIgnore', () => {
    expect(discovered).not.toEqual(expect.arrayContaining(['data.sqlite3']));
  });

  it('excludes files matching config.filesToIgnore glob patterns', () => {
    expect(discovered).not.toEqual(expect.arrayContaining(['secrets.apikey']));
  });

  it('honors the repo .gitignore even outside of a git repository', () => {
    expect(discovered).not.toEqual(expect.arrayContaining(['ignored-by-git.txt']));
  });

  it('skips content-sniffed binary files that have no extension', () => {
    expect(discovered).not.toEqual(expect.arrayContaining(['firmware']));
  });

  it('skips ML model files by default (binary content, mlPeek off)', () => {
    expect(discovered).not.toEqual(expect.arrayContaining(['model.bin']));
  });

  it('keeps ML model files when the mlPeek bypass is enabled', () => {
    expect(discoveredWithMlPeek).toEqual(expect.arrayContaining(['model.bin']));
  });
});

describe('SnapshotBuilder renderFileAtDepth (fixture tree)', () => {
  let root;
  const config = {};

  const sampleJs = `/**
 * Adds two numbers together.
 */
function add(a, b) {
  const sum = a + b;
  return sum;
}

function subtract(a, b) {
  return a - b;
}
`;
  const longText = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
  const shortText = 'line 1\nline 2\nline 3\n';

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'eck-snapshot-render-'));
    await writeTree(root, {
      'sample.js': sampleJs,
      'long.txt': longText,
      'short.txt': shortText,
      'big.txt': 'x'.repeat(50)
    });
    // Fake ML model header: printable JSON-ish header followed by NUL/binary junk, so
    // readMlModelMetadata's printable-char strip has something real to clean up.
    await fs.writeFile(
      path.join(root, 'model.gguf'),
      Buffer.concat([Buffer.from('{"name":"tiny-model"}'), Buffer.from([0x00, 0x01, 0xff, 0xfe])])
    );
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns the raw file content unchanged for a tree-only depth config (no skeleton/maxLinesPerFile flags)', async () => {
    // NOTE: production callers (recon.js, generateProfileGuide.js) check depthCfg.skipContent
    // themselves and never call renderFileAtDepth at depth 0. This pins that the function
    // itself has no independent awareness of "tree" mode - it just reads the file straight
    // through when neither skeleton nor maxLinesPerFile is set on the depth config.
    const depthCfg = getDepthConfig(0);
    expect(depthCfg.skipContent).toBe(true);
    const result = await renderFileAtDepth(root, 'sample.js', depthCfg, config);
    expect(result).toBe(sampleJs);
  });

  it('truncates at maxLinesPerFile for truncated depths and appends the omitted-line-count marker', async () => {
    const depthCfg = getDepthConfig(1); // { maxLinesPerFile: 10, skeleton: false }
    const result = await renderFileAtDepth(root, 'long.txt', depthCfg, config);
    expect(result).toContain('line 10');
    expect(result).not.toContain('line 11');
    // longText ends with a trailing newline, so split('\n') yields a 16th empty-string
    // element - the omitted count is 16 - 10 = 6, not 15 - 10 = 5.
    expect(result).toContain('// ... truncated (6 more lines)');
  });

  it('does not truncate or add a marker when the file has fewer lines than maxLinesPerFile', async () => {
    const depthCfg = getDepthConfig(4); // { maxLinesPerFile: 100, skeleton: false }
    const result = await renderFileAtDepth(root, 'short.txt', depthCfg, config);
    expect(result).toBe(shortText);
    expect(result).not.toContain('truncated');
  });

  it('skeletonizes JS at depth 5 (preserveDocs=false), stripping bodies and doc comments alike', async () => {
    const depthCfg = getDepthConfig(5);
    const result = await renderFileAtDepth(root, 'sample.js', depthCfg, config);
    expect(result).not.toContain('Adds two numbers together');
    expect(result).not.toContain('const sum = a + b');
    expect(result).not.toContain('return a - b');
    expect(result).toContain('function add(a, b) {');
    expect(result).toContain('/* ... */');
  });

  it('skeletonizes JS at depth 6 (preserveDocs=true), keeping existing JSDoc but stripping bodies', async () => {
    const depthCfg = getDepthConfig(6);
    const result = await renderFileAtDepth(root, 'sample.js', depthCfg, config);
    expect(result).toContain('Adds two numbers together');
    expect(result).not.toContain('const sum = a + b');
    expect(result).not.toContain('return a - b');
    // OPEN QUESTION (documents current actual behavior, not asserted as desired):
    // a function that already has a leading JSDoc ends up with a fully empty body and NO
    // "..." placeholder at depth 6, while a function with no leading comment (subtract)
    // still gets the placeholder. See skeletonizer.js's emptyBody(): when preserveDocs is
    // true it reassigns the SAME leading-comment node objects onto body.innerComments, and
    // Babel's generator appears to treat them as already printed, so nothing renders a
    // second time inside the body.
    expect(result).toContain('function add(a, b) {}');
    expect(result).toContain('function subtract(a, b) {');
    expect(result).toContain('/* ... */');
  });

  it('returns full content (no skeletonizing) at the unlimited full depth', async () => {
    const depthCfg = getDepthConfig(9); // { skeleton: false, maxLinesPerFile: 0 }
    const result = await renderFileAtDepth(root, 'sample.js', depthCfg, config);
    expect(result).toBe(sampleJs);
  });

  it('extracts ML header metadata instead of raw content when mlPeek is enabled for an ML-extension file', async () => {
    const depthCfg = getDepthConfig(9);
    const result = await renderFileAtDepth(root, 'model.gguf', depthCfg, config, { mlPeek: true });
    expect(result).toContain('[ML MODEL METADATA EXTRACTED]');
    expect(result).toContain('Header Preview:');
    expect(result).toContain('tiny-model');
  });

  it('throws a "file too large" error instead of silently truncating when the file exceeds maxFileSize', async () => {
    const tinyConfig = { maxFileSize: '1B' };
    const depthCfg = getDepthConfig(9);
    await expect(renderFileAtDepth(root, 'big.txt', depthCfg, tinyConfig)).rejects.toThrow(/File too large/);
  });
});
