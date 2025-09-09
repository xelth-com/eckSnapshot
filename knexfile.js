import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load .env from the program directory
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

// Auto-detect WSL and adjust DB_HOST if needed
const isWSL = process.platform === 'linux' && 
  (process.env.WSL_DISTRO_NAME || 
   fs.existsSync('/proc/version') && fs.readFileSync('/proc/version', 'utf8').includes('Microsoft'));

if (isWSL && (!process.env.DB_HOST || process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1')) {
  // For WSL, always use the standard WSL2 gateway IP
  process.env.DB_HOST = '172.29.16.1';
}

export default {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'myuser',
      password: process.env.DB_PASSWORD || 'mypassword',
      database: process.env.DB_DATABASE || 'eck_snapshot_db',
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};