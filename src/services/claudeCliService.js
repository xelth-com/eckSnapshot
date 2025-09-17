import { execa } from 'execa';
import { spawn } from 'child_process';

/**
 * Executes a prompt using the claude-code CLI in non-interactive print mode.
 * @param {string} prompt The prompt to send to Claude.
 * @param {boolean} continueConversation Whether to continue the last conversation with -c flag.
 * @returns {Promise<object>} A promise that resolves with the final JSON output object from Claude.
 */
export async function executePrompt(prompt, continueConversation = false) {
  try {
    let sessionId = null;
    if (continueConversation) {
      sessionId = await getLastSessionId();
      if (!sessionId) {
        console.warn('No previous session found, starting new conversation');
      } else {
        console.log(`Continuing conversation with session: ${sessionId}`);
      }
    }
    
    return await attemptClaudeExecution(prompt, sessionId);
  } catch (error) {
    // Check for claude session limits first
    if (isSessionLimitError(error)) {
      await logSessionLimitError(error, prompt);
      throw new Error(`Claude session limit reached: ${error.message}. Please take a break and try again later.`);
    }
    
    // If the first attempt fails (timeout, interactive prompts, etc), try to handle it
    if (error.message.includes('timeout') || error.message.includes('SIGTERM')) {
      console.log('First attempt failed, attempting interactive recovery...');
      
      try {
        // Try running claude interactively to see what prompts appear
        const interactiveResult = await execa('claude', [], {
          input: '\n',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Логируем любое интерактивное взаимодействие
        const interactiveLogFile = `./logs/claude-interactive-${Date.now()}.log`;
        const interactiveLogContent = `=== Claude Interactive Recovery Log ${new Date().toISOString()} ===\n` +
                                     `Original prompt: "${prompt}"\n` +
                                     `Original error: ${error.message}\n` +
                                     `Recovery command: claude (with newline input)\n` +
                                     `STDOUT:\n${interactiveResult.stdout}\n` +
                                     `STDERR:\n${interactiveResult.stderr}\n` +
                                     `=== End Interactive Log ===\n\n`;
        
        await import('fs/promises').then(fs => fs.appendFile(interactiveLogFile, interactiveLogContent, 'utf8'));
        console.log(`Interactive recovery logged to: ${interactiveLogFile}`);
        
        // Wait a moment for any setup to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Now try the original prompt again
        return await attemptClaudeExecution(prompt, sessionId);
      } catch (retryError) {
        // Логируем неудачу восстановления
        const failureLogFile = `./logs/claude-recovery-failure-${Date.now()}.log`;
        const failureLogContent = `=== Claude Recovery Failure Log ${new Date().toISOString()} ===\n` +
                                 `Original prompt: "${prompt}"\n` +
                                 `Original error: ${error.message}\n` +
                                 `Retry error: ${retryError.message}\n` +
                                 `Retry stack: ${retryError.stack}\n` +
                                 `=== End Failure Log ===\n\n`;
        
        try {
          await import('fs/promises').then(fs => fs.appendFile(failureLogFile, failureLogContent, 'utf8'));
          console.log(`Recovery failure logged to: ${failureLogFile}`);
        } catch (logError) {
          console.error('Failed to log recovery failure:', logError.message);
        }
        
        console.error('Recovery attempt failed:', retryError.message);
        throw new Error(`Failed to execute claude command even after interactive recovery. Original error: ${error.message}, Retry error: ${retryError.message}`);
      }
    }
    
    throw error;
  }
}

/**
 * Attempts to execute a claude command and parse the JSON output.
 * @param {string} prompt The prompt to send to Claude.
 * @param {string|null} sessionId Session ID to resume, or null for new session.
 * @returns {Promise<object>} The parsed result object.
 */
async function attemptClaudeExecution(prompt, sessionId = null) {
  const timestamp = new Date().toISOString();
  const logFile = `./logs/claude-execution-${Date.now()}.log`;
  
  try {
    // Use spawn instead of execa for better control over streaming and timeouts
    const result = await executeClaudeWithDynamicTimeout(prompt, sessionId);
    const { stdout, stderr } = result;

    // Логируем весь вывод в файл
    const commandStr = sessionId ? 
      `claude "${prompt}" --resume ${sessionId} -p --output-format=stream-json --verbose` :
      `claude "${prompt}" -p --output-format=stream-json --verbose`;
    const logContent = `=== Claude Execution Log ${timestamp} ===\n` +
                       `Command: ${commandStr}\n` +
                       `STDOUT:\n${stdout}\n` +
                       `STDERR:\n${stderr}\n` +
                       `=== End Log ===\n\n`;
    
    await import('fs/promises').then(fs => fs.appendFile(logFile, logContent, 'utf8'));
    console.log(`Claude execution logged to: ${logFile}`);

    if (stderr) {
      console.warn('Warning from claude-code process:', stderr);
    }

    const lines = stdout.trim().split('\n');
    
    // Find the final result JSON object
    let resultJson = null;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'result') {
          resultJson = parsed;
        }
      } catch (e) {
        // Skip invalid JSON lines
        continue;
      }
    }

    if (!resultJson) {
      throw new Error('No result JSON found in claude-code output.');
    }

    return {
      result: resultJson.result,
      cost: resultJson.total_cost_usd,
      usage: resultJson.usage,
      duration_ms: resultJson.duration_ms
    };
  } catch (error) {
    // Логируем ошибки тоже
    const errorLogContent = `=== Claude Execution Error ${timestamp} ===\n` +
                           `Command: claude "${prompt}" -p --output-format=stream-json --verbose\n` +
                           `Error: ${error.message}\n` +
                           `Stack: ${error.stack}\n` +
                           `=== End Error Log ===\n\n`;
    
    try {
      await import('fs/promises').then(fs => fs.appendFile(logFile, errorLogContent, 'utf8'));
      console.log(`Claude execution error logged to: ${logFile}`);
    } catch (logError) {
      console.error('Failed to log error:', logError.message);
    }
    
    throw error;
  }
}

/**
 * Checks if the error is related to Claude session limits.
 * @param {Error} error The error to check.
 * @returns {boolean} True if it's a session limit error.
 */
function isSessionLimitError(error) {
  // Don't treat simple timeouts as session limits
  if (error.message.includes('Command timed out after') && 
      !error.message.includes('5-hour') && 
      !error.message.includes('limit')) {
    return false;
  }
  
  const limitPatterns = [
    /approaching 5-hour limit/i,
    /5-hour limit/i,
    /session limit reached/i,
    /daily limit reached/i,
    /usage limit reached/i,
    /rate limit exceeded/i,
    /quota exceeded/i,
    /too many requests/i,
    /maximum session duration/i,
    /session expired/i
  ];
  
  const errorText = error.message + ' ' + (error.stdout || '') + ' ' + (error.stderr || '');
  return limitPatterns.some(pattern => pattern.test(errorText));
}

/**
 * Logs session limit errors with helpful recommendations.
 * @param {Error} error The limit error.
 * @param {string} prompt The original prompt.
 */
async function logSessionLimitError(error, prompt) {
  const timestamp = new Date().toISOString();
  const currentTime = new Date();
  const limitLogFile = `./logs/claude-session-limit-${Date.now()}.log`;
  
  // Calculate suggested wait times based on error type
  const limitInfo = analyzeLimitType(error.message);
  const waitMinutes = limitInfo.suggestedWaitMinutes;
  const resumeTime = new Date(currentTime.getTime() + waitMinutes * 60000);
  
  const recommendations = [
    "🛑 CLAUDE SESSION LIMIT REACHED",
    "",
    "📋 What happened:",
    `- Error: ${error.message}`,
    `- Prompt: "${prompt}"`,
    `- Time: ${timestamp}`,
    `- Limit type: ${limitInfo.type}`,
    limitInfo.extractedFromMessage ? `- Claude said available again at: ${limitInfo.exactEndTime}` : "",
    "",
    "⏰ Timing information:",
    `- Current time: ${currentTime.toLocaleString()}`,
    `- Suggested wait: ${waitMinutes} minutes`,
    `- Try again after: ${resumeTime.toLocaleString()}`,
    `- Resume at: ${resumeTime.toISOString()}`,
    limitInfo.extractedFromMessage ? "- ✅ Time extracted directly from Claude's message" : "- ⚠️ Time estimated based on limit type",
    "",
    "🔄 Recommended actions:",
    `1. Take a break for at least ${waitMinutes} minutes`,
    "2. Try again after the suggested time above",
    limitInfo.type === '5-hour' ? "3. Consider splitting work into shorter sessions (< 4 hours)" : "3. Monitor usage to avoid hitting limits again",
    "4. Check claude status page for any service issues",
    "",
    "⚡ Prevention tips:",
    "- Use shorter, more focused prompts",
    "- Batch multiple questions efficiently", 
    "- Take regular breaks during long coding sessions",
    limitInfo.type === '5-hour' ? "- Set reminders to take breaks every 3-4 hours" : "",
    "",
    "📊 Full error details:"
  ].filter(line => line !== ""); // Remove empty strings
  
  const limitLogContent = recommendations.join('\n') + '\n' +
                         `STDOUT: ${error.stdout || 'N/A'}\n` +
                         `STDERR: ${error.stderr || 'N/A'}\n` +
                         `Stack: ${error.stack || 'N/A'}\n` +
                         `=== End Session Limit Log ===\n\n`;
  
  try {
    await import('fs/promises').then(fs => fs.appendFile(limitLogFile, limitLogContent, 'utf8'));
    console.log(`🛑 Session limit error logged to: ${limitLogFile}`);
    console.log(`⏰ Recommendation: Take a break and try again later!`);
  } catch (logError) {
    console.error('Failed to log session limit error:', logError.message);
  }
}

/**
 * Analyzes the limit error message to determine wait time and type.
 * @param {string} errorMessage The error message to analyze.
 * @returns {{type: string, suggestedWaitMinutes: number}} Limit analysis results.
 */
function analyzeLimitType(errorMessage) {
  const message = errorMessage.toLowerCase();
  
  // Try to extract exact end time from claude's message
  const timePatterns = [
    /session will end at (\d{1,2}:\d{2})/i,
    /available again at (\d{1,2}:\d{2})/i,
    /try again after (\d{1,2}:\d{2})/i,
    /resume at (\d{1,2}:\d{2})/i,
    /until (\d{1,2}:\d{2})/i
  ];
  
  for (const pattern of timePatterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      const timeString = match[1];
      const [hours, minutes] = timeString.split(':').map(Number);
      const now = new Date();
      const endTime = new Date();
      endTime.setHours(hours, minutes, 0, 0);
      
      // If end time is earlier than now, assume it's tomorrow
      if (endTime <= now) {
        endTime.setDate(endTime.getDate() + 1);
      }
      
      const waitMinutes = Math.ceil((endTime - now) / (1000 * 60));
      return {
        type: 'exact-time',
        suggestedWaitMinutes: Math.max(waitMinutes, 5), // At least 5 minutes
        exactEndTime: endTime.toLocaleString(),
        extractedFromMessage: true
      };
    }
  }
  
  if (message.includes('approaching 5-hour') || message.includes('5-hour limit')) {
    // 5-hour limit - suggest waiting 1 hour (limits usually reset within 1-2 hours)
    return {
      type: '5-hour',
      suggestedWaitMinutes: 60
    };
  }
  
  if (message.includes('daily limit') || message.includes('24-hour')) {
    // Daily limit - suggest waiting until next day
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Start of next day
    const minutesUntilMidnight = Math.ceil((tomorrow - now) / (1000 * 60));
    
    return {
      type: 'daily',
      suggestedWaitMinutes: Math.min(minutesUntilMidnight, 24 * 60) // Max 24 hours
    };
  }
  
  if (message.includes('rate limit') || message.includes('too many requests')) {
    // Rate limit - usually short, suggest 15-30 minutes
    return {
      type: 'rate-limit',
      suggestedWaitMinutes: 30
    };
  }
  
  if (message.includes('quota exceeded')) {
    // Quota limit - could be monthly, suggest checking billing/usage
    return {
      type: 'quota',
      suggestedWaitMinutes: 60
    };
  }
  
  // Default for unknown limit types
  return {
    type: 'unknown',
    suggestedWaitMinutes: 45
  };
}

/**
 * Extracts the last session_id from recent logs.
 * @returns {Promise<string|null>} The last session_id or null if not found.
 */
async function getLastSessionId() {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Get all log files sorted by modification time (newest first)
    const logFiles = await fs.readdir('./logs');
    const executionLogs = logFiles
      .filter(file => file.startsWith('claude-execution-') && file.endsWith('.log'))
      .map(file => ({
        name: file,
        path: `./logs/${file}`,
        time: parseInt(file.match(/claude-execution-(\d+)\.log/)?.[1] || '0')
      }))
      .sort((a, b) => b.time - a.time);
    
    // Read the most recent log file
    if (executionLogs.length > 0) {
      const content = await fs.readFile(executionLogs[0].path, 'utf8');
      
      // Extract session_id from the log content
      const sessionMatch = content.match(/"session_id":"([^"]+)"/);
      if (sessionMatch) {
        return sessionMatch[1];
      }
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to extract session_id from logs:', error.message);
    return null;
  }
}

/**
 * Executes a prompt with a specific session ID.
 * @param {string} prompt The prompt to send to Claude.
 * @param {string} sessionId The specific session ID to resume.
 * @returns {Promise<object>} A promise that resolves with the final JSON output object from Claude.
 */
export async function executePromptWithSession(prompt, sessionId) {
  console.log(`Resuming conversation with session: ${sessionId}`);
  return await attemptClaudeExecution(prompt, sessionId);
}

/**
 * Executes claude with dynamic timeout that extends when output is detected.
 * @param {string} prompt The prompt to send to Claude.
 * @param {string|null} sessionId Session ID to resume, or null for new session.
 * @returns {Promise<{stdout: string, stderr: string}>} The execution result.
 */
async function executeClaudeWithDynamicTimeout(prompt, sessionId = null) {
  return new Promise((resolve, reject) => {
    
    const args = [];
    if (sessionId) {
      args.push('--resume', sessionId);
    }
    args.push(prompt, '-p', '--output-format=stream-json', '--verbose');
    
    const child = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    let lastOutputTime = Date.now();
    let isFinished = false;
    
    const INITIAL_TIMEOUT = 30000; // 30 seconds initial
    const ACTIVITY_TIMEOUT = 60000; // 1 minute of inactivity allowed
    const MAX_TOTAL_TIME = 20 * 60000; // 20 minutes maximum
    
    // Reset timeout whenever we see new output
    const resetTimeout = () => {
      lastOutputTime = Date.now();
    };
    
    // Monitor for activity and kill if inactive too long
    const activityChecker = setInterval(() => {
      if (isFinished) return;
      
      const timeSinceLastOutput = Date.now() - lastOutputTime;
      const totalTime = Date.now() - lastOutputTime + timeSinceLastOutput;
      
      if (totalTime > MAX_TOTAL_TIME) {
        console.log('⏰ Maximum execution time reached (20 minutes)');
        child.kill('SIGTERM');
        clearInterval(activityChecker);
        reject(new Error('Maximum execution time exceeded (20 minutes)'));
        return;
      }
      
      if (timeSinceLastOutput > ACTIVITY_TIMEOUT) {
        console.log('💀 No activity detected for 1 minute, killing process');
        child.kill('SIGTERM');
        clearInterval(activityChecker);
        reject(new Error(`No output received for ${ACTIVITY_TIMEOUT/1000} seconds`));
        return;
      }
      
      // Show activity indicators we're looking for
      if (stdout.includes('✻') || stdout.includes('🔍') || stdout.includes('⚙️') || 
          stdout.includes('Forging') || stdout.includes('Processing') || stdout.includes('Searching')) {
        console.log('✨ Claude is active, extending timeout...');
        resetTimeout();
      }
    }, 5000); // Check every 5 seconds
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      resetTimeout();
      
      // Log interesting activity
      const newData = data.toString();
      if (newData.includes('✻') || newData.includes('Forging') || newData.includes('Processing')) {
        console.log('🔄 Activity detected:', newData.trim().substring(0, 50) + '...');
      }
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      resetTimeout();
    });
    
    child.on('close', (code) => {
      isFinished = true;
      clearInterval(activityChecker);
      
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Claude process exited with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      isFinished = true;
      clearInterval(activityChecker);
      reject(error);
    });
    
    // Initial timeout
    setTimeout(() => {
      if (!isFinished && stdout.length === 0) {
        console.log('⏰ Initial timeout - no output received');
        child.kill('SIGTERM');
        clearInterval(activityChecker);
        reject(new Error('Initial timeout - no response from claude'));
      }
    }, INITIAL_TIMEOUT);
  });
}