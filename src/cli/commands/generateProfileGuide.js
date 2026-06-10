import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  generateDirectoryTree,
  readFileWithSizeCheck,
  parseSize,
  loadGitignore,
  getProjectFiles,
  matchesPattern,
  ensureSnapshotsInGitignore,
  isBinaryFile
} from '../../utils/fileUtils.js';
import { detectProjectType, getProjectSpecificFiltering, getAllDetectedTypes } from '../../utils/projectDetector.js';
import { loadSetupConfig } from '../../config.js';
import { getDepthConfig } from '../../core/depthConfig.js';
import { skeletonize } from '../../core/skeletonizer.js';

/**
 * Generates an LLM prompt-guide file to help create project filtering profiles.
 * Explains WHY it exists: Combines directory mapping with skeletonized or depth-scaled
 * code contents into a single dedicated guide file to give external LLMs sufficient code context
 * for architectural division without exceeding typical context window limitations.
 * * @param {string} repoPath - Absolute path to the target repository
 * @param {object} args - Arguments object containing depth parameters
 * @returns {Promise<void>}
 */
export async function generateProfileGuide(repoPath, args = {}) {
  const depth = args.depth !== undefined ? parseInt(args.depth, 10) : 5;
  const depthCfg = getDepthConfig(depth);
  const spinner = ora(`Generating profile guide prompt (depth ${depth})...`).start();

  try {
    const repoName = path.basename(repoPath);
    const setupConfig = await loadSetupConfig();
    let config = { ...setupConfig.fileFiltering, ...setupConfig.performance };

    const projectDetection = await detectProjectType(repoPath);
    const allTypes = getAllDetectedTypes(projectDetection);
    if (allTypes && allTypes.length > 0) {
      const projectSpecific = await getProjectSpecificFiltering(allTypes);
      config = {
        ...config,
        dirsToIgnore: [...(config.dirsToIgnore || []), ...(projectSpecific.dirsToIgnore || [])],
        filesToIgnore: [...(config.filesToIgnore || []), ...(projectSpecific.filesToIgnore || [])],
        extensionsToIgnore: [...(config.extensionsToIgnore || []), ...(projectSpecific.extensionsToIgnore || [])]
      };
    }

    config.maxDepth = 15;
    let allFiles = await getProjectFiles(repoPath, config);
    const gitignore = await loadGitignore(repoPath);

    const keepFlags = await Promise.all(allFiles.map(async (f) => {
      const normalized = f.replace(/\\/g, '/');
      if (gitignore.ignores(normalized)) return false;
      if (config.filesToIgnore && matchesPattern(normalized, config.filesToIgnore)) return false;
      if (await isBinaryFile(path.join(repoPath, f))) return false;
      return true;
    }));
    allFiles = allFiles.filter((_, i) => keepFlags[i]);

    const directoryTree = await generateDirectoryTree(repoPath, '', allFiles, 0, config.maxDepth, config);

    let fileContentSection = '';
    if (!depthCfg.skipContent) {
      const maxFileSize = parseSize(config.maxFileSize || '10MB');
      for (const file of allFiles) {
        try {
          const fullPath = path.join(repoPath, file);
          let content = await readFileWithSizeCheck(fullPath, maxFileSize);

          if (depthCfg.skeleton) {
            content = await skeletonize(content, file, { preserveDocs: depthCfg.preserveDocs !== false });
          }

          if (depthCfg.maxLinesPerFile && depthCfg.maxLinesPerFile > 0) {
            const lines = content.split('\n');
            if (lines.length > depthCfg.maxLinesPerFile) {
              content = lines.slice(0, depthCfg.maxLinesPerFile).join('\n') + `\n// ... truncated`;
            }
          }

          fileContentSection += `--- File: /${file} ---\n\`\`\`\n${content}\n\`\`\`\n\n`;
        } catch (e) {
          // Skip single file errors silently to keep the prompt clean
        }
      }
    }

    const guideContent = `# 🧠 SYSTEM PROMPT: AUTOMATIC PROFILE CONFIGURATION GENERATOR

You are an expert Software Solutions Architect specializing in multi-stack ecosystems and polyglot monorepos. Your task is to analyze the repository codebase provided below and organize its structure into atomic development context profiles.

## OUTPUT REQUIREMENTS
You MUST return **ONLY** a valid JSON object matching the format below. Do not wrap it in markdown text or add any conversational explanations outside the JSON block.

\`\`\`json
{
  "profile_name": {
    "description": "Short clear summary of what this profile covers (e.g., Backend API services, Web interface components, Mobile UI and modules)",
    "include": [
      "glob/pattern/to/include/**"
    ],
    "exclude": [
      "optional/glob/patterns/to/exclude/**"
    ]
  }
}
\`\`\`

## REPOSITORY PROFILE RULES
1. **Separation of Concerns:** Separate backend modules, frontend apps, shared core frameworks, databases/migrations, or hardware/firmware sub-systems into dedicated profiles.
2. **Standard Exclusions:** Exclude non-source runtime assets, caches, and dependency tracking files if applicable.
3. **Granular Path Mapping:** Use standard glob matching features (\`**/*\`, \`src/**\`) relative to the project root.

---

## 🌳 REPOSITORY DIRECTORY STRUCTURE
\`\`\`text
${directoryTree}\`\`\`

---

## 📄 EXTRACTED SOURCE CODE SEGMENTS (DEPTH MODE: ${depthCfg.mode})
${fileContentSection || '*(No content segments extracted at depth 0)*'}
`;

    const eckDir = path.join(repoPath, '.eck');
    await fs.mkdir(eckDir, { recursive: true });
    await ensureSnapshotsInGitignore(repoPath);

    const outPath = path.join(eckDir, 'profile_generation_guide.md');
    await fs.writeFile(outPath, guideContent, 'utf-8');

    spinner.succeed(`Profile generation guide created at: .eck/profile_generation_guide.md`);
  } catch (error) {
    spinner.fail(`Failed to generate profile guide: ${error.message}`);
    throw error;
  }
}
