import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('🧪 Starting Verification Suite...');

async function verifySnapshots() {
  console.log('\n[1/2] Testing Snapshot Logic...');
  try {
    // 1. Generate Standard Snapshot
    await execa('node', ['index.js', 'snapshot', '--no-tree', '--output', 'test_verify_std']);
    const stdFiles = await fs.readdir('test_verify_std');
    const stdContent = await fs.readFile(path.join('test_verify_std', stdFiles.find(f => f.endsWith('.md'))), 'utf-8');

    // Extract just the AI instructions header (before the Directory Structure)
    const stdHeader = stdContent.split('## Directory Structure')[0];

    if (stdHeader.includes('HIERARCHICAL AGENT WORKFLOW')) {
      throw new Error('❌ Standard snapshot header contains HIERARCHICAL workflow (Should be simple AGENT WORKFLOW!)');
    }
    if (!stdHeader.includes('### AGENT WORKFLOW')) {
      throw new Error('❌ Standard snapshot missing AGENT WORKFLOW section');
    }
    console.log('✅ Standard snapshot: OK (Simple AGENT WORKFLOW)');

    // 2. Generate JA Snapshot
    await execa('node', ['index.js', 'snapshot', '--with-ja', '--no-tree', '--output', 'test_verify_ja']);
    const jaFiles = await fs.readdir('test_verify_ja');
    const jaContent = await fs.readFile(path.join('test_verify_ja', jaFiles.find(f => f.includes('_ja.md'))), 'utf-8');

    // Extract just the AI instructions header for JA snapshot
    const jaHeader = jaContent.split('## Directory Structure')[0];

    if (!jaHeader.includes('HIERARCHICAL AGENT WORKFLOW')) {
      throw new Error('❌ JA snapshot header missing HIERARCHICAL AGENT WORKFLOW');
    }
    if (!jaHeader.includes('Junior Architect')) {
      throw new Error('❌ JA snapshot missing Junior Architect references');
    }
    console.log('✅ JA snapshot: OK (HIERARCHICAL AGENT WORKFLOW with JA delegation)');

  } catch (e) {
    console.error('Snapshot verification failed:', e.message);
    process.exit(1);
  }
}

verifySnapshots();
