import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import ignore from 'ignore';
import { detectProjectType, getProjectSpecificFiltering, getAllDetectedTypes } from './projectDetector.js';
import { getProfile, loadSetupConfig } from '../config.js';
import micromatch from 'micromatch';
import { minimatch } from 'minimatch';

/**
 * Scanner for detecting and redacting secrets (API keys, tokens)
 */
export const SecretScanner = {
  patterns: [
    // Service-specific patterns
    { name: 'GitHub Token', regex: /gh[pous]_[a-zA-Z0-9]{36}/g },
    { name: 'AWS Access Key', regex: /(?:AKIA|ASIA)[0-9A-Z]{16}/g },
    { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{32,}/g },
    { name: 'Stripe Secret Key', regex: /sk_live_[0-9a-zA-Z]{24}/g },
    { name: 'Google API Key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
    { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z\-]{10,}/g },
    { name: 'NPM Token', regex: /npm_[a-zA-Z0-9]{36}/g },
    { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
    // Generic high-entropy patterns near sensitive keywords
    {
      name: 'Generic Secret',
      regex: /(?:api[_-]?key|secret|password|token|auth|pwd|credential)\s*[:=]\s*["']([a-zA-Z0-9\-_.]{16,})["']/gi
    }
  ],

  /**
   * Calculates Shannon Entropy of a string
   */
  calculateEntropy(str) {
    const len = str.length;
    const frequencies = Array.from(str).reduce((freq, c) => {
      freq[c] = (freq[c] || 0) + 1;
      return freq;
    }, {});
    return Object.values(frequencies).reduce((sum, f) => {
      const p = f / len;
      return sum - (p * Math.log2(p));
    }, 0);
  },

  /**
   * Scans content and replaces detected secrets with a placeholder
   * @param {string} content - File content to scan
   * @param {string} filePath - Path for logging context
   * @returns {{content: string, found: string[]}} Redacted content and list of found secret types
   */
  redact(content, filePath) {
    let redactedContent = content;
    const foundSecrets = [];

    for (const pattern of this.patterns) {
      // Reset regex lastIndex for global patterns
      pattern.regex.lastIndex = 0;

      const matches = [...content.matchAll(pattern.regex)];
      if (matches.length > 0) {
        for (const match of matches) {
          // For generic pattern, use captured group; for specific patterns, use full match
          const secretValue = match[1] || match[0];
          const placeholder = `[REDACTED_${pattern.name.replace(/\s+/g, '_').toUpperCase()}]`;
          redactedContent = redactedContent.replace(secretValue, placeholder);
          foundSecrets.push(pattern.name);
        }
      }
    }

    // Second pass: Shannon Entropy check for arbitrary hardcoded secrets
    // Look for long strings assigned to variable names that might be keys
    const entropyRegex = /(?:const|let|var|set|export|define)\s+([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*)\s*=\s*["']([a-zA-Z0-9+/=_-]{20,128})["']/gi;
    const entropyMatches = [...redactedContent.matchAll(entropyRegex)];
    
    for (const match of entropyMatches) {
      const secretValue = match[2];
      // Check entropy - random base64 usually has entropy > 4.5
      if (this.calculateEntropy(secretValue) > 4.5 && !secretValue.includes('REDACTED')) {
        const placeholder = `[REDACTED_HIGH_ENTROPY_SECRET]`;
        redactedContent = redactedContent.replace(secretValue, placeholder);
        foundSecrets.push('High Entropy Secret');
      }
    }

    return {
      content: redactedContent,
      found: [...new Set(foundSecrets)]
    };
  }
};

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

export async function checkGitRepository(repoPath) {
  try {
    await execa('git', ['rev-parse', '--git-dir'], { cwd: repoPath });
    return true;
  } catch (error) {
    return false;
  }
}

export async function scanDirectoryRecursively(dirPath, config, relativeTo = dirPath, projectTypes = null, trackConfidential = false) {
  const files = [];
  const confidentialFiles = [];

  // Get project-specific filtering for ALL detected types (polyglot monorepo support)
  if (!projectTypes) {
    const detection = await detectProjectType(relativeTo);
    projectTypes = getAllDetectedTypes(detection);
  }

  const projectSpecific = await getProjectSpecificFiltering(projectTypes);

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

      // --- GLOBAL HARD IGNORES (Zero-Config Safety) ---
      // Explicitly skip heavy/system directories and lockfiles everywhere
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name === '.idea' ||
            entry.name === '.vscode' ||
            entry.name === '.gradle' ||
            entry.name === 'build' ||
            entry.name === '__pycache__') {
          continue;
        }
      } else {
        if (entry.name === 'package-lock.json' ||
            entry.name === 'yarn.lock' ||
            entry.name === 'pnpm-lock.yaml' ||
            entry.name === 'go.sum') {
          continue;
        }
      }
      // -----------------------------------------------

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
        const subResult = await scanDirectoryRecursively(fullPath, effectiveConfig, relativeTo, projectTypes, trackConfidential);
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
  const ig = ignore();

  try {
    const gitignoreContent = await fs.readFile(path.join(repoPath, '.gitignore'), 'utf-8');
    ig.add(gitignoreContent);
  } catch {
    console.log('ℹ️ No .gitignore file found or could not be read');
  }

  try {
    const eckignoreContent = await fs.readFile(path.join(repoPath, '.eckignore'), 'utf-8');
    ig.add(eckignoreContent);
  } catch {
    // .eckignore is optional, silently skip if missing
  }

  return ig;
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
      // --- GLOBAL HARD IGNORES ---
      if (entry.isDirectory() && (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.idea' ||
        entry.name === '.vscode' ||
        entry.name === '.gradle' ||
        entry.name === 'build' ||
        entry.name === '__pycache__'
      )) continue;
      if (!entry.isDirectory() && (
        entry.name === 'package-lock.json' ||
        entry.name === 'yarn.lock' ||
        entry.name === 'pnpm-lock.yaml' ||
        entry.name === 'go.sum'
      )) continue;
      // ---------------------------

      // Skip hidden directories and files (starting with '.')
      // EXCEPT: Allow .eck to be visible
      if (entry.name.startsWith('.') && entry.name !== '.eck') {
        continue;
      }
      // Only skip directories (not files) and use exact name match to avoid
      // substring false positives (e.g., "build/" hiding "build.gradle.kts")
      if (entry.isDirectory() && config.dirsToIgnore.some(d => entry.name === d.replace('/', ''))) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');

      // FORCE VISIBILITY for .eck files in the tree
      // Even if they are gitignored (not in allFiles), we want the Architect to see they exist
      const isInsideEck = relativePath.startsWith('.eck/') || relativePath === '.eck';

      if (entry.isDirectory() || allFiles.includes(relativePath) || isInsideEck) {
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

        // RECURSION CONTROL:
        // If we are currently inside .eck, do NOT recurse deeper into subdirectories (like snapshots, logs).
        // We want to see that 'snapshots/' exists, but not list its contents.
        const isInsideEckRoot = path.basename(dir) === '.eck';

        if (!isInsideEckRoot) {
          tree += await generateDirectoryTree(fullPath, nextPrefix, allFiles, depth + 1, maxDepth, config);
        }
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
  const YY = String(now.getFullYear()).slice(-2);
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  // Compact format: YY-MM-DD_HH-mm (no seconds)
  return `${YY}-${MM}-${DD}_${hh}-${mm}`;
}

/**
 * Generates a short repo name with capitalized first 3 and last 2 characters
 * Example: "Snapshot" -> "SnaOt", "MyProject" -> "MyPrjt"
 * @param {string} repoName - The repository name
 * @returns {string} Shortened repo name (Start3 + End2)
 */
export function getShortRepoName(repoName) {
  if (!repoName) return '';
  if (repoName.length <= 5) {
    return repoName.toUpperCase();
  }
  const start = repoName.substring(0, 3);
  const end = repoName.substring(repoName.length - 2);
  return (start + end).toUpperCase();
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
    const otherTypes = detection.allDetections.slice(1).map(d => d.type).join(', ');
    console.log(`   Polyglot filtering: applying rules for [${detection.type}, ${otherTypes}]`);
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
    const eckStats = await fs.stat(eckDir);
    if (!eckStats.isDirectory()) {
      return null;
    }

    console.log('📋 Found .eck directory - dynamically loading project manifest...');

    const manifest = {
      environment: {},
      context: '',
      operations: '',
      journal: '',
      roadmap: '',
      techDebt: '',
      dynamicFiles: {}
    };

    const entries = await fs.readdir(eckDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }

      // Ignore secret/credential files AND internal tool files
      const lower = entry.name.toLowerCase();
      if (
        lower.includes('secret') ||
        lower.includes('credential') ||
        lower.includes('server_access') ||
        entry.name === 'profile_generation_guide.md'
      ) {
        continue;
      }

      const filePath = path.join(eckDir, entry.name);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const cleanContent = content.trim();

        // Map well-known files to their dedicated manifest keys
        switch (entry.name) {
          case 'ENVIRONMENT.md':
            try {
              manifest.environment = parseEnvironmentYaml(cleanContent);
            } catch (e) {
              manifest.dynamicFiles[entry.name] = cleanContent;
            }
            break;
          case 'CONTEXT.md':
            manifest.context = cleanContent;
            break;
          case 'OPERATIONS.md':
            manifest.operations = cleanContent;
            break;
          case 'JOURNAL.md':
            manifest.journal = cleanContent;
            break;
          case 'ROADMAP.md':
            manifest.roadmap = cleanContent;
            break;
          case 'TECH_DEBT.md':
            manifest.techDebt = cleanContent;
            break;
          default:
            // All other .md files (ARCHITECTURE, RUNTIME_STATE, DEPLOY_CHECKLIST, etc.)
            manifest.dynamicFiles[entry.name] = cleanContent;
            break;
        }
        console.log(`   ✅ Loaded ${entry.name}`);
      } catch (error) {
        console.log(`   ⚠️  ${entry.name} not found or unreadable`);
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
  const notFoundProfiles = [];

  for (const name of allProfileNames) {
    const profile = await getProfile(name, repoPath);
    if (profile) {
      profiles.set(name, profile);
    } else {
      // This is an ad-hoc glob, not a profile, so no warning is needed.
      if (!isGlob(name)) {
        notFoundProfiles.push(name);
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

  return {
    files: workingFiles,
    notFoundProfiles,
    foundProfiles: Array.from(profiles.keys())
  };
}

/**
 * Automatically initializes the .eck manifest directory, attempting dynamic generation via Claude.
 * @param {string} projectPath - Path to the project
 */
export async function initializeEckManifest(projectPath) {
  const eckDir = path.join(projectPath, '.eck');

  let setupConfig = null;
  try {
    setupConfig = await loadSetupConfig();
  } catch (error) {
    // If setup config fails to load, continue with defaults
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

    // Gather basic project info for stub templates
    let staticFacts = {};
    try {
      staticFacts = await detectProjectType(projectPath);
    } catch (e) {
      // Non-critical
    }

    const projName = setupConfig?.projectContext?.name || path.basename(projectPath) || 'project';
    const projType = setupConfig?.projectContext?.type || staticFacts.type || 'unknown';
    const projStack = (setupConfig?.projectContext?.architecture?.stack?.length > 0)
      ? setupConfig.projectContext.architecture.stack.join(', ')
      : 'TBD';
    
    // Static stub templates — AI agents fill these in via their AGENTS.md/CLAUDE.md instructions
    const templateConfigs = {
      'ENVIRONMENT.md': {
        content: `project_type: ${projType}\nagent_id: local_dev\n`
      },
      'CONTEXT.md': {
        content: `# [STUB: CONTEXT.md]\n\nProject: ${projName} | Type: ${projType} | Stack: ${projStack}\n\nAI Agent: please update this file based on your analysis of the codebase.\n`
      },
      'OPERATIONS.md': {
        content: `# [STUB: OPERATIONS.md]\n\nAI Agent: please update with actual setup, run, and test commands.\n\n## Setup\n${staticFacts.type === 'nodejs' ? '\\`\\`\\`bash\\nnpm install\\n\\`\\`\\`' : 'TBD'}\n`
      },
      'ROADMAP.md': {
        content: `# [STUB: ROADMAP.md]\n\nAI Agent: please set a real roadmap based on project goals.\n`
      },
      'TECH_DEBT.md': {
        content: `# [STUB: TECH_DEBT.md]\n\nAI Agent: please scan for TODOs/FIXMEs or structural issues and list them here.\n`
      },
      'DEPLOY_CHECKLIST.md': {
        content: `# [STUB: DEPLOY_CHECKLIST.md]\n\n- [ ] Verify all tests pass\n- [ ] Build assets\n- [ ] Check environment variables\n\nAI Agent: please update with actual deploy steps.\n`
      },
      'RUNTIME_STATE.md': {
        content: `# [STUB: RUNTIME_STATE.md]\n\nAI Agent: check actual runtime state (ports, processes, env vars) and update this file.\n\n- **Server:** TBD\n- **Services:** TBD\n`
      },
      'JOURNAL.md': {
        content: `# Development Journal\n\n## Recent Changes\n---\ntype: feat\nscope: project\nsummary: Initial manifest generated (PENDING REVIEW)\ndate: ${new Date().toISOString().split('T')[0]}\n---\n- NOTICE: Some .eck files are STUBS. They need manual or AI-assisted verification.\n`
      }
    };
    
    // Create each template file (only if it doesn't exist)
    for (const [fileName, config] of Object.entries(templateConfigs)) {
      const filePath = path.join(eckDir, fileName);

      // Skip if file already exists
      try {
        await fs.stat(filePath);
        console.log(`   ✅ ${fileName} already exists, skipping`);
        continue;
      } catch (error) {
        // File doesn't exist, create it
      }

      await fs.writeFile(filePath, config.content);
      console.log(`   ✅ Created ${fileName} (stub template)`);
    }
    
    console.log('📋 .eck manifest initialized! Edit the files to provide project-specific context.');
    
  } catch (error) {
    // Silently fail - don't break the snapshot process if manifest initialization fails
    console.warn(`⚠️  Warning: Could not initialize .eck manifest: ${error.message}`);
  }
}
