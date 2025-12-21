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

    // 2. Generate Snapshot with --with-ja flag
    await execa('node', ['index.js', 'snapshot', '--with-ja', '--no-tree', '--output', 'test_verify_ja']);
    const jaFiles = await fs.readdir('test_verify_ja');

    // Check the MAIN architect snapshot (not the _ja version)
    const mainJaFile = jaFiles.find(f => f.endsWith('.md') && !f.includes('_ja.md'));
    const mainJaContent = await fs.readFile(path.join('test_verify_ja', mainJaFile), 'utf-8');

    // Extract just the AI instructions header for architect snapshot
    const mainJaHeader = mainJaContent.split('## Directory Structure')[0];

    if (!mainJaHeader.includes('HIERARCHICAL AGENT WORKFLOW')) {
      throw new Error('❌ Architect snapshot (with --with-ja) missing HIERARCHICAL AGENT WORKFLOW');
    }
    if (!mainJaHeader.includes('Junior Architect')) {
      throw new Error('❌ Architect snapshot (with --with-ja) missing Junior Architect references');
    }
    console.log('✅ Architect snapshot (with --with-ja): OK (HIERARCHICAL AGENT WORKFLOW with JA delegation)');

    // Also verify the _ja snapshot uses agent mode
    const jaAgentFile = jaFiles.find(f => f.includes('_ja.md'));
    const jaAgentContent = await fs.readFile(path.join('test_verify_ja', jaAgentFile), 'utf-8');

    // Extract just the AI instructions header for JA agent snapshot
    const jaAgentHeader = jaAgentContent.split('## Directory Structure')[0];

    if (jaAgentHeader.includes('HIERARCHICAL AGENT WORKFLOW')) {
      throw new Error('❌ JA agent snapshot header should NOT have HIERARCHICAL AGENT WORKFLOW (it uses agent template)');
    }
    // Verify it has the agent template marker
    if (!jaAgentHeader.includes('Project Snapshot Information')) {
      throw new Error('❌ JA agent snapshot missing agent template marker');
    }
    console.log('✅ JA agent snapshot (_ja.md): OK (Uses agent template as expected)');

  } catch (e) {
    console.error('Snapshot verification failed:', e.message);
    process.exit(1);
  }
}

verifySnapshots();
