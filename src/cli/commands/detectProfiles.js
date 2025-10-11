import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import { dispatchAnalysisTask } from '../../services/dispatcherService.js';
import { scanDirectoryRecursively, generateDirectoryTree, initializeEckManifest, loadConfig } from '../../utils/fileUtils.js';
import { loadSetupConfig } from '../../config.js';

/**
 * Extracts a JSON object from a string that might contain markdown wrappers or log output.
 * Finds the first opening brace '{' and the last closing brace '}' to extract the JSON.
 */
function extractJson(text) {
  const match = text.match(/```(json)?([\s\S]*?)```/);
  if (match && match[2]) {
    return match[2].trim();
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1).trim();
  }

  return text.trim();
}

/**
 * Scans the project structure, saves the directory tree to a file, and asks an AI to generate
 * context profiles, saving them to .eck/profiles.json.
 */
export async function detectProfiles(repoPath, options) {
  const spinner = ora('Initializing and scanning project structure...').start();
  try {
    await initializeEckManifest(repoPath);

    const setupConfig = await loadSetupConfig();
    const userConfig = await loadConfig(options.config);
    const config = {
        ...userConfig,
        ...setupConfig.fileFiltering,
        ...setupConfig.performance
    };

    const allFiles = await scanDirectoryRecursively(repoPath, config, repoPath);
    spinner.text = 'Generating directory tree...';
    const dirTree = await generateDirectoryTree(repoPath, '', allFiles, 0, config.maxDepth, config);

    if (!dirTree) {
        throw new Error('Failed to generate directory tree or project is empty.');
    }

    spinner.text = 'Saving directory tree to file...';
    const treeFilePath = path.join(repoPath, '.eck', 'directory_tree_for_profiling.md');
    await fs.writeFile(treeFilePath, dirTree);

    const prompt = `You are a code architect. Based on the file directory tree found in the file at './.eck/directory_tree_for_profiling.md', please identify logical 'context profiles' for splitting the project.
Your output MUST be ONLY a valid JSON object.
The keys of the object MUST be the profile names (e.g., 'frontend', 'backend', 'core-logic', 'docs').
The values MUST be an object containing 'include' and 'exclude' arrays of glob patterns.
Example: {"frontend": {"include": ["packages/ui/**"], "exclude": []}, "docs": {"include": ["docs/**"], "exclude": []}}.
DO NOT add any conversational text, introductory sentences, or explanations. Your entire response must be ONLY the JSON object.`;

    spinner.text = 'Asking AI to analyze directory tree and detect profiles...';
    const aiResponseObject = await dispatchAnalysisTask(prompt);
    const rawText = aiResponseObject.result || aiResponseObject.response_text;

    if (!rawText || typeof rawText.replace !== 'function') {
      throw new Error(`AI returned invalid content type: ${typeof rawText}`);
    }

    spinner.text = 'Saving generated profiles...';
    const cleanedJson = extractJson(rawText);
    let parsedProfiles;
    try {
        parsedProfiles = JSON.parse(cleanedJson);
    } catch (e) {
        console.error('\nInvalid JSON received from AI:', cleanedJson);
        throw new Error(`AI returned invalid JSON: ${e.message}`);
    }

    const outputPath = path.join(repoPath, '.eck', 'profiles.json');
    await fs.writeFile(outputPath, JSON.stringify(parsedProfiles, null, 2));

    const profileKeys = Object.keys(parsedProfiles);
    spinner.succeed(`Successfully detected and saved ${profileKeys.length} profiles to ${outputPath}`);

    console.log('\n✨ Detected Profiles:');
    console.log('---------------------------');
    for (const profileName of profileKeys) {
        console.log(`  - ${profileName}`);
    }
    console.log('\nYou can now use these profile names with the --profile flag.');

  } catch (error) {
    spinner.fail(`Failed to detect profiles: ${error.message}`);
  }
}
