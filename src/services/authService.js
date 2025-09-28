import ora from 'ora';
import { execa } from 'execa';

/**
 * Initiates the interactive login flow by spawning 'codex login'.
 * This will open a browser and wait for the user to complete authentication.
 * @returns {Promise<void>}
 */
export async function initiateLogin() {
  const spinner = ora('Authentication required. Please follow the browser instructions.').start();
  try {
    // Run `codex login` interactively, inheriting stdio to show user instructions.
    await execa('codex', ['login'], { stdio: 'inherit' });
    spinner.succeed('Login successful. Retrying original command...');
  } catch (e) {
    spinner.fail('Login process failed or was cancelled.');
    // Re-throw to notify p-retry that the attempt failed.
    throw new Error(`Login failed: ${e.message}`);
  }
}