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

    if (stdContent.includes('HIERARCHICAL AGENT WORKFLOW')) {
      throw new Error('❌ Standard snapshot contains JA instructions (Should not happen!)');
    }
    console.log('✅ Standard snapshot: OK (Simple workflow)');

    // 2. Generate JA Snapshot
    await execa('node', ['index.js', 'snapshot', '--with-ja', '--no-tree', '--output', 'test_verify_ja']);
    const jaFiles = await fs.readdir('test_verify_ja');
    const jaContent = await fs.readFile(path.join('test_verify_ja', jaFiles.find(f => f.includes('_ja.md'))), 'utf-8');

    if (!jaContent.includes('HIERARCHICAL AGENT WORKFLOW')) {
      throw new Error('❌ JA snapshot missing JA instructions');
    }
    console.log('✅ JA snapshot: OK (Hierarchical workflow)');

  } catch (e) {
    console.error('Snapshot verification failed:', e.message);
    process.exit(1);
  }
}

verifySnapshots();
