import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import micromatch from 'micromatch';
import isBinaryPath from 'is-binary-path';
import {
  scanDirectoryRecursively,
  generateDirectoryTree,
  generateTimestamp,
  readFileWithSizeCheck,
  parseSize,
  loadGitignore
} from '../../utils/fileUtils.js';
import { loadSetupConfig } from '../../config.js';
import { getDepthConfig, DEPTH_SCALE } from '../../core/depthConfig.js';
import { skeletonize } from '../../core/skeletonizer.js';

export async function runReconTool(payload) {
  const toolName = payload.name;
  const args = payload.arguments || {};

  if (toolName === 'eck_scout') {
    const depth = args.depth !== undefined ? parseInt(args.depth, 10) : 0;
    await runScout(depth);
  } else if (toolName === 'eck_fetch') {
    if (!args.patterns || !Array.isArray(args.patterns)) {
      console.log(chalk.red('❌ Error: eck_fetch requires an array of "patterns" in arguments.'));
      return;
    }
    await runFetch(args.patterns);
  }
}

async function runScout(depth = 0) {
  const depthCfg = getDepthConfig(depth);
  const depthInfo = DEPTH_SCALE[depth] || DEPTH_SCALE[0];
  console.log(chalk.blue(`🕵️ Scouting repository (depth ${depth}: ${depthInfo.mode})...`));
  try {
    const repoPath = process.cwd();
    const repoName = path.basename(repoPath);
    const setupConfig = await loadSetupConfig();
    const config = { ...setupConfig.fileFiltering, ...setupConfig.performance };

    // Use a deep maxDepth for scout so the AI can see the full structure
    config.maxDepth = 15;

    const gitignore = await loadGitignore(repoPath);
    const rawFiles = await scanDirectoryRecursively(repoPath, config, repoPath);
    const allFiles = rawFiles.filter(f => {
      const normalized = f.replace(/\\/g, '/');
      return !gitignore.ignores(normalized) && !isBinaryPath(f);
    });
    const directoryTree = await generateDirectoryTree(repoPath, '', allFiles, 0, config.maxDepth, config);

    // Build file contents section if depth > 0
    let fileContentSection = '';
    if (!depthCfg.skipContent) {
      const maxFileSize = parseSize(config.maxFileSize || '10MB');
      let processedCount = 0;

      for (const file of allFiles) {
        try {
          const fullPath = path.join(repoPath, file);
          let content = await readFileWithSizeCheck(fullPath, maxFileSize);

          // Apply skeletonization
          if (depthCfg.skeleton) {
            content = await skeletonize(content, file, { preserveDocs: depthCfg.preserveDocs !== false });
          }

          // Apply line truncation
          if (depthCfg.maxLinesPerFile && depthCfg.maxLinesPerFile > 0) {
            const lines = content.split('\n');
            if (lines.length > depthCfg.maxLinesPerFile) {
              content = lines.slice(0, depthCfg.maxLinesPerFile).join('\n');
              content += `\n// ... truncated (${lines.length - depthCfg.maxLinesPerFile} more lines)`;
            }
          }

          fileContentSection += `--- File: /${file} ---\n\n\`\`\`\n${content}\n\`\`\`\n\n`;
          processedCount++;
        } catch (e) {
          fileContentSection += `--- File: /${file} ---\n\n[ERROR: ${e.message}]\n\n`;
        }
      }

      console.log(chalk.gray(`   Processed ${processedCount} files at depth ${depth}`));
    }

    const timestamp = generateTimestamp();
    const suffix = depth > 0 ? `_d${depth}` : '';
    const filename = `scout_tree_${repoName}_${timestamp}${suffix}.md`;

    const depthScaleTable = DEPTH_SCALE.map(d => `| ${d.depth} | ${d.mode} | ${d.description} |`).join('\n');

    let outputContent = `# ⚠️ EXTERNAL REPOSITORY SCOUT: [${repoName}]

**CRITICAL INSTRUCTION FOR AI:** You are currently working on your primary project. The data below is strictly for REFERENCE from an external repository named \`${repoName}\`. DO NOT assume the role of architect for this repository. DO NOT attempt to write code for this repository.

**Depth:** ${depth} (${depthInfo.mode} — ${depthInfo.description})

## How to request more data from this repository
Use the \`scout\` command with a higher depth level, or \`fetch\` for specific files:

**Scout with depth (0-9):**
\`\`\`bash
eck-snapshot scout 5    # skeleton mode
eck-snapshot scout 9    # full content
\`\`\`

**Fetch specific files:**
\`\`\`bash
eck-snapshot fetch "src/**/*.js" "README.md"
\`\`\`

**⚠️ IMPORTANT: Tree paths are easy to misread.** If \`fetch\` returns fewer files than you requested, you likely got the path wrong. Do NOT guess exact paths from the tree — use glob patterns instead:
- Instead of \`"plugins/mcp-integration/examples/stdio-server.json"\` use \`"**/mcp-integration/examples/stdio-server.json"\`
- Instead of \`"src/utils/helper.js"\` use \`"**/helper.js"\`
- Use \`"**/<filename>"\` to find a file anywhere in the tree regardless of nesting depth.

**Depth scale:**
| Depth | Mode | Description |
|-------|------|-------------|
${depthScaleTable}

## Directory Structure
\`\`\`text
${directoryTree}
\`\`\`
`;

    if (fileContentSection) {
      outputContent += `\n## File Contents (depth ${depth}: ${depthInfo.mode})\n\n${fileContentSection}`;
    }

    await fs.mkdir(path.join(repoPath, '.eck', 'scouts'), { recursive: true });
    const outputPath = path.join(repoPath, '.eck', 'scouts', filename);
    await fs.writeFile(outputPath, outputContent, 'utf-8');

    console.log(chalk.green(`✅ Scout complete. Saved to: .eck/scouts/${filename}`));
  } catch (error) {
    console.error(chalk.red(`❌ Scout failed: ${error.message}`));
  }
}

async function runFetch(patterns) {
  console.log(chalk.blue(`🚚 Fetching files matching patterns: ${patterns.join(', ')}...`));
  try {
    const repoPath = process.cwd();
    const repoName = path.basename(repoPath);
    const setupConfig = await loadSetupConfig();
    const config = { ...setupConfig.fileFiltering, ...setupConfig.performance };

    const gitignore = await loadGitignore(repoPath);
    const rawFiles = await scanDirectoryRecursively(repoPath, config, repoPath);
    const allFiles = rawFiles.filter(f => {
      const normalized = f.replace(/\\/g, '/');
      return !gitignore.ignores(normalized) && !isBinaryPath(f);
    });
    const matchedFiles = micromatch(allFiles, patterns);

    if (matchedFiles.length === 0) {
      console.log(chalk.yellow('⚠️ No files matched the requested patterns.'));
      return;
    }

    let fileContentStr = '';
    let fetchedCount = 0;
    const maxFileSize = parseSize(config.maxFileSize || '10MB');

    for (const file of matchedFiles) {
      try {
        const fullPath = path.join(repoPath, file);
        const content = await readFileWithSizeCheck(fullPath, maxFileSize);
        fileContentStr += `--- File: /${file} ---\n\n\`\`\`\n${content}\n\`\`\`\n\n`;
        fetchedCount++;
      } catch (e) {
        fileContentStr += `--- File: /${file} ---\n\n[ERROR: ${e.message}]\n\n`;
      }
    }

    const timestamp = generateTimestamp();
    const filename = `scout_data_${repoName}_${timestamp}.md`;

    // Check how many patterns actually matched at least one file
    const matchedPatternCount = patterns.filter(p => micromatch(allFiles, [p]).length > 0).length;
    const missedCount = patterns.length - matchedPatternCount;
    const missedWarning = missedCount > 0 ? `\n**⚠️ ${missedCount} of ${patterns.length} requested patterns returned no results.** You likely misread the directory tree. Re-check the tree carefully and retry with glob patterns like \`"**/<filename>"\` to match files regardless of nesting depth.\n` : '';

    const finalContent = `# ⚠️ SCOUT FETCH RESULTS: [${repoName}]

Here are the file contents you requested from the external repository. Use this to inform your work on your primary project.
${missedWarning}
${fileContentStr}
`;

    await fs.mkdir(path.join(repoPath, '.eck', 'scouts'), { recursive: true });
    const outputPath = path.join(repoPath, '.eck', 'scouts', filename);
    await fs.writeFile(outputPath, finalContent, 'utf-8');

    console.log(chalk.green(`✅ Fetched ${fetchedCount} files. Saved to: .eck/scouts/${filename}`));
  } catch (error) {
    console.error(chalk.red(`❌ Fetch failed: ${error.message}`));
  }
}
