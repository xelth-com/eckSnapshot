import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

/**
 * Show the full content of a file
 * Used for AI lazy loading when skeleton mode is active
 * @param {string} filePath - Path to the file to display
 */
export async function showFile(filePath) {
    try {
        const fullPath = path.resolve(process.cwd(), filePath);
        const content = await fs.readFile(fullPath, 'utf-8');

        console.log(chalk.green(`\n--- FULL CONTENT: ${filePath} ---\n`));

        // Detect file extension for syntax highlighting hint
        const ext = path.extname(filePath).slice(1);
        console.log('```' + ext);
        console.log(content);
        console.log('```');

        console.log(chalk.green(`\n--- END OF FILE ---\n`));

    } catch (error) {
        console.error(chalk.red(`Failed to read file ${filePath}: ${error.message}`));
        process.exit(1);
    }
}
