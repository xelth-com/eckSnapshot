import path from 'path';
import {
  getProjectFiles,
  loadGitignore,
  matchesPattern,
  isBinaryFile,
  readFileWithSizeCheck,
  readMlModelMetadata,
  parseSize,
  formatSize
} from '../utils/fileUtils.js';
import { detectProjectType, getProjectSpecificFiltering, getAllDetectedTypes } from '../utils/projectDetector.js';
import { skeletonize } from './skeletonizer.js';

/**
 * Shared snapshot compilation core.
 * Explains WHY this module exists: file discovery, ignore-rule merging, binary
 * sniffing, depth rendering, and artifact metrics were copy-pasted across
 * createSnapshot.js, updateSnapshot.js, recon.js, and generateProfileGuide.js
 * (6 copies of ML_EXTENSIONS alone). The copies had already drifted: truncation
 * markers differed, and updateSnapshot merged filters for a single detected
 * project type while createSnapshot merged all types. Centralizing the pipeline
 * makes filter behavior provably identical across every command.
 */

/**
 * Supported machine learning model file extensions for metadata extraction.
 * Explains WHY it exists: Centralizes the known list of binary extensions that
 * are eligible for structural header peek extraction rather than extension-based skipping.
 * @type {string[]}
 */
export const ML_EXTENSIONS = ['.safetensors', '.onnx', '.pt', '.pth', '.h5', '.pb', '.bin', '.ckpt', '.gguf'];

/**
 * Checks if a given file has an ML model extension format.
 * Explains WHY it exists: Provides a single source of truth for downstream file streams
 * to determine whether a given path qualifies as an ML model for targeted header peeking.
 *
 * @param {string} filePath - Path to the target file
 * @returns {boolean} True if the extension is matching an eligible ML format
 */
export function isMlModelFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ML_EXTENSIONS.includes(ext);
}

/**
 * Merges global + project-type-specific filtering rules into one effective config.
 * Explains WHY it exists: every snapshot-producing command needs the same
 * dirsToIgnore/filesToIgnore/extensionsToIgnore merge; before extraction the block
 * was duplicated 6+ times and one copy (updateSnapshot) silently used only the
 * primary detected type, breaking polyglot monorepo filtering on delta updates.
 *
 * @param {string} repoPath - Absolute path to the repository
 * @param {object} baseConfig - Base config (typically fileFiltering + performance from setup.json)
 * @param {string[]|null} [projectTypes=null] - Pre-detected types; when null, detection runs internally
 * @returns {Promise<object>} New config object with merged ignore lists (input is not mutated)
 */
export async function resolveEffectiveConfig(repoPath, baseConfig, projectTypes = null) {
  let allTypes = projectTypes;
  if (!allTypes) {
    const projectDetection = await detectProjectType(repoPath);
    allTypes = getAllDetectedTypes(projectDetection);
  }
  if (!allTypes || allTypes.length === 0) {
    return { ...baseConfig };
  }
  const projectSpecific = await getProjectSpecificFiltering(allTypes);
  return {
    ...baseConfig,
    dirsToIgnore: [...(baseConfig.dirsToIgnore || []), ...(projectSpecific.dirsToIgnore || [])],
    filesToIgnore: [...(baseConfig.filesToIgnore || []), ...(projectSpecific.filesToIgnore || [])],
    extensionsToIgnore: [...(baseConfig.extensionsToIgnore || []), ...(projectSpecific.extensionsToIgnore || [])]
  };
}

/**
 * Discovers candidate files and applies the canonical filter chain:
 * getProjectFiles → gitignore → filesToIgnore patterns → content-aware binary sniff,
 * with an opt-in ML-peek bypass for model files.
 * Explains WHY it exists: this is THE single source of truth for "which files are
 * in scope" — previously each command re-implemented the chain and they disagreed
 * on ordering and on which checks ran at all.
 *
 * @param {string} repoPath - Absolute path to the repository
 * @param {object} config - Effective config (see resolveEffectiveConfig)
 * @param {object} [opts]
 * @param {boolean} [opts.mlPeek=false] - When true, ML model files survive the binary filter
 * @returns {Promise<string[]>} Repo-relative paths that passed every filter
 */
export async function discoverFiles(repoPath, config, { mlPeek = false } = {}) {
  const allFiles = await getProjectFiles(repoPath, config);
  const gitignore = await loadGitignore(repoPath);

  const keepFlags = await Promise.all(allFiles.map(async (f) => {
    const normalized = f.replace(/\\/g, '/');
    if (gitignore.ignores(normalized)) return false;
    if (config.filesToIgnore && matchesPattern(normalized, config.filesToIgnore)) return false;
    const isMl = mlPeek && isMlModelFile(f);
    if (!isMl && await isBinaryFile(path.join(repoPath, f))) return false;
    return true;
  }));

  return allFiles.filter((_, i) => keepFlags[i]);
}

/**
 * Renders one file's content at a given depth level:
 * size-checked read (or ML metadata peek) → skeletonize → line truncation.
 * Explains WHY it exists: the depth pipeline was duplicated between recon and
 * generateProfileGuide and had already drifted — one truncation marker reported
 * the omitted line count, the other didn't. Errors are thrown, not swallowed,
 * so each caller keeps its own error-reporting policy.
 *
 * @param {string} repoPath - Absolute path to the repository
 * @param {string} file - Repo-relative file path
 * @param {object} depthCfg - Depth config from getDepthConfig (skeleton/preserveDocs/maxLinesPerFile)
 * @param {object} config - Effective config (for maxFileSize)
 * @param {object} [opts]
 * @param {boolean} [opts.mlPeek=false] - When true, ML model files yield header metadata
 * @returns {Promise<string>} Rendered content
 */
export async function renderFileAtDepth(repoPath, file, depthCfg, config, { mlPeek = false } = {}) {
  const fullPath = path.join(repoPath, file);
  const maxFileSize = parseSize(config.maxFileSize || '10MB');

  let content;
  if (mlPeek && isMlModelFile(file)) {
    content = await readMlModelMetadata(fullPath);
  } else {
    content = await readFileWithSizeCheck(fullPath, maxFileSize);
  }

  if (depthCfg.skeleton) {
    content = await skeletonize(content, file, { preserveDocs: depthCfg.preserveDocs !== false });
  }

  if (depthCfg.maxLinesPerFile && depthCfg.maxLinesPerFile > 0) {
    const lines = content.split('\n');
    if (lines.length > depthCfg.maxLinesPerFile) {
      content = lines.slice(0, depthCfg.maxLinesPerFile).join('\n')
        + `\n// ... truncated (${lines.length - depthCfg.maxLinesPerFile} more lines)`;
    }
  }

  return content;
}

/**
 * Computes the standard size + approximate-token metrics for a generated artifact.
 * Explains WHY it exists: the same byte/token math was inlined in three commands
 * with slightly different size formatting. Returns values instead of printing so
 * each command keeps its own console styling.
 *
 * @param {string} content - The artifact text
 * @returns {{sizeBytes: number, sizeStr: string, approxTokens: number, tokensStr: string}}
 */
export function computeArtifactMetrics(content) {
  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  const sizeStr = formatSize(sizeBytes);
  const approxTokens = Math.round(content.length / 4);
  const tokensStr = approxTokens < 1000 ? `${approxTokens}` : `${(approxTokens / 1000).toFixed(1)}k`;
  return { sizeBytes, sizeStr, approxTokens, tokensStr };
}
