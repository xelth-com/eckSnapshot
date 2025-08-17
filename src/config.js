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
    return cachedConfig;
  } catch (error) {
    console.error('Error loading setup.json:', error.message);
    throw new Error('Failed to load setup.json configuration file');
  }
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