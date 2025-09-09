#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load .env from the program directory, not current working directory
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

// Auto-detect WSL and adjust DB_HOST if needed
function detectWSLAndSetupDB() {
  const isWSL = process.platform === 'linux' && 
    (process.env.WSL_DISTRO_NAME || 
     fs.existsSync('/proc/version') && fs.readFileSync('/proc/version', 'utf8').includes('Microsoft'));
  
  if (isWSL) {
    // Always override DB_HOST in WSL if it's localhost or not set
    if (!process.env.DB_HOST || process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1') {
      // Try to find Windows host IP in WSL
      try {
        const resolveConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
        const nameserverMatch = resolveConf.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
        if (nameserverMatch) {
          process.env.DB_HOST = nameserverMatch[1];
          console.log(`🔍 WSL detected, using Windows host: ${process.env.DB_HOST}`);
        } else {
          // Fallback to common WSL2 gateway
          process.env.DB_HOST = '172.29.16.1';
          console.log(`🔍 WSL detected, using fallback host: ${process.env.DB_HOST}`);
        }
      } catch (e) {
        // Fallback to common WSL2 gateway
        process.env.DB_HOST = '172.29.16.1';
        console.log(`🔍 WSL detected, using fallback host: ${process.env.DB_HOST}`);
      }
    } else {
      console.log(`🔍 WSL detected, using configured host: ${process.env.DB_HOST}`);
    }
  }
}

detectWSLAndSetupDB();

import { run } from './src/cli/cli.js';

run();