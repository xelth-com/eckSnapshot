import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import ignore from 'ignore';
import { detectProjectType, getProjectSpecificFiltering } from './projectDetector.js';

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

export async function scanDirectoryRecursively(dirPath, config, relativeTo = dirPath, projectType = null) {
  const files = [];
  
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
      
      if (effectiveConfig.dirsToIgnore.some(dir => 
        entry.name === dir.replace('/', '') || 
        relativePath.startsWith(dir)
      )) {
        continue;
      }
      
      if (!effectiveConfig.includeHidden && entry.name.startsWith('.')) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const subFiles = await scanDirectoryRecursively(fullPath, effectiveConfig, relativeTo, projectType);
        files.push(...subFiles);
      } else {
        if (effectiveConfig.extensionsToIgnore.includes(path.extname(entry.name)) ||
            matchesPattern(relativePath, effectiveConfig.filesToIgnore)) {
          continue;
        }
        
        files.push(relativePath);
      }
    }
  } catch (error) {
    console.warn(`⚠️ Warning: Could not read directory: ${dirPath} - ${error.message}`);
  }
  
  return files;
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
  const entryToAdd = 'snapshots/';
  const comment = '# Added by eck-snapshot to prevent committing snapshots';
  
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

/**
 * Automatically initializes the .eck manifest directory with template files
 * @param {string} projectPath - Path to the project
 */
export async function initializeEckManifest(projectPath) {
  const eckDir = path.join(projectPath, '.eck');
  
  try {
    // Check if .eck directory already exists
    try {
      const eckStats = await fs.stat(eckDir);
      if (eckStats.isDirectory()) {
        // Directory already exists, no need to initialize
        return;
      }
    } catch (error) {
      // Directory doesn't exist, we'll create it
    }
    
    // Create .eck directory
    await fs.mkdir(eckDir, { recursive: true });
    console.log('📋 Initializing .eck manifest directory...');
    
    // Template files with their content
    const templateFiles = [
      {
        name: 'CONTEXT.md',
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
    
    // Create each template file
    for (const file of templateFiles) {
      const filePath = path.join(eckDir, file.name);
      await fs.writeFile(filePath, file.content);
      console.log(`   ✅ Created ${file.name}`);
    }
    
    console.log('📋 .eck manifest initialized! Edit the files to provide project-specific context.');
    
  } catch (error) {
    // Silently fail - don't break the snapshot process if manifest initialization fails
    console.warn(`⚠️  Warning: Could not initialize .eck manifest: ${error.message}`);
  }
}