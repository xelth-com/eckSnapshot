import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import ignore from 'ignore';
import { detectProjectType, getProjectSpecificFiltering } from './projectDetector.js';
import { executePrompt as askClaude } from '../services/claudeCliService.js';
import { getProfile, loadSetupConfig } from '../config.js';
import micromatch from 'micromatch';
import { minimatch } from 'minimatch';

export function parseSize(sizeStr) {
  const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) throw new Error(`Invalid size format: ${sizeStr}`);
  const [, size, unit = 'B'] = match;
  return Math.floor(parseFloat(size) * units[unit.toUpperCase()]);
}

export function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function matchesPattern(filePath, patterns) {
  const fileName = path.basename(filePath);
  return patterns.some(pattern => {
    const regexPattern = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
    try {
      const regex = new RegExp(regexPattern);
      return regex.test(fileName);
    } catch (e) {
      console.warn(`⚠️ Invalid regex pattern in config: "${pattern}"`);
      return false;
    }
  });
}

/**
 * Checks if a file matches confidential patterns using minimatch
 * @param {string} fileName - The file name to check
 * @param {array} patterns - Array of glob patterns to match against
 * @returns {boolean} True if the file matches any pattern
 */
function matchesConfidentialPattern(fileName, patterns) {
  return patterns.some(pattern => minimatch(fileName, pattern, { nocase: true }));
}

/**
 * Applies smart filtering for files within the .eck directory.
 * Includes documentation files while excluding confidential files.
 * @param {string} fileName - The file name to check
 * @param {object} eckConfig - The eckDirectoryFiltering config object
 * @returns {object} { include: boolean, isConfidential: boolean }
 */
export function applyEckDirectoryFiltering(fileName, eckConfig) {
  if (!eckConfig || !eckConfig.enabled) {
    return { include: false, isConfidential: false }; // .eck filtering disabled, exclude all
  }

  const { confidentialPatterns = [], alwaysIncludePatterns = [] } = eckConfig;

  // First check if file matches confidential patterns
  const isConfidential = matchesConfidentialPattern(fileName, confidentialPatterns);
  if (isConfidential) {
    return { include: false, isConfidential: true };
  }

  // Check if file matches always-include patterns
  if (matchesPattern(fileName, alwaysIncludePatterns)) {
    return { include: true, isConfidential: false };
  }

  // Default: exclude files not in the include list
  return { include: false, isConfidential: false };
}

export async function checkGitAvailability() {
  try {
    await execa('git', ['--version']);
  } catch (error) {
    throw new Error('Git is not installed or not available in PATH');
  }
}

export async function checkGitRepository(repoPath) {
  try {
    await execa('git', ['rev-parse', '--git-dir'], { cwd: repoPath });
    return true;
  } catch (error) {
    return false;
  }
}

export async function scanDirectoryRecursively(dirPath, config, relativeTo = dirPath, projectType = null, trackConfidential = false) {
  const files = [];
  const confidentialFiles = [];

  // Get project-specific filtering if not provided
  if (!projectType) {
    const detection = await detectProjectType(relativeTo);
    projectType = detection.type;
  }

  const projectSpecific = await getProjectSpecificFiltering(projectType);

  // Merge project-specific filters with global config
  const effectiveConfig = {
    ...config,
    dirsToIgnore: [...(config.dirsToIgnore || []), ...(projectSpecific.dirsToIgnore || [])],
    filesToIgnore: [...(config.filesToIgnore || []), ...(projectSpecific.filesToIgnore || [])],
    extensionsToIgnore: [...(config.extensionsToIgnore || []), ...(projectSpecific.extensionsToIgnore || [])]
  };

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

      // Special handling for .eck directory - never ignore it when tracking confidential files
      const isEckDirectory = entry.name === '.eck' && entry.isDirectory();
      const isInsideEck = relativePath.startsWith('.eck/');

      if (effectiveConfig.dirsToIgnore.some(dir =>
        entry.name === dir.replace('/', '') ||
        relativePath.startsWith(dir)
      ) && !isEckDirectory && !isInsideEck) {
        continue;
      }

      if (!effectiveConfig.includeHidden && entry.name.startsWith('.') && !isEckDirectory && !isInsideEck) {
        continue;
      }

      if (entry.isDirectory()) {
        const subResult = await scanDirectoryRecursively(fullPath, effectiveConfig, relativeTo, projectType, trackConfidential);
        if (trackConfidential) {
          files.push(...subResult.files);
          confidentialFiles.push(...subResult.confidentialFiles);
        } else {
          files.push(...subResult);
        }
      } else {
        // Apply smart filtering for files inside .eck directory
        if (isInsideEck) {
          const eckConfig = effectiveConfig.eckDirectoryFiltering;
          const filterResult = applyEckDirectoryFiltering(entry.name, eckConfig);

          if (trackConfidential && filterResult.isConfidential) {
            confidentialFiles.push(relativePath);
          } else if (filterResult.include) {
            files.push(relativePath);
          }
        } else {
          // Normal filtering for non-.eck files
          if (effectiveConfig.extensionsToIgnore.includes(path.extname(entry.name)) ||
              matchesPattern(relativePath, effectiveConfig.filesToIgnore)) {
            continue;
          }
          files.push(relativePath);
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️ Warning: Could not read directory: ${dirPath} - ${error.message}`);
  }

  return trackConfidential ? { files, confidentialFiles } : files;
}

export async function loadGitignore(repoPath) {
  try {
    const gitignoreContent = await fs.readFile(path.join(repoPath, '.gitignore'), 'utf-8');
    const ig = ignore().add(gitignoreContent);
    console.log('✅ .gitignore patterns loaded');
    return ig;
  } catch {
    console.log('ℹ️ No .gitignore file found or could not be read');
    return ignore();
  }
}

export async function readFileWithSizeCheck(filePath, maxFileSize) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > maxFileSize) {
      throw new Error(`File too large: ${formatSize(stats.size)}`);
    }
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.message.includes('too large')) throw error;
    throw new Error(`Could not read file: ${error.message}`);
  }
}

export async function generateDirectoryTree(dir, prefix = '', allFiles, depth = 0, maxDepth = 10, config) {
  if (depth > maxDepth) return '';
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const sortedEntries = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    let tree = '';
    const validEntries = [];
    
    for (const entry of sortedEntries) {
      if (config.dirsToIgnore.some(d => entry.name.includes(d.replace('/', '')))) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
      if (entry.isDirectory() || allFiles.includes(relativePath)) {
        validEntries.push({ entry, fullPath, relativePath });
      }
    }
    
    for (let i = 0; i < validEntries.length; i++) {
      const { entry, fullPath, relativePath } = validEntries[i];
      const isLast = i === validEntries.length - 1;
      
      const connector = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      
      if (entry.isDirectory()) {
        tree += `${prefix}${connector}${entry.name}/\n`;
        tree += await generateDirectoryTree(fullPath, nextPrefix, allFiles, depth + 1, maxDepth, config);
      } else {
        tree += `${prefix}${connector}${entry.name}\n`;
      }
    }
    
    return tree;
  } catch (error) {
    console.warn(`⚠️ Warning: Could not read directory: ${dir}`);
    return '';
  }
}

export function parseSnapshotContent(content) {
  const files = [];
  const fileRegex = /--- File: \/(.+) ---/g;
  const sections = content.split(fileRegex);
  
  for (let i = 1; i < sections.length; i += 2) {
    const filePath = sections[i].trim();
    let fileContent = sections[i + 1] || '';

    if (fileContent.startsWith('\n\n')) {
      fileContent = fileContent.substring(2);
    }
    if (fileContent.endsWith('\n\n')) {
      fileContent = fileContent.substring(0, fileContent.length - 2);
    }
    
    files.push({ path: filePath, content: fileContent });
  }

  return files;
}

export function filterFilesToRestore(files, options) {
  let filtered = files;
  
  if (options.include) {
    const includePatterns = Array.isArray(options.include) ?
      options.include : [options.include];
    filtered = filtered.filter(file => 
      includePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file.path);
      })
    );
  }
  
  if (options.exclude) {
    const excludePatterns = Array.isArray(options.exclude) ? 
      options.exclude : [options.exclude];
    filtered = filtered.filter(file => 
      !excludePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file.path);
      })
    );
  }
  
  return filtered;
}

export function validateFilePaths(files, targetDir) {
  const invalidFiles = [];
  
  for (const file of files) {
    const normalizedPath = path.normalize(file.path);
    if (normalizedPath.includes('..') || 
        normalizedPath.startsWith('/') || 
        normalizedPath.includes('\0') ||
        /[<>:"|?*]/.test(normalizedPath)) {
      invalidFiles.push(file.path);
    }
  }
  
  return invalidFiles;
}

export async function loadConfig(configPath) {
  const { DEFAULT_CONFIG } = await import('../config.js');
  let config = { ...DEFAULT_CONFIG };
  
  if (configPath) {
    try {
      const configModule = await import(path.resolve(configPath));
      config = { ...config, ...configModule.default };
      console.log(`✅ Configuration loaded from: ${configPath}`);
    } catch (error) {
      console.warn(`⚠️ Warning: Could not load config file: ${configPath}`);
    }
  } else {
    const possibleConfigs = [
      '.ecksnapshot.config.js',
      '.ecksnapshot.config.mjs',
      'ecksnapshot.config.js'
    ];
    
    for (const configFile of possibleConfigs) {
      try {
        await fs.access(configFile);
        const configModule = await import(path.resolve(configFile));
        config = { ...config, ...configModule.default };
        console.log(`✅ Configuration loaded from: ${configFile}`);
        break;
      } catch {
        // Config file doesn't exist, continue
      }
    }
  }
  
  return config;
}

export function generateTimestamp() {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD}_${hh}-${mm}-${ss}`;
}

export function sanitizeForFilename(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove invalid characters
    .substring(0, 50); // Truncate to a reasonable length
}

/**
 * Displays project detection information in a user-friendly format
 * @param {object} detection - Project detection result
 */
export function displayProjectInfo(detection) {
  console.log('\n🔍 Project Detection Results:');
  console.log(`   Type: ${detection.type} (confidence: ${(detection.confidence * 100).toFixed(0)}%)`);
  
  if (detection.details) {
    const details = detection.details;
    
    switch (detection.type) {
      case 'android':
        console.log(`   Language: ${details.language || 'unknown'}`);
        if (details.packageName) {
          console.log(`   Package: ${details.packageName}`);
        }
        if (details.sourceDirs && details.sourceDirs.length > 0) {
          console.log(`   Source dirs: ${details.sourceDirs.join(', ')}`);
        }
        if (details.libFiles && details.libFiles.length > 0) {
          console.log(`   Libraries: ${details.libFiles.length} .aar/.jar files`);
        }
        break;
        
      case 'nodejs':
        if (details.name) {
          console.log(`   Package: ${details.name}@${details.version || '?'}`);
        }
        if (details.framework) {
          console.log(`   Framework: ${details.framework}`);
        }
        if (details.hasTypescript) {
          console.log(`   TypeScript: enabled`);
        }
        break;
        
      case 'nodejs-monorepo':
        if (details.name) {
          console.log(`   Project: ${details.name}@${details.version || '?'}`);
        }
        if (details.monorepoTool) {
          console.log(`   Monorepo tool: ${details.monorepoTool}`);
        }
        if (details.workspaceCount) {
          console.log(`   Workspaces: ${details.workspaceCount}`);
        }
        if (details.framework) {
          console.log(`   Framework: ${details.framework}`);
        }
        break;
        
      case 'python-poetry':
      case 'python-pip':
      case 'python-conda':
        if (details.name) {
          console.log(`   Project: ${details.name}@${details.version || '?'}`);
        }
        if (details.packageManager) {
          console.log(`   Package manager: ${details.packageManager}`);
        }
        if (details.dependencies) {
          console.log(`   Dependencies: ${details.dependencies}`);
        }
        if (details.hasVirtualEnv) {
          console.log(`   Virtual environment: detected`);
        }
        break;
        
      case 'django':
        if (details.name) {
          console.log(`   Project: ${details.name}`);
        }
        console.log(`   Framework: Django`);
        if (details.djangoApps && details.djangoApps.length > 0) {
          console.log(`   Django apps: ${details.djangoApps.join(', ')}`);
        }
        if (details.hasVirtualEnv) {
          console.log(`   Virtual environment: detected`);
        }
        break;
        
      case 'flask':
        if (details.name) {
          console.log(`   Project: ${details.name}`);
        }
        console.log(`   Framework: Flask`);
        if (details.hasVirtualEnv) {
          console.log(`   Virtual environment: detected`);
        }
        break;
        
      case 'rust':
        if (details.name) {
          console.log(`   Package: ${details.name}@${details.version || '?'}`);
        }
        if (details.edition) {
          console.log(`   Rust edition: ${details.edition}`);
        }
        if (details.isWorkspace) {
          console.log(`   Cargo workspace: detected`);
        }
        break;
        
      case 'go':
        if (details.module) {
          console.log(`   Module: ${details.module}`);
        }
        if (details.goVersion) {
          console.log(`   Go version: ${details.goVersion}`);
        }
        break;
        
      case 'dotnet':
        if (details.language) {
          console.log(`   Language: ${details.language}`);
        }
        if (details.projectFiles && details.projectFiles.length > 0) {
          console.log(`   Project files: ${details.projectFiles.join(', ')}`);
        }
        if (details.hasSolution) {
          console.log(`   Solution: detected`);
        }
        break;
        
      case 'flutter':
        if (details.name) {
          console.log(`   App: ${details.name}@${details.version || '?'}`);
        }
        break;
        
      case 'react-native':
        if (details.name) {
          console.log(`   App: ${details.name}@${details.version || '?'}`);
        }
        if (details.reactNativeVersion) {
          console.log(`   React Native: ${details.reactNativeVersion}`);
        }
        break;
    }
  }
  
  if (detection.allDetections && detection.allDetections.length > 1) {
    console.log(`   Other possibilities: ${detection.allDetections.slice(1).map(d => d.type).join(', ')}`);
  }
  
  console.log('');
}

/**
 * Parses YAML-like content from ENVIRONMENT.md
 * @param {string} content - The raw content of ENVIRONMENT.md
 * @returns {object} Parsed key-value pairs
 */
function parseEnvironmentYaml(content) {
  const result = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');
      result[key.trim()] = cleanValue;
    }
  }
  
  return result;
}

/**
 * Loads and processes the .eck directory manifest
 * @param {string} repoPath - Path to the repository
 * @returns {Promise<object|null>} The eck manifest object or null if no .eck directory
 */
export async function loadProjectEckManifest(repoPath) {
  const eckDir = path.join(repoPath, '.eck');
  
  try {
    // Check if .eck directory exists
    const eckStats = await fs.stat(eckDir);
    if (!eckStats.isDirectory()) {
      return null;
    }
    
    console.log('📋 Found .eck directory - loading project manifest...');
    
    const manifest = {
      environment: {},
      context: '',
      operations: '',
      journal: ''
    };
    
    // Define the files to check
    const files = [
      { name: 'ENVIRONMENT.md', key: 'environment', parser: parseEnvironmentYaml },
      { name: 'CONTEXT.md', key: 'context', parser: content => content },
      { name: 'OPERATIONS.md', key: 'operations', parser: content => content },
      { name: 'JOURNAL.md', key: 'journal', parser: content => content }
    ];
    
    // Process each file
    for (const file of files) {
      const filePath = path.join(eckDir, file.name);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        manifest[file.key] = file.parser(content.trim());
        console.log(`   ✅ Loaded ${file.name}`);
      } catch (error) {
        // File doesn't exist or can't be read - that's okay, use default
        console.log(`   ⚠️  ${file.name} not found or unreadable`);
      }
    }
    
    return manifest;
  } catch (error) {
    // .eck directory doesn't exist - that's normal
    return null;
  }
}

/**
 * Ensures that 'snapshots/' is added to the target project's .gitignore file
 * @param {string} repoPath - Path to the repository
 */
export async function ensureSnapshotsInGitignore(repoPath) {
  const gitignorePath = path.join(repoPath, '.gitignore');
  const entryToAdd = '.eck/';
  const comment = '# Added by eck-snapshot to ignore metadata directory';
  
  try {
    // Check if the repo is a Git repository first
    const isGitRepo = await checkGitRepository(repoPath);
    if (!isGitRepo) {
      // Not a Git repo, skip .gitignore modification
      return;
    }
    
    let gitignoreContent = '';
    let fileExists = true;
    
    // Try to read existing .gitignore file
    try {
      gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    } catch (error) {
      // File doesn't exist, we'll create it
      fileExists = false;
      gitignoreContent = '';
    }
    
    // Check if 'snapshots/' is already in the file
    const lines = gitignoreContent.split('\n');
    const hasSnapshotsEntry = lines.some(line => line.trim() === entryToAdd);
    
    if (!hasSnapshotsEntry) {
      // Add the entry
      let newContent = gitignoreContent;
      
      // If file exists and doesn't end with newline, add one
      if (fileExists && gitignoreContent && !gitignoreContent.endsWith('\n')) {
        newContent += '\n';
      }
      
      // Add comment and entry
      if (fileExists && gitignoreContent) {
        newContent += '\n';
      }
      newContent += comment + '\n' + entryToAdd + '\n';
      
      await fs.writeFile(gitignorePath, newContent);
      console.log(`✅ Added '${entryToAdd}' to .gitignore`);
    }
  } catch (error) {
    // Silently fail - don't break the snapshot process if gitignore update fails
    console.warn(`⚠️  Warning: Could not update .gitignore: ${error.message}`);
  }
}

// Helper function to determine if a string is a glob pattern
function isGlob(str) {
  return str.includes('*') || str.includes('?') || str.includes('{');
}

/**
 * Applies advanced profile filtering (multi-profile, exclusion, and ad-hoc globs) to a file list.
 */
export async function applyProfileFilter(allFiles, profileString, repoPath) {
  const profileParts = profileString.split(',').map(p => p.trim()).filter(Boolean);
  
  const includeGlobs = [];
  const excludeGlobs = [];
  const includeNames = [];
  const excludeNames = [];

  // Step 1: Differentiate between profile names and ad-hoc glob patterns
  for (const part of profileParts) {
    const isNegative = part.startsWith('-');
    const pattern = isNegative ? part.substring(1) : part;

    if (isGlob(pattern)) {
      if (isNegative) {
        excludeGlobs.push(pattern);
      } else {
        includeGlobs.push(pattern);
      }
    } else {
      if (isNegative) {
        excludeNames.push(pattern);
      } else {
        includeNames.push(pattern);
      }
    }
  }

  let workingFiles = [];
  let finalIncludes = [...includeGlobs];
  let finalExcludes = [...excludeGlobs];

  // Step 2: Load patterns from specified profile names
  const allProfileNames = [...new Set([...includeNames, ...excludeNames])];
  const profiles = new Map();
  for (const name of allProfileNames) {
    const profile = await getProfile(name, repoPath);
    if (profile) {
      profiles.set(name, profile);
    } else {
      // This is an ad-hoc glob, not a profile, so no warning is needed.
      if (!isGlob(name)) {
        console.warn(`⚠️ Warning: Profile '${name}' not found and will be skipped.`);
      }
    }
  }

  for (const name of includeNames) {
    if (profiles.has(name)) {
      finalIncludes.push(...(profiles.get(name).include || []));
      finalExcludes.push(...(profiles.get(name).exclude || []));
    }
  }
  for (const name of excludeNames) {
    if (profiles.has(name)) {
      finalExcludes.push(...(profiles.get(name).include || []));
    }
  }
  
  // Step 3: Apply the filtering logic
  if (finalIncludes.length > 0) {
    workingFiles = micromatch(allFiles, finalIncludes);
  } else if (includeNames.length > 0 && includeGlobs.length === 0) {
    workingFiles = [];
  } else {
    workingFiles = allFiles;
  }

  if (finalExcludes.length > 0) {
    workingFiles = micromatch.not(workingFiles, finalExcludes);
  }

  return workingFiles;
}

/**
 * Automatically initializes the .eck manifest directory, attempting dynamic generation via Claude.
 * @param {string} projectPath - Path to the project
 */
export async function initializeEckManifest(projectPath) {
  const eckDir = path.join(projectPath, '.eck');

  // Load setup configuration to check AI generation settings
  let aiGenerationEnabled = false;
  try {
    const setupConfig = await loadSetupConfig();
    aiGenerationEnabled = setupConfig?.aiInstructions?.manifestInitialization?.aiGenerationEnabled ?? false;
  } catch (error) {
    // If setup config fails to load, default to disabled
    console.warn(`   ⚠️ Could not load setup config: ${error.message}. AI generation disabled.`);
  }

  try {
    // Check if .eck directory already exists and has all required files
    let needsInitialization = false;
    try {
      const eckStats = await fs.stat(eckDir);
      if (eckStats.isDirectory()) {
        // Directory exists, check if all required files are present
        const requiredFiles = ['ENVIRONMENT.md', 'CONTEXT.md', 'OPERATIONS.md', 'JOURNAL.md'];
        for (const fileName of requiredFiles) {
          try {
            await fs.stat(path.join(eckDir, fileName));
          } catch (error) {
            console.log(`   ℹ️ Missing ${fileName}, initialization needed`);
            needsInitialization = true;
            break;
          }
        }
        if (!needsInitialization) {
          // All files exist, no need to initialize
          return;
        }
      }
    } catch (error) {
      // Directory doesn't exist, we'll create it
      needsInitialization = true;
    }
    
    // Create .eck directory
    await fs.mkdir(eckDir, { recursive: true });
    console.log('📋 Initializing .eck manifest directory...');

    // --- NEW HYBRID LOGIC --- 
    // 1. Run static analysis first to gather facts.
    let staticFacts = {};
    try {
      staticFacts = await detectProjectType(projectPath);
      console.log(`   🔍 Static analysis complete. Detected type: ${staticFacts.type}`);
    } catch (e) {
      console.warn(`   ⚠️ Static project detection failed: ${e.message}. Proceeding with generic prompts.`);
    }

    // Prevent AI hallucination by removing low-confidence "other possibilities"
    if (staticFacts && staticFacts.allDetections) {
      delete staticFacts.allDetections;
    }
    
    const staticFactsJson = JSON.stringify(staticFacts, null, 2);
    // --- END NEW LOGIC ---
    
    // Template files with their content
    const templateFiles = [
      {
        name: 'ENVIRONMENT.md',
        prompt: `Given these static project analysis facts:\n${staticFactsJson}\n\nGenerate the raw YAML key-value content for an .eck/ENVIRONMENT.md file. Only include detected facts. DO NOT add any keys that are not present in the facts. DO NOT add conversational text or markdown wrappers. Your response MUST start directly with a YAML key (e.g., 'project_type: ...').`,
        content: `# This file is for environment overrides. Add agent-specific settings here.\nagent_id: local_dev\n` // Simple static fallback
      },
      {
        name: 'CONTEXT.md',
        prompt: `Given these static project analysis facts:\n${staticFactsJson}\n\nGenerate the raw Markdown content ONLY for a .eck/CONTEXT.md file. Use the facts to write ## Description, ## Architecture, and ## Key Technologies. DO NOT add conversational text (like "Here is the file..."). Your response MUST start *directly* with the '# Project Overview' heading.`,
        content: `# Project Overview

## Description
Brief description of what this project does and its main purpose.

## Architecture
High-level overview of the system architecture, key components, and how they interact.

## Key Technologies
- Technology 1
- Technology 2
- Technology 3

## Important Notes
Any crucial information that developers should know when working on this project.
`
      },
      {
        name: 'OPERATIONS.md',
        prompt: `Given these static project analysis facts (especially package.json scripts):
${staticFactsJson}

Generate the raw Markdown content ONLY for a .eck/OPERATIONS.md file. DO NOT add conversational text. Your response MUST start *directly* with the '# Common Operations' heading. List commands for ## Development Setup, ## Running the Project, and ## Testing.`,
        content: `# Common Operations

## Development Setup
\`\`\`bash
# Setup commands
npm install
# or yarn install
\`\`\`

## Running the Project
\`\`\`bash
# Development mode
npm run dev

# Production build
npm run build
\`\`\`

## Testing
\`\`\`bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
\`\`\`

## Deployment
\`\`\`bash
# Deployment commands
npm run deploy
\`\`\`

## Troubleshooting
Common issues and their solutions.
`
      },
      {
        name: 'JOURNAL.md',
        content: `# Development Journal

## Recent Changes
Track significant changes, decisions, and progress here.

---

### YYYY-MM-DD - Project Started
- Initial project setup
- Added basic structure
`
      },
      {
        name: 'ROADMAP.md',
        prompt: `Given these static project analysis facts:\n${staticFactsJson}\n\nGenerate the raw Markdown content ONLY for a .eck/ROADMAP.md file. DO NOT add conversational text. Start *directly* with '# Project Roadmap'. Propose 1-2 *plausible* placeholder items for ## Current Sprint/Phase and ## Next Phase based on the project type.`,
        content: `# Project Roadmap

## Current Sprint/Phase
- [ ] Feature 1
- [ ] Feature 2
- [ ] Bug fix 1

## Next Phase
- [ ] Future feature 1
- [ ] Future feature 2

## Long-term Goals
- [ ] Major milestone 1
- [ ] Major milestone 2

## Completed
- [x] Project initialization
`
      },
      {
        name: 'TECH_DEBT.md',
        prompt: `Generate the raw Markdown content ONLY for a .eck/TECH_DEBT.md file. DO NOT add conversational text. Start *directly* with '# Technical Debt'. Propose 1-2 *common* placeholder items for ## Code Quality Issues and ## Refactoring Opportunities.`,
        content: `# Technical Debt

## Current Technical Debt
Track technical debt, refactoring needs, and code quality issues.

### Code Quality Issues
- Issue 1: Description and priority
- Issue 2: Description and priority

### Refactoring Opportunities
- Opportunity 1: Description and impact
- Opportunity 2: Description and impact

### Performance Issues
- Performance issue 1: Description and impact
- Performance issue 2: Description and impact

### Security Concerns
- Security concern 1: Description and priority
- Security concern 2: Description and priority

## Resolved
- [x] Resolved issue 1
`
      }
    ];
    
    // Create each template file (only if it doesn't exist)
    for (const file of templateFiles) {
      const filePath = path.join(eckDir, file.name);
      
      // Skip if file already exists
      try {
        await fs.stat(filePath);
        console.log(`   ✅ ${file.name} already exists, skipping`);
        continue;
      } catch (error) {
        // File doesn't exist, create it
      }
      
      let fileContent = file.content; // Start with fallback
      let generatedByAI = false;

      // For files with a prompt, try to dynamically generate (only if enabled)
      if (file.prompt && aiGenerationEnabled) {
        try {
          console.log(`   🧠 Attempting to auto-generate ${file.name} via Claude...`);
          const aiResponseObject = await askClaude(file.prompt); // Use the prompt
          const rawText = aiResponseObject.result; // Handle Claude response

          if (!rawText || typeof rawText.replace !== 'function') {
             throw new Error(`AI returned invalid content type: ${typeof rawText}`);
          }

          // Basic cleanup of potential markdown code blocks from Claude
          const cleanedResponse = rawText.replace(/^```(markdown|yaml)?\n|```$/g, '').trim();

          if (cleanedResponse) {
            fileContent = cleanedResponse;
            generatedByAI = true;
            console.log(`   ✨ AI successfully generated ${file.name}`);
          } else {
            throw new Error('AI returned empty content.');
          }
        } catch (error) {
          console.warn(`   ⚠️ AI generation failed for ${file.name}: ${error.message}. Using static template.`);
          // fileContent is already set to the fallback
        }
      }
      
      await fs.writeFile(filePath, fileContent);
      if (!generatedByAI) {
          console.log(`   ✅ Created ${file.name} (static template)`);
      }
    }
    
    console.log('📋 .eck manifest initialized! Edit the files to provide project-specific context.');
    
  } catch (error) {
    // Silently fail - don't break the snapshot process if manifest initialization fails
    console.warn(`⚠️  Warning: Could not initialize .eck manifest: ${error.message}`);
  }
}
