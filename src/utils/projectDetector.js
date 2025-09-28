import fs from 'fs/promises';
import path from 'path';
import { loadSetupConfig } from '../config.js';

/**
 * Detects the type of project based on file structure and configuration
 * @param {string} projectPath - Path to the project root
 * @returns {Promise<{type: string, confidence: number, details: object}>}
 */
export async function detectProjectType(projectPath = '.') {
  const config = await loadSetupConfig();
  const patterns = config.projectDetection?.patterns || {};
  
  const detections = [];
  
  for (const [type, pattern] of Object.entries(patterns)) {
    const score = await calculateTypeScore(projectPath, pattern);
    if (score > 0) {
      detections.push({
        type,
        score,
        priority: pattern.priority || 0,
        details: await getProjectDetails(projectPath, type)
      });
    }
  }
  
  // Sort by priority and score
  detections.sort((a, b) => (b.priority * 10 + b.score) - (a.priority * 10 + a.score));

  if (detections.length === 0) {
    return {
      type: 'unknown',
      confidence: 0,
      details: {}
    };
  }

  const best = detections[0];

  // Special handling for mixed monorepos
  const isLikelyMonorepo = detections.length > 1 && detections.some(d => d.score >= 40);

  if (isLikelyMonorepo) {
    // If we have multiple strong detections, prefer the highest priority with substantial evidence
    const strongDetections = detections.filter(d => d.score >= 40);
    if (strongDetections.length > 1) {
      const primaryType = strongDetections[0].type;
      return {
        type: primaryType,
        confidence: Math.min(strongDetections[0].score / 100, 1.0),
        details: {
          ...strongDetections[0].details,
          isMonorepo: true,
          additionalTypes: strongDetections.slice(1).map(d => d.type)
        },
        allDetections: detections
      };
    }
  }

  // Boost confidence for strong workspace indicators
  if (best.details && (best.details.isWorkspace || best.details.workspaceSize)) {
    const boostedScore = best.score + 20; // Bonus for workspace structure
    return {
      type: best.type,
      confidence: Math.min(boostedScore / 100, 1.0),
      details: best.details,
      allDetections: detections
    };
  }

  return {
    type: best.type,
    confidence: Math.min(best.score / 100, 1.0),
    details: best.details,
    allDetections: detections
  };
}

/**
 * Calculates a score for how well a project matches a specific type pattern
 */
async function calculateTypeScore(projectPath, pattern) {
  let score = 0;

  // Check for required files (check both root and common subdirectories)
  if (pattern.files) {
    for (const file of pattern.files) {
      // Check in root directory first
      const rootExists = await fileExists(path.join(projectPath, file));
      if (rootExists) {
        score += 25; // Each required file adds points
      } else {
        // For Cargo.toml and other project files, also check common subdirectory patterns
        const commonSubdirs = ['src', 'lib', 'app', 'core', 'backend', 'frontend'];
        // Add project-type specific subdirectories
        if (file === 'Cargo.toml') {
          commonSubdirs.push('codex-rs', 'rust', 'server', 'api');
        }
        if (file === 'package.json') {
          commonSubdirs.push('codex-cli', 'cli', 'client', 'web', 'ui');
        }

        for (const subdir of commonSubdirs) {
          const subdirExists = await fileExists(path.join(projectPath, subdir, file));
          if (subdirExists) {
            score += 20; // Slightly lower score for subdirectory finds
            break; // Only count once per file type
          }
        }
      }
    }
  }

  // Check for required directories (check both root and one level deep)
  if (pattern.directories) {
    for (const dir of pattern.directories) {
      const rootExists = await directoryExists(path.join(projectPath, dir));
      if (rootExists) {
        score += 20; // Each required directory adds points
      } else {
        // Check in common project subdirectories
        const projectSubdirs = ['codex-rs', 'codex-cli', 'src', 'lib', 'app'];
        for (const projDir of projectSubdirs) {
          const subdirExists = await directoryExists(path.join(projectPath, projDir, dir));
          if (subdirExists) {
            score += 15; // Lower score for nested directory finds
            break;
          }
        }
      }
    }
  }
  
  // Check for manifest files (Android specific) - limit search depth
  if (pattern.manifestFiles) {
    for (const manifest of pattern.manifestFiles) {
      const manifestPath = await findFileRecursive(projectPath, manifest, 2); // Reduced to 2 levels
      if (manifestPath) {
        score += 30; // Manifest files are strong indicators
      }
    }
  }
  
  // Check for content patterns in package.json (React Native, etc.)
  if (pattern.patterns) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      
      for (const patternText of pattern.patterns) {
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
          ...packageJson.peerDependencies
        };
        
        // Check for exact dependency names (more precise matching)
        const foundInDeps = Object.keys(allDeps).some(dep => dep === patternText || dep.startsWith(patternText + '/'));
        // Only check for exact matches in keywords array, not description (too broad)
        const foundInKeywords = packageJson.keywords && Array.isArray(packageJson.keywords)
          ? packageJson.keywords.some(keyword => keyword.toLowerCase() === patternText.toLowerCase())
          : false;
        
        if (foundInDeps || foundInKeywords) {
          score += 25; // Higher score for actual dependencies
        }
      }
    } catch (error) {
      // Ignore if package.json doesn't exist or is malformed
    }
  }
  
  return score;
}

/**
 * Gets detailed information about the detected project type
 */
async function getProjectDetails(projectPath, type) {
  const details = { type };
  
  switch (type) {
    case 'android':
      return await getAndroidDetails(projectPath);
    case 'nodejs':
      return await getNodejsDetails(projectPath);
    case 'flutter':
      return await getFlutterDetails(projectPath);
    case 'react-native':
      return await getReactNativeDetails(projectPath);
    case 'python-poetry':
    case 'python-pip':
    case 'python-conda':
    case 'django':
    case 'flask':
      return await getPythonDetails(projectPath, type);
    case 'rust':
      return await getRustDetails(projectPath);
    case 'go':
      return await getGoDetails(projectPath);
    case 'dotnet':
      return await getDotnetDetails(projectPath);
    default:
      return details;
  }
}

async function getAndroidDetails(projectPath) {
  const details = { type: 'android' };
  
  try {
    // Check build.gradle files
    const buildGradleFiles = [];
    const appBuildGradle = path.join(projectPath, 'app', 'build.gradle');
    const appBuildGradleKts = path.join(projectPath, 'app', 'build.gradle.kts');
    
    if (await fileExists(appBuildGradle)) {
      buildGradleFiles.push('app/build.gradle');
      const content = await fs.readFile(appBuildGradle, 'utf-8');
      details.language = content.includes('kotlin') ? 'kotlin' : 'java';
    }
    
    if (await fileExists(appBuildGradleKts)) {
      buildGradleFiles.push('app/build.gradle.kts');
      details.language = 'kotlin';
    }
    
    details.buildFiles = buildGradleFiles;
    
    // Check for source directories
    const sourceDirs = [];
    const kotlinDir = path.join(projectPath, 'app', 'src', 'main', 'kotlin');
    const javaDir = path.join(projectPath, 'app', 'src', 'main', 'java');
    
    if (await directoryExists(kotlinDir)) {
      sourceDirs.push('app/src/main/kotlin');
    }
    if (await directoryExists(javaDir)) {
      sourceDirs.push('app/src/main/java');
    }
    
    details.sourceDirs = sourceDirs;
    
    // Check for AndroidManifest.xml
    const manifestPath = path.join(projectPath, 'app', 'src', 'main', 'AndroidManifest.xml');
    if (await fileExists(manifestPath)) {
      details.hasManifest = true;
      
      // Extract package name from manifest
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const packageMatch = manifestContent.match(/package="([^"]+)"/);
        if (packageMatch) {
          details.packageName = packageMatch[1];
        }
      } catch (error) {
        // Ignore parsing errors
      }
    }
    
    // Check for libs directory
    const libsDir = path.join(projectPath, 'app', 'libs');
    if (await directoryExists(libsDir)) {
      details.hasLibs = true;
      try {
        const libFiles = await fs.readdir(libsDir);
        details.libFiles = libFiles.filter(f => f.endsWith('.aar') || f.endsWith('.jar'));
      } catch (error) {
        // Ignore
      }
    }
    
  } catch (error) {
    console.warn('Error getting Android project details:', error.message);
  }
  
  return details;
}

async function getNodejsDetails(projectPath) {
  const details = { type: 'nodejs' };
  
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    
    details.name = packageJson.name;
    details.version = packageJson.version;
    details.hasTypescript = !!packageJson.devDependencies?.typescript || !!packageJson.dependencies?.typescript;
    details.framework = detectNodejsFramework(packageJson);
    
    // Check if it's a monorepo - be more strict
    const hasWorkspaces = !!packageJson.workspaces;
    const hasLerna = await fileExists(path.join(projectPath, 'lerna.json')) || !!packageJson.lerna;
    const hasNx = await fileExists(path.join(projectPath, 'nx.json'));
    const hasRush = await fileExists(path.join(projectPath, 'rush.json'));
    const hasPackagesDir = await directoryExists(path.join(projectPath, 'packages'));
    const hasAppsDir = await directoryExists(path.join(projectPath, 'apps'));
    const hasLibsDir = await directoryExists(path.join(projectPath, 'libs'));
    
    // Check if packages/apps/libs directories contain actual packages
    let hasSubPackages = false;
    
    for (const dir of ['packages', 'apps', 'libs']) {
      const dirPath = path.join(projectPath, dir);
      if (await directoryExists(dirPath)) {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const packageJsonPath = path.join(dirPath, entry.name, 'package.json');
              if (await fileExists(packageJsonPath)) {
                hasSubPackages = true;
                break;
              }
            }
          }
          if (hasSubPackages) break;
        } catch (error) {
          // Ignore
        }
      }
    }
    
    // Only consider it a monorepo if it has workspace configuration AND actual sub-packages
    details.isMonorepo = !!(
      (hasWorkspaces || hasLerna || hasNx || hasRush) &&
      hasSubPackages
    );
    
    if (details.isMonorepo) {
      details.type = 'nodejs-monorepo';
      
      // Count workspaces
      if (packageJson.workspaces) {
        if (Array.isArray(packageJson.workspaces)) {
          details.workspaceCount = packageJson.workspaces.length;
        } else if (packageJson.workspaces.packages) {
          details.workspaceCount = packageJson.workspaces.packages.length;
        }
      }
      
      // Detect monorepo tool
      if (hasLerna) {
        details.monorepoTool = 'lerna';
      } else if (hasNx) {
        details.monorepoTool = 'nx';
      } else if (hasRush) {
        details.monorepoTool = 'rush';
      } else if (hasWorkspaces) {
        details.monorepoTool = 'npm-workspaces';
      }
    }
    
  } catch (error) {
    console.warn('Error getting Node.js project details:', error.message);
  }
  
  return details;
}

async function getFlutterDetails(projectPath) {
  const details = { type: 'flutter' };
  
  try {
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    const content = await fs.readFile(pubspecPath, 'utf-8');
    
    // Basic parsing of pubspec.yaml
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    if (nameMatch) {
      details.name = nameMatch[1].trim();
    }
    
    const versionMatch = content.match(/^version:\s*(.+)$/m);
    if (versionMatch) {
      details.version = versionMatch[1].trim();
    }
    
  } catch (error) {
    console.warn('Error getting Flutter project details:', error.message);
  }
  
  return details;
}

async function getReactNativeDetails(projectPath) {
  const details = { type: 'react-native' };
  
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    
    details.name = packageJson.name;
    details.version = packageJson.version;
    details.reactNativeVersion = packageJson.dependencies?.['react-native'];
    details.hasTypescript = !!packageJson.devDependencies?.typescript;
    
  } catch (error) {
    console.warn('Error getting React Native project details:', error.message);
  }
  
  return details;
}

function detectNodejsFramework(packageJson) {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  if (deps.express) return 'express';
  if (deps.next) return 'next.js';
  if (deps.nuxt) return 'nuxt.js';
  if (deps.vue) return 'vue';
  if (deps.react) return 'react';
  if (deps.electron) return 'electron';
  if (deps.fastify) return 'fastify';
  if (deps.koa) return 'koa';
  if (deps.hapi) return 'hapi';
  
  return 'node.js';
}

async function getPythonDetails(projectPath, type) {
  const details = { type };
  
  try {
    // Check for Poetry project
    if (type === 'python-poetry') {
      const pyprojectPath = path.join(projectPath, 'pyproject.toml');
      const content = await fs.readFile(pyprojectPath, 'utf-8');
      
      // Basic TOML parsing for project name and version
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
      
      if (nameMatch) details.name = nameMatch[1];
      if (versionMatch) details.version = versionMatch[1];
      
      details.packageManager = 'poetry';
    }
    
    // Check for requirements.txt
    if (await fileExists(path.join(projectPath, 'requirements.txt'))) {
      const reqContent = await fs.readFile(path.join(projectPath, 'requirements.txt'), 'utf-8');
      details.dependencies = reqContent.split('\n').filter(line => line.trim() && !line.startsWith('#')).length;
    }
    
    // Check for Django
    if (type === 'django' || await fileExists(path.join(projectPath, 'manage.py'))) {
      details.framework = 'django';
      details.type = 'django';
      
      // Look for Django apps
      try {
        const entries = await fs.readdir(projectPath, { withFileTypes: true });
        const djangoApps = [];
        
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const appPath = path.join(projectPath, entry.name);
            if (await fileExists(path.join(appPath, 'models.py')) || 
                await fileExists(path.join(appPath, 'views.py'))) {
              djangoApps.push(entry.name);
            }
          }
        }
        
        details.djangoApps = djangoApps;
      } catch (error) {
        // Ignore
      }
    }
    
    // Check for Flask
    if (type === 'flask' || await fileExists(path.join(projectPath, 'app.py'))) {
      details.framework = 'flask';
      details.type = 'flask';
    }
    
    // Check for virtual environment
    if (await directoryExists(path.join(projectPath, 'venv')) ||
        await directoryExists(path.join(projectPath, '.venv')) ||
        await directoryExists(path.join(projectPath, 'env'))) {
      details.hasVirtualEnv = true;
    }
    
  } catch (error) {
    console.warn('Error getting Python project details:', error.message);
  }
  
  return details;
}

async function getRustDetails(projectPath) {
  const details = { type: 'rust' };

  try {
    // Check both root and common subdirectories for Cargo.toml
    let cargoPath = path.join(projectPath, 'Cargo.toml');
    let cargoContent = null;

    if (await fileExists(cargoPath)) {
      cargoContent = await fs.readFile(cargoPath, 'utf-8');
    } else {
      // Check common Rust project subdirectories
      const rustSubdirs = ['codex-rs', 'rust', 'src', 'core', 'server'];
      for (const subdir of rustSubdirs) {
        const subdirCargoPath = path.join(projectPath, subdir, 'Cargo.toml');
        if (await fileExists(subdirCargoPath)) {
          cargoPath = subdirCargoPath;
          cargoContent = await fs.readFile(subdirCargoPath, 'utf-8');
          details.primaryLocation = subdir;
          break;
        }
      }
    }

    if (!cargoContent) {
      return details;
    }

    const nameMatch = cargoContent.match(/name\s*=\s*"([^"]+)"/);
    const versionMatch = cargoContent.match(/version\s*=\s*"([^"]+)"/);
    const editionMatch = cargoContent.match(/edition\s*=\s*"([^"]+)"/);

    if (nameMatch) details.name = nameMatch[1];
    if (versionMatch) details.version = versionMatch[1];
    if (editionMatch) details.edition = editionMatch[1];

    // Check if it's a workspace
    if (cargoContent.includes('[workspace]')) {
      details.isWorkspace = true;

      // Count workspace members
      const workspaceMatch = cargoContent.match(/members\s*=\s*\[([\s\S]*?)\]/);
      if (workspaceMatch) {
        const members = workspaceMatch[1].split(',').map(m => m.trim().replace(/"/g, '')).filter(m => m);
        details.workspaceMembers = members.length;
      }
    }

    // Check for multiple Cargo.toml files (indicates workspace structure)
    if (details.primaryLocation) {
      const subdirPath = path.join(projectPath, details.primaryLocation);
      try {
        const subdirs = await fs.readdir(subdirPath, { withFileTypes: true });
        let cargoCount = 0;
        for (const entry of subdirs) {
          if (entry.isDirectory()) {
            const memberCargoPath = path.join(subdirPath, entry.name, 'Cargo.toml');
            if (await fileExists(memberCargoPath)) {
              cargoCount++;
            }
          }
        }
        if (cargoCount > 3) { // If many workspace members, this is definitely a Rust project
          details.workspaceSize = 'large';
        }
      } catch (error) {
        // Ignore
      }
    }

  } catch (error) {
    console.warn('Error getting Rust project details:', error.message);
  }

  return details;
}

async function getGoDetails(projectPath) {
  const details = { type: 'go' };
  
  try {
    const goModPath = path.join(projectPath, 'go.mod');
    const content = await fs.readFile(goModPath, 'utf-8');
    
    const moduleMatch = content.match(/module\s+([^\s\n]+)/);
    const goVersionMatch = content.match(/go\s+([0-9.]+)/);
    
    if (moduleMatch) details.module = moduleMatch[1];
    if (goVersionMatch) details.goVersion = goVersionMatch[1];
    
  } catch (error) {
    console.warn('Error getting Go project details:', error.message);
  }
  
  return details;
}

async function getDotnetDetails(projectPath) {
  const details = { type: 'dotnet' };
  
  try {
    // Look for project files
    const entries = await fs.readdir(projectPath);
    const projectFiles = entries.filter(file => 
      file.endsWith('.csproj') || 
      file.endsWith('.fsproj') || 
      file.endsWith('.vbproj')
    );
    
    if (projectFiles.length > 0) {
      details.projectFiles = projectFiles;
      
      // Determine language
      if (projectFiles.some(f => f.endsWith('.csproj'))) {
        details.language = 'C#';
      } else if (projectFiles.some(f => f.endsWith('.fsproj'))) {
        details.language = 'F#';
      } else if (projectFiles.some(f => f.endsWith('.vbproj'))) {
        details.language = 'VB.NET';
      }
    }
    
    // Check for solution file
    const solutionFiles = entries.filter(file => file.endsWith('.sln'));
    if (solutionFiles.length > 0) {
      details.hasSolution = true;
      details.solutionFiles = solutionFiles;
    }
    
  } catch (error) {
    console.warn('Error getting .NET project details:', error.message);
  }
  
  return details;
}

// Utility functions
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function findFileRecursive(basePath, fileName, maxDepth = 3) {
  const searchInDir = async (currentPath, depth) => {
    if (depth > maxDepth) return null;
    
    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });
      
      // First, check if the file exists in current directory
      if (items.some(item => item.name === fileName && item.isFile())) {
        return path.join(currentPath, fileName);
      }
      
      // Then search in subdirectories
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.')) {
          const found = await searchInDir(path.join(currentPath, item.name), depth + 1);
          if (found) return found;
        }
      }
    } catch (error) {
      // Ignore permission errors
    }
    
    return null;
  };
  
  return await searchInDir(basePath, 0);
}

/**
 * Gets project-specific filtering configuration
 * @param {string} projectType - The detected project type
 * @returns {object} Project-specific filtering rules
 */
export async function getProjectSpecificFiltering(projectType) {
  const config = await loadSetupConfig();
  const projectSpecific = config.fileFiltering?.projectSpecific?.[projectType];
  
  if (!projectSpecific) {
    return {
      filesToIgnore: [],
      dirsToIgnore: [],
      extensionsToIgnore: []
    };
  }
  
  return {
    filesToIgnore: projectSpecific.filesToIgnore || [],
    dirsToIgnore: projectSpecific.dirsToIgnore || [],
    extensionsToIgnore: projectSpecific.extensionsToIgnore || []
  };
}