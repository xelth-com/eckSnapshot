#!/usr/bin/env node

import { spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function detectWSLAndSetupDB() {
  const isWSL = process.platform === 'linux' &&
    (process.env.WSL_DISTRO_NAME ||
     (fs.existsSync('/proc/version') && fs.readFileSync('/proc/version', 'utf8').includes('Microsoft')));

  if (isWSL) {
    if (!process.env.DB_HOST || process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1') {
      try {
        const resolveConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
        const nameserverMatch = resolveConf.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
        if (nameserverMatch) {
          process.env.DB_HOST = nameserverMatch[1];
          console.log(`🔍 WSL detected, using Windows host: ${process.env.DB_HOST}`);
        } else {
          process.env.DB_HOST = '172.29.16.1';
          console.log(`🔍 WSL detected, using fallback host: ${process.env.DB_HOST}`);
        }
      } catch (e) {
        process.env.DB_HOST = '172.29.16.1';
        console.log(`🔍 WSL detected, using fallback host: ${process.env.DB_HOST}`);
      }
    } else {
      console.log(`🔍 WSL detected, using configured host: ${process.env.DB_HOST}`);
    }
  }
}

async function bootstrap() {
  if (typeof global.gc !== 'function' && !process.execArgv.includes('--expose-gc')) {
    const args = ['--expose-gc', ...process.execArgv.filter((arg) => arg !== '--expose-gc'), __filename, ...process.argv.slice(2)];

    try {
      const { code, signal } = await new Promise((resolve, reject) => {
        const child = spawn(process.argv[0], args, { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code, signal) => resolve({ code, signal }));
      });

      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exit(code ?? 0);
      }
      return;
    } catch (error) {
      console.warn('Не удалось перезапустить процесс с флагом --expose-gc:', error.message);
      console.warn('Продолжаем выполнение без ручного доступа к сборщику мусора.');
    }
  }

  const envPath = path.join(__dirname, '.env');
  dotenv.config({ path: envPath });

  detectWSLAndSetupDB();

  const { run } = await import('./src/cli/cli.js');
  run();
}

bootstrap();
