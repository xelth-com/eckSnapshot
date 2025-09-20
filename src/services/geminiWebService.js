import { execa } from 'execa';
import fs from 'fs/promises';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import pty from 'node-pty';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import path from 'path';

let activeSession = null;
let logStream = null;
const PROMPT_INDICATOR = />\\s$|Type your message|context left/;

/**
 * Executes a prompt using the gemini-cli in non-interactive JSON mode.
 * @param {string} prompt The prompt to send to Gemini.
 * @returns {Promise<object>} A promise that resolves with the final JSON output object from Gemini.
 */
export async function executePrompt(prompt) {
  // Check if API key is available
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY environment variable is required for non-interactive usage.\n' +
      'Please:\n' +
      '1. Get an API key from: https://aistudio.google.com/apikey\n' +
      '2. Export it: export GEMINI_API_KEY="your_api_key_here"\n' +
      '3. Try the command again'
    );
  }

  const logDir = './.eck/logs';
  await fs.mkdir(logDir, { recursive: true });
  const logFile = `${logDir}/gemini-execution-${Date.now()}.log`;
  const timestamp = new Date().toISOString();

  try {
    const command = 'gemini';
    const args = ['-p', prompt];
    
    const { stdout, stderr, exitCode } = await execa(command, args, {
      timeout: 120000, // 2-minute timeout
      env: {
        ...process.env,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GOOGLE_API_KEY: process.env.GEMINI_API_KEY
      }
    });

    const logContent = `=== Gemini Execution Log ${timestamp} ===\n` +
                       `Command: ${command} ${args.join(' ')}\n` +
                       `Exit Code: ${exitCode}\n` +
                       `STDOUT:\n${stdout}\n` +
                       `STDERR:\n${stderr}\n` +
                       `=== End Log ===\n\n`;

    await fs.appendFile(logFile, logContent, 'utf8');

    if (stderr) {
      console.warn('Warning from gemini-cli process:', stderr);
    }

    // Interactive mode returns plain text
    // Clean up the output to extract just the response
    const cleanedOutput = stdout
      .replace(/Loaded cached credentials\./g, '')
      .replace(/\n+/g, '\n')
      .trim();

    return {
      result: cleanedOutput,
      stats: {
        model: 'gemini',
        timestamp: timestamp
      },
    };
  } catch (error) {
    const errorLogContent = `=== Gemini Execution Error ${timestamp} ===\n` +
                           `Prompt: "${prompt}"\n` +
                           `Error: ${error.message}\n` +
                           `Stack: ${error.stack}\n` +
                           `=== End Error Log ===\n\n`;
    
    await fs.appendFile(logFile, errorLogContent, 'utf8').catch(logError => {
        console.error('Failed to write error log:', logError);
    });
    
    console.error(`Failed to execute gemini prompt. See log for details: ${logFile}`);
    throw error;
  }
}

/**
 * Executes a prompt using Gemini CLI with PTY (pseudo-terminal) to enable interactive features.
 * This approach works with OAuth authentication and supports slash commands.
 * @param {string} prompt The prompt to send to Gemini.
 * @returns {Promise<object>} A promise that resolves with the response from Gemini.
 */
export async function executePromptWithPTY(prompt) {
  const logDir = './.eck/logs';
  await fs.mkdir(logDir, { recursive: true });
  const logFile = `${logDir}/gemini-pty-execution-${Date.now()}.log`;
  const timestamp = new Date().toISOString();

  return new Promise((resolve, reject) => {
    let output = '';
    let isComplete = false;
    
    // Create PTY process to emulate real terminal
    const ptyProcess = pty.spawn('gemini', [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env: {
        ...process.env,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GOOGLE_API_KEY: process.env.GEMINI_API_KEY
      }
    });

    // Set timeout
    const timeout = setTimeout(() => {
      if (!isComplete) {
        ptyProcess.kill();
        reject(new Error('Gemini PTY process timed out'));
      }
    }, 180000); // 3 minutes

    let promptSent = false;
    let responseStarted = false;
    let responseBuffer = '';
    let lastDataTime = Date.now();
    
    ptyProcess.onData((data) => {
      output += data;
      lastDataTime = Date.now();
      
      // Look for prompt indicators that Gemini is ready (after showing model info)
      if (!promptSent && data.includes('gemini-2.5-pro') && data.includes('context left')) {
        // Wait a moment for the CLI to fully load and show prompt
        setTimeout(() => {
          console.log('🤖 Gemini ready, sending prompt...');
          ptyProcess.write(prompt + '\r');
          promptSent = true;
        }, 1500);
      }
      
      // Detect when our prompt appears (response starting)
      if (promptSent && !responseStarted && data.includes(prompt)) {
        responseStarted = true;
        console.log('📝 Response starting...');
        responseBuffer = '';
        
        // Give Gemini 15 seconds to complete the response
        setTimeout(() => {
          if (!isComplete) {
            console.log('⏰ Fixed timeout reached, completing response...');
            completeResponse();
          }
        }, 15000);
      }
      
      // Collect response data after prompt is echoed
      if (responseStarted) {
        responseBuffer += data;
      }
    });
    
    function completeResponse() {
      if (isComplete) return;
      isComplete = true;
      clearTimeout(timeout);
      ptyProcess.kill();
      
      // Extract the actual response from buffer
      let cleanedResponse = responseBuffer
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // Remove ANSI escape sequences
        .replace(/\r/g, '') // Remove carriage returns
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); // Remove control chars
      
      // Try to find the actual response between prompt and status
      const promptIndex = cleanedResponse.indexOf(prompt);
      if (promptIndex !== -1) {
        cleanedResponse = cleanedResponse.substring(promptIndex + prompt.length);
      }
      
      // Remove various UI elements and status lines
      cleanedResponse = cleanedResponse
        .replace(/eckSnapshot \(main\*?\)[\s\S]*?context left/g, '') // Remove status
        .replace(/no sandbox \(see \/docs\)/g, '') // Remove sandbox warning
        .replace(/│[\s\r\n]*╰[─]+╯/g, '') // Remove box drawing
        .replace(/^\s*\n+/, '') // Remove leading whitespace
        .replace(/\n\s*\n\s*$/, '') // Remove trailing whitespace
        .replace(/^\s*\)\s*$/, '') // Remove stray parenthesis
        .trim();
      
      // Log the raw buffer for debugging
      console.log('🔍 Raw response buffer length:', responseBuffer.length);
      console.log('🔍 Raw buffer sample:', JSON.stringify(responseBuffer.substring(0, 200)));
      console.log('🔍 Cleaned response:', cleanedResponse.substring(0, 100) + '...');
      
      resolve({
        result: cleanedResponse || 'No response received',
        stats: {
          model: 'gemini-2.5-pro',
          timestamp: timestamp,
          method: 'pty',
          promptSent: promptSent,
          responseStarted: responseStarted
        }
      });
    }

    ptyProcess.onExit((exitCode) => {
      if (!isComplete) {
        isComplete = true;
        clearTimeout(timeout);
        
        if (exitCode !== 0) {
          reject(new Error(`Gemini process exited with code ${exitCode}`));
        } else {
          // Process completed normally
          const cleanedOutput = output
            .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI colors
            .replace(/Loaded cached credentials\./g, '')
            .replace(prompt, '')
            .replace(/>/g, '')
            .replace(/\r/g, '')
            .replace(/\n+/g, '\n')
            .trim();

          resolve({
            result: cleanedOutput,
            stats: {
              model: 'gemini',
              timestamp: timestamp,
              method: 'pty'
            }
          });
        }
      }
    });

    // Log all output
    const logContent = `=== Gemini PTY Execution Log ${timestamp} ===\n` +
                       `Prompt: "${prompt}"\n` +
                       `Raw Output:\n${output}\n` +
                       `=== End PTY Log ===\n\n`;
    
    // Save log when process completes
    ptyProcess.onExit(() => {
      fs.appendFile(logFile, logContent, 'utf8').catch(err => {
        console.error('Failed to write PTY log:', err);
      });
    });
  });
}

// --- NEW SESSION MANAGEMENT LOGIC ---

function waitForReady(ptyProcess) {
  return new Promise((resolve, reject) => {
    let initialOutput = '';
    const handler = (data) => {
      if (logStream) logStream.write(`[DATA] ${data.toString()}`);
      console.log(chalk.yellow('[PTY_RAW_DATA]'), data.toString());
      const output = stripAnsi(data.toString());
      initialOutput += output;
      if (PROMPT_INDICATOR.test(initialOutput)) {
        ptyProcess.removeListener('data', handler);
        resolve(initialOutput);
      } else if (output.includes('Error')) {
        ptyProcess.removeListener('data', handler);
        reject(new Error('Failed to start Gemini CLI: ' + output));
      }
    };
    ptyProcess.on('data', handler);
    setTimeout(() => {
      ptyProcess.removeListener('data', handler);
      reject(new Error('Timeout waiting for Gemini CLI to become ready. Output: ' + initialOutput));
    }, 120000);
  });
}

function getResponse(ptyProcess) {
  return new Promise((resolve, reject) => {
    let response = '';
    const handler = (data) => {
      if (logStream) logStream.write(`[DATA] ${data.toString()}`);
      console.log(chalk.yellow('[PTY_RAW_DATA]'), data.toString());
      const output = data.toString();
      response += output;
      if (PROMPT_INDICATOR.test(stripAnsi(output))) {
        ptyProcess.removeListener('data', handler);
        // Clean up response: remove the prompt indicator and preceding command echo
        const cleanResponse = response.replace(PROMPT_INDICATOR, '').trim();
        resolve(cleanResponse);
      }
    };
    ptyProcess.on('data', handler);
    setTimeout(() => {
      ptyProcess.removeListener('data', handler);
      reject(new Error('Timeout waiting for Gemini CLI response. Partial response: ' + response));
    }, 120000); // 2 minute timeout for a response
  });
}

export async function startGeminiSession(options = {}) {
  const { model } = options;
  
  const logDir = path.join(process.cwd(), 'logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir);
  }
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const logFilePath = path.join(logDir, `pty_session_${timestamp}.log`);
  logStream = createWriteStream(logFilePath, { flags: 'a' });
  logStream.write(`--- PTY Session Log Started at ${new Date().toISOString()} ---\n`);

  if (activeSession) {
    throw new Error('A Gemini session is already active.');
  }

  const args = [];
  if (model) {
    args.push('--model', model);
  }

  const ptyProcess = pty.spawn('gemini', args, {
    name: 'xterm-color',
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
    env: process.env,
  });

  activeSession = ptyProcess;

  try {
    await waitForReady(ptyProcess);
  } catch (error) {
    await stopGeminiSession(); // Ensure cleanup on startup failure
    throw error;
  }
}

/**
 * Starts a Gemini session in daemon mode (non-interactive)
 * @param {object} options - Session options
 * @param {string} options.model - Model to use
 * @param {string} options.snapshotFile - Snapshot file to load
 * @returns {Promise<void>}
 */
export async function startGeminiSessionDaemon(options = {}) {
  const { model, snapshotFile } = options;
  
  console.log('🚀 Starting Gemini session daemon...');
  
  // Start the basic session
  await startGeminiSession({ model });
  
  console.log('✅ Gemini session started successfully');
  
  if (snapshotFile) {
    console.log('📄 Loading snapshot context...');
    const templatePath = path.join(process.cwd(), 'src', 'templates', 'architect-prompt.template.md');
    
    try {
      if (existsSync(templatePath)) {
        const architectPrompt = await fs.readFile(templatePath, 'utf-8');
        await askGeminiSession(architectPrompt);
        console.log('🏗️ Architect prompt configured');
      }
      
      const snapshotLoadPrompt = `Loaded context from snapshot: ${snapshotFile}. I will now begin the task based on my instructions.`;
      await askGeminiSession(snapshotLoadPrompt);
      console.log('📋 Snapshot context loaded');
    } catch (error) {
      console.warn('⚠️ Warning: Could not load snapshot context:', error.message);
    }
  }
  
  console.log('🎯 Session daemon ready to receive commands');
}

export async function askGeminiSession(prompt) {
  if (!activeSession) {
    throw new Error('No active Gemini session. Use start-gemini-session first.');
  }
  if (logStream) logStream.write(`[WRITE] ${prompt}\n`);
  console.log(chalk.cyan(`[PTY_WRITE] Prompt (truncated): ${prompt.substring(0, 100).replace(/\n/g, ' ')}...`));
  activeSession.write(`${prompt}\r`);
  const response = await getResponse(activeSession);
  // The response includes the echoed prompt, remove it.
  const cleanResponse = response.substring(response.indexOf(prompt) + prompt.length).trim();
  return cleanResponse;
}

export async function stopGeminiSession() {
  if (logStream) {
    logStream.write(`--- PTY Session Log Ended at ${new Date().toISOString()} ---\n`);
    logStream.end();
    logStream = null;
  }
  if (activeSession) {
    activeSession.kill();
    activeSession = null;
  }
  return Promise.resolve();
}

/**
 * Gets the status of the current Gemini session
 * @returns {object} Session status information
 */
export function getSessionStatus() {
  return {
    isActive: !!activeSession,
    hasLogStream: !!logStream,
    processId: activeSession ? activeSession.pid : null
  };
}

/**
 * Sends a command to the active Gemini session and returns the response
 * @param {string} command - The command to send to Gemini
 * @returns {Promise<string>} The response from Gemini
 */
export async function sendCommandToSession(command) {
  if (!activeSession) {
    throw new Error('No active Gemini session. Please start a session first using gemini-session command.');
  }
  
  try {
    if (logStream) {
      logStream.write(`[EXTERNAL_COMMAND] ${command}\n`);
    }
    console.log(chalk.cyan(`[PTY_EXTERNAL] Sending command: ${command.substring(0, 100)}...`));
    
    // Send the command to the session
    activeSession.write(`${command}\r`);
    
    // Get the response
    const response = await getResponse(activeSession);
    
    // Clean up the response by removing the echoed command
    const commandIndex = response.indexOf(command);
    const cleanResponse = commandIndex !== -1 
      ? response.substring(commandIndex + command.length).trim()
      : response.trim();
    
    return cleanResponse;
  } catch (error) {
    console.error('Error sending command to session:', error.message);
    throw error;
  }
}

/**
 * Waits for the active session to become ready for input
 * @returns {Promise<boolean>} True if session is ready
 */
export async function waitForSessionReady() {
  if (!activeSession) {
    throw new Error('No active Gemini session.');
  }
  
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for session to become ready'));
    }, 30000); // 30 second timeout
    
    const handler = (data) => {
      output += stripAnsi(data.toString());
      if (PROMPT_INDICATOR.test(output)) {
        activeSession.removeListener('data', handler);
        clearTimeout(timeout);
        resolve(true);
      }
    };
    
    activeSession.on('data', handler);
  });
}