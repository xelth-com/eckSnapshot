import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import { dispatchAnalysisTask } from '../../services/dispatcherService.js';
import { parseSnapshotContent, parseSize, formatSize } from '../../utils/fileUtils.js';

function extractJson(text) {
  const match = text.match(/```(json)?([\s\S]*?)```/);
  if (match && match[2]) {
    return match[2].trim();
  }
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return text.substring(firstBracket, lastBracket + 1).trim();
  }
  return text.trim();
}

export async function pruneSnapshot(snapshotFile, options) {
  const spinner = ora('Starting snapshot pruning process...').start();
  try {
    const targetSize = parseSize(options.targetSize);
    spinner.text = `Reading snapshot file: ${snapshotFile}`;
    const snapshotContent = await fs.readFile(snapshotFile, 'utf-8');
    const snapshotHeader = snapshotContent.split('--- File: /')[0];
    const files = parseSnapshotContent(snapshotContent);

    if (files.length === 0) {
      spinner.warn('No files found in the snapshot.');
      return;
    }

    const currentSize = Buffer.byteLength(snapshotContent, 'utf-8');
    if (currentSize <= targetSize) {
      spinner.succeed(`Snapshot is already smaller than the target size. (${formatSize(currentSize)} < ${formatSize(targetSize)})`);
      return;
    }

    spinner.text = 'Asking AI to rank files by importance...';
    const filePaths = files.map(f => f.path);
    const prompt = `You are a software architect. Given the following list of file paths from a project snapshot, rank them by importance for understanding the project's core functionality. The most critical files (e.g., entry points, core logic, configurations) should be first. Your output MUST be ONLY a JSON array of strings, with the file paths in ranked order. Do not add any other text.\n\nFILE LIST:\n${JSON.stringify(filePaths, null, 2)}`;

    const aiResponseObject = await dispatchAnalysisTask(prompt);
    const rawText = aiResponseObject.result || aiResponseObject.response_text;
    const cleanedJson = extractJson(rawText);

    let rankedFiles;
    try {
      rankedFiles = JSON.parse(cleanedJson);
      if (!Array.isArray(rankedFiles) || rankedFiles.some(item => typeof item !== 'string')) {
        throw new Error('AI response is not an array of strings.');
      }
    } catch (e) {
      spinner.fail(`Failed to parse AI's file ranking: ${e.message}`);
      console.error('Received from AI:', cleanedJson);
      return;
    }

    spinner.text = 'Building pruned snapshot...';
    const fileMap = new Map(files.map(f => [f.path, f.content]));
    let newSnapshotContent = snapshotHeader;
    let newSize = Buffer.byteLength(newSnapshotContent, 'utf-8');
    let filesIncluded = 0;

    for (const filePath of rankedFiles) {
      if (fileMap.has(filePath)) {
        const fileContent = fileMap.get(filePath);
        const fileEntry = `--- File: /${filePath} ---\n\n${fileContent}\n\n`;
        const entrySize = Buffer.byteLength(fileEntry, 'utf-8');

        if (newSize + entrySize > targetSize) {
          break;
        }

        newSnapshotContent += fileEntry;
        newSize += entrySize;
        filesIncluded++;
      }
    }

    const outputFilename = `${path.basename(snapshotFile, path.extname(snapshotFile))}_pruned_${options.targetSize}${path.extname(snapshotFile)}`;
    const outputPath = path.join(path.dirname(snapshotFile), outputFilename);

    await fs.writeFile(outputPath, newSnapshotContent);

    spinner.succeed('Snapshot pruning complete!');
    console.log(`- Original Size: ${formatSize(currentSize)}`);
    console.log(`- New Size: ${formatSize(newSize)}`);
    console.log(`- Files Included: ${filesIncluded} / ${files.length}`);
    console.log(`- Pruned snapshot saved to: ${outputPath}`);

  } catch (error) {
    spinner.fail(`An error occurred during pruning: ${error.message}`);
  }
}
