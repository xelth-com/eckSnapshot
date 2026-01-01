import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedConfig = null;

export async function loadSetupConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const setupPath = path.join(__dirname, '..', 'setup.json');
    const setupContent = await fs.readFile(setupPath, 'utf-8');
    cachedConfig = JSON.parse(setupContent);

    // Basic schema validation for critical fields
    validateConfigSchema(cachedConfig);

    return cachedConfig;
  } catch (error) {
    console.error('Error loading setup.json:', error.message);
    throw new Error('Failed to load setup.json configuration file');
  }
}

/**
 * Validates critical config fields and warns if missing or invalid
 */
function validateConfigSchema(config) {
  const warnings = [];

  if (!config.filesToIgnore || !Array.isArray(config.filesToIgnore)) {
    warnings.push('filesToIgnore missing or not an array - using defaults');
    config.filesToIgnore = DEFAULT_CONFIG.filesToIgnore;
  }

  if (!config.dirsToIgnore || !Array.isArray(config.dirsToIgnore)) {
    warnings.push('dirsToIgnore missing or not an array - using defaults');
    config.dirsToIgnore = DEFAULT_CONFIG.dirsToIgnore;
  }

  if (warnings.length > 0) {
    console.warn('[Config Warning]', warnings.join('; '));
  }
}

/**
 * Loads and merges all profiles (local-first).
 */
export async function getAllProfiles(repoPath) {
  const globalConfig = await loadSetupConfig();
  const globalProfiles = globalConfig.contextProfiles || {};

  let localProfiles = {};
  const localProfilePath = path.join(repoPath, '.eck', 'profiles.json');

  try {
    const localProfileContent = await fs.readFile(localProfilePath, 'utf-8');
    localProfiles = JSON.parse(localProfileContent);
  } catch (e) {
    // No local profiles.json found, which is fine.
  }

  // Local profiles override global profiles
  return { ...globalProfiles, ...localProfiles };
}

/**
 * Smart profile loader (Step 2 of dynamic profiles).
 * Reads local .eck/profiles.json first, then falls back to global setup.json profiles.
 */
export async function getProfile(profileName, repoPath) {
  const globalConfig = await loadSetupConfig();
  const globalProfiles = globalConfig.contextProfiles || {};

  let localProfiles = {};
  const localProfilePath = path.join(repoPath, '.eck', 'profiles.json');

  try {
    const localProfileContent = await fs.readFile(localProfilePath, 'utf-8');
    localProfiles = JSON.parse(localProfileContent);
  } catch (e) {
    // No local profiles.json found, which is fine. We just use globals.
  }

  // Local profiles override global profiles
  const allProfiles = { ...globalProfiles, ...localProfiles };

  return allProfiles[profileName] || null;
}

// Fallback default config for backwards compatibility
export const DEFAULT_CONFIG = {
  smartModeTokenThreshold: 200000,
  filesToIgnore: ['package-lock.json', '*.log', 'yarn.lock'],
  extensionsToIgnore: ['.sqlite3', '.db', '.DS_Store', '.env', '.pyc'],
  dirsToIgnore: ['node_modules/', '.git/', 'dist/', 'build/'],
  maxFileSize: '10MB',
  maxTotalSize: '100MB',
  maxDepth: 10,
  concurrency: 10
};