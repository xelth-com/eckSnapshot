import { execa } from 'execa';
import fs from 'fs/promises';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import pty from 'node-pty';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import path from 'path';


/**
 * Executes a Gemini prompt using non-interactive mode with --prompt flag
 * @param {string} prompt - The prompt to send to Gemini
 * @param {string} model - The model to use (default: gemini-2.5-pro)
 * @returns {Promise<object>} Response object with result and stats
 */
export async function executePromptSimple(prompt, model = 'gemini-2.5-pro') {
  const timestamp = new Date().toISOString();
  
  try {
    console.log('🤖 Sending prompt to Gemini in non-interactive mode...');
    
    // Use gemini CLI with prompt as positional argument for clean, non-interactive output
    const result = await execa('gemini', [prompt], {
      timeout: 120000, // 2 minutes timeout
      encoding: 'utf8'
    });
    
    const response = result.stdout.trim();
    
    console.log(`✅ Received response (${response.length} chars)`);
    
    return {
      result: response,
      stats: {
        model: model,
        timestamp: timestamp,
        method: 'simple',
        responseLength: response.length
      }
    };
  } catch (error) {
    console.error('❌ Error executing Gemini prompt:', error.message);
    
    return {
      result: `Error: ${error.message}`,
      stats: {
        model: model,
        timestamp: timestamp,
        method: 'simple',
        error: true
      }
    };
  }
}

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
    }, 300000); // 5 minutes

    let promptSent = false;
    let responseStarted = false;
    let responseBuffer = '';
    let lastDataTime = Date.now();
    let noDataTimeout;
    
    ptyProcess.onData((data) => {
      output += data;
      lastDataTime = Date.now();
      
      // Log basic data flow (temporarily enabled for debugging)
      console.log(`🔍 [DATA] Received ${data.length} chars:`, JSON.stringify(data.substring(0, 100)));
      
      // Clear existing no-data timeout and set a new one
      if (noDataTimeout) clearTimeout(noDataTimeout);
      
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
      if (promptSent && !responseStarted && data.includes(prompt.substring(0, 20))) {
        responseStarted = true;
        console.log('📝 Response starting...');
        responseBuffer = '';
        // Start collecting from this point
        responseBuffer += data;
        
        // Set a longer timeout for the full response
        noDataTimeout = setTimeout(() => {
          if (!isComplete && responseStarted) {
            console.log('⏰ Response timeout reached, completing...');
            completeResponse();
          }
        }, 30000); // 30 seconds for full response
        return;
      }
      
      // Collect response data after prompt is detected
      if (responseStarted) {
        responseBuffer += data;
        
        // Look for indicators that the response is complete and ready for next input
        const strippedData = stripAnsi(data);
        
        // Check for ready state indicators
        if (strippedData.includes('Type your message') && strippedData.includes('context left')) {
          console.log('✅ Response complete, Gemini ready for next input');
          completeResponse();
          return;
        }
        
        // Reset timeout with each new data
        if (noDataTimeout) clearTimeout(noDataTimeout);
        noDataTimeout = setTimeout(() => {
          if (!isComplete && responseStarted) {
            console.log('⏰ No new data timeout, completing response...');
            completeResponse();
          }
        }, 5000); // 5 seconds of no new data
      }
    });
    
    function completeResponse() {
      if (isComplete) return;
      isComplete = true;
      clearTimeout(timeout);
      if (noDataTimeout) clearTimeout(noDataTimeout);
      ptyProcess.kill();
      
      console.log('🔍 Processing response buffer...');
      console.log('🔍 Raw buffer length:', responseBuffer.length);
      
      // Remove ANSI codes and normalize
      let cleanedResponse = stripAnsi(responseBuffer);
      
      // Find the response content between our prompt and the next prompt
      const promptStart = cleanedResponse.indexOf(prompt);
      if (promptStart !== -1) {
        // Get everything after our prompt
        let afterPrompt = cleanedResponse.substring(promptStart + prompt.length);
        
        // Look for the end marker (next prompt appearance)
        let endMarkers = [
          'Type your message',
          'context left',
          'gemini-2.5-pro',
          '╭─────────────────────────────────────────'
        ];
        
        let endIndex = afterPrompt.length;
        for (let marker of endMarkers) {
          let markerIndex = afterPrompt.indexOf(marker);
          if (markerIndex !== -1 && markerIndex < endIndex) {
            endIndex = markerIndex;
          }
        }
        
        // Extract the content between prompt and end marker
        let responseContent = afterPrompt.substring(0, endIndex);
        
        // Clean up the extracted content
        responseContent = responseContent
          .replace(/\r\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/^[\s\n]+/, '') // Remove leading whitespace
          .replace(/[\s\n]+$/, '') // Remove trailing whitespace
          .replace(/^[│╭╰─\s]*\n/, '') // Remove box drawing at start
          .replace(/\n[│╭╰─\s]*$/, '') // Remove box drawing at end
          .trim();
        
        console.log('🔍 Extracted content length:', responseContent.length);
        if (responseContent.length > 0) {
          console.log('🔍 Content preview:', responseContent.substring(0, 200) + '...');
        }
        
        resolve({
          result: responseContent || 'No response content found',
          stats: {
            model: 'gemini-2.5-pro',
            timestamp: timestamp,
            method: 'pty',
            promptSent: promptSent,
            responseStarted: responseStarted,
            responseLength: responseContent.length
          }
        });
      } else {
        console.log('⚠️ Could not find prompt in response buffer');
        console.log('🔍 Buffer sample:', cleanedResponse.substring(0, 300));
        
        resolve({
          result: 'Could not extract response content',
          stats: {
            model: 'gemini-2.5-pro',
            timestamp: timestamp,
            method: 'pty',
            promptSent: promptSent,
            responseStarted: responseStarted,
            responseLength: 0
          }
        });
      }
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