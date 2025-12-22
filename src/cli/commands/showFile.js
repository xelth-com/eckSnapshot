import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

/**
 * Show the full content of specific files
 * Used for AI lazy loading when skeleton mode is active
 * @param {string[]} filePaths - Array of paths to the files to display
 */
export async function showFile(filePaths) {
    // Ensure input is array (commander passes array for variadic args)
    const files = Array.isArray(filePaths) ? filePaths : [filePaths];

    if (files.length === 0) {
        console.error(chalk.yellow('No files specified. Usage: eck-snapshot show <file1> [file2] ...'));
        return;
    }

    for (const filePath of files) {
        try {
            const fullPath = path.resolve(process.cwd(), filePath);
            const content = await fs.readFile(fullPath, 'utf-8');

            console.log(chalk.green(`\n--- FULL CONTENT: ${filePath} ---\n`));

            // Detect file extension for syntax highlighting hint
            const ext = path.extname(filePath).slice(1);
            console.log('```' + ext);
            console.log(content);
            console.log('```');

            console.log(chalk.green(`\n--- END OF FILE: ${filePath} ---\n`));

        } catch (error) {
            console.error(chalk.red(`Failed to read file ${filePath}: ${error.message}`));
            // Continue to next file even if one fails
        }
    }
}
