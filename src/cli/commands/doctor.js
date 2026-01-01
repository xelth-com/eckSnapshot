import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

/**
 * Scans .eck directory for files containing [STUB] markers
 */
export async function runDoctor(repoPath = process.cwd()) {
  const eckDir = path.join(repoPath, '.eck');
  console.log(chalk.blue('🏥 Checking project health and manifest integrity...'));

  try {
    await fs.access(eckDir);
  } catch {
    console.log(chalk.yellow('⚠️  .eck directory not found. Nothing to check.'));
    return;
  }

  const stubFiles = [];
  const scannedFiles = [];

  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
        scannedFiles.push(fullPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        if (content.includes('[STUB:')) {
          stubFiles.push({
            path: path.relative(repoPath, fullPath),
            type: 'STUB'
          });
        }
      }
    }
  }

  await scan(eckDir);

  if (stubFiles.length === 0) {
    console.log(chalk.green(`\n✅ All clear! Found ${scannedFiles.length} manifest files and no stubs.`));
  } else {
    console.log(chalk.red(`\n❌ Found ${stubFiles.length} files that need attention:`));
    stubFiles.forEach(file => {
      console.log(chalk.yellow(`   - ${file.path} `) + chalk.gray('(contains [STUB] marker)'));
    });
    console.log(chalk.cyan('\n💡 Tip: Instruct your Coder agent to "Finalize these stubs by analyzing the code".'));
  }

  // Cross-platform tree-sitter check
  try {
    const ts = await import('tree-sitter');
    console.log(chalk.green('✅ tree-sitter: Installed and loadable.'));
  } catch (e) {
    console.log(chalk.yellow('ℹ️  tree-sitter: Not available (Skeleton mode will be limited for non-JS files).'));
  }
}
