import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { generateDirectoryTree, ensureSnapshotsInGitignore } from '../../utils/fileUtils.js';
import { loadSetupConfig } from '../../config.js';
import { getDepthConfig } from '../../core/depthConfig.js';
import { resolveEffectiveConfig, discoverFiles, renderFileAtDepth, computeArtifactMetrics } from '../../core/snapshotBuilder.js';

/**
 * Generates an LLM prompt-guide file to help create project filtering profiles.
 * Explains WHY it exists: Combines directory mapping with skeletonized or depth-scaled
 * code contents into a single dedicated guide file to give external LLMs sufficient code context
 * for architectural division without exceeding typical context window limitations.
 * * This upgraded edition isolates the guide into the hidden `.eck/profile/` subdirectory to protect
 * the Senior Architect agent from context contamination during regular snapshots, calculates token metrics
 * immediately post-generation for execution transparency, and shifts expectations to Eck-Protocol tags.
 * * @param {string} repoPath - Absolute path to the target repository
 * @param {object} args - Arguments object containing depth parameters
 * @returns {Promise<void>}
 */
export async function generateProfileGuide(repoPath, args = {}) {
  const depth = args.depth !== undefined ? parseInt(args.depth, 10) : 5;
  const depthCfg = getDepthConfig(depth);
  const spinner = ora(`Generating profile guide prompt (depth ${depth})...`).start();

  try {
    const setupConfig = await loadSetupConfig();
    let config = { ...setupConfig.fileFiltering, ...setupConfig.performance };
    config = await resolveEffectiveConfig(repoPath, config);

    config.maxDepth = 15;
    const allFiles = await discoverFiles(repoPath, config);

    const directoryTree = await generateDirectoryTree(repoPath, '', allFiles, 0, config.maxDepth, config);

    let fileContentSection = '';
    if (!depthCfg.skipContent) {
      for (const file of allFiles) {
        try {
          const content = await renderFileAtDepth(repoPath, file, depthCfg, config);
          fileContentSection += `--- File: /${file} ---\n\`\`\`\n${content}\n\`\`\`\n\n`;
        } catch (e) {
          // Skip single file errors silently to keep the prompt clean
        }
      }
    }

    const guideContent = `# 🧠 SYSTEM PROMPT: AUTOMATIC PROFILE CONFIGURATION GENERATOR (ECK-PROTOCOL)

You are an expert Software Solutions Architect specializing in multi-stack ecosystems and polyglot monorepos. Your task is to analyze the repository codebase provided below and organize its structure into atomic development context profiles.

## OUTPUT REQUIREMENTS
You MUST return your response using **Eck-Protocol (Profile Variant)** markup tags. Do not output JSON, do not wrap the profile tags in general text, and do not add conversational explanations outside the tags.

### Required Output Format:
\`\`\`text
<profile name="profile_name">
# Description
Short clear summary of what this profile covers (e.g., Backend API services, Web interface components, Mobile UI and modules).

# Include
- glob/pattern/to/include/**

# Exclude
- optional/glob/patterns/to/exclude/**
</profile>
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

    const profileDir = path.join(repoPath, '.eck', 'profile');
    await fs.mkdir(profileDir, { recursive: true });
    await ensureSnapshotsInGitignore(repoPath);

    const outPath = path.join(profileDir, 'generation_guide.md');
    await fs.writeFile(outPath, guideContent, 'utf-8');

    spinner.succeed(`Profile generation guide created at: .eck/profile/generation_guide.md`);

    const { sizeStr, tokensStr } = computeArtifactMetrics(guideContent);

    console.log(chalk.cyan('\n📊 Context Guide Metrics:'));
    console.log(`   Size: ${sizeStr}`);
    console.log(`   Approximate Tokens: ~${tokensStr}`);
    console.log(chalk.gray('💡 Tip: If this payload exceeds your LLM context budget, rerun with a smaller depth level (e.g., depth 3 or depth 0).'));
    console.log(chalk.gray('➡  Next: paste the guide into your LLM, save its reply to a file, then run: eck-snapshot profile-import <reply-file>'));

  } catch (error) {
    spinner.fail(`Failed to generate profile guide: ${error.message}`);
    throw error;
  }
}
