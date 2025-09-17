import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

/**
 * Interacts with the Gemini web UI to get a response for a given prompt.
 * Uses human-like typing simulation for robust input submission.
 * @param {string} prompt The text to submit to Gemini.
 * @param {object} options Configuration for the browser session.
 * @returns {Promise<string>} The response text from Gemini.
 */
export async function getGeminiResponse(prompt, options = {}) {
  let browser;
  let page;
  
  try {
    console.log('🚀 Launching Chrome browser...');
    
    // Launch Chrome without using the active profile to avoid conflicts
    try {
      const chromePath = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
      browser = await chromium.launch({
        executablePath: chromePath,
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-dev-shm-usage'
        ]
      });
      console.log('✅ Successfully launched system Chrome');
    } catch (error) {
      console.log('⚠️ Failed to launch system Chrome, using chromium...');
      browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      console.log('✅ Successfully launched chromium');
    }
    
    page = await browser.newPage();

    console.log('🌐 Navigating to gemini.google.com...');
    await page.goto('https://gemini.google.com');

    console.log('⏳ Waiting for page to load...');
    await page.waitForTimeout(5000); // Brief wait for page load
    
    // Handle any consent dialogs that might appear
    try {
      const acceptButtons = [
        'button:has-text("Accept all")',
        'button:has-text("Alle akzeptieren")',
        'button:has-text("I agree")',
        'button:has-text("Ich stimme zu")'
      ];
      
      for (const selector of acceptButtons) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          await page.click(selector);
          console.log(`✅ Clicked consent button: ${selector}`);
          await page.waitForTimeout(3000);
          break;
        } catch (error) {
          // Continue to next selector
        }
      }
    } catch (error) {
      console.log('ℹ️ No consent dialogs found');
    }

    // Handle login if needed
    console.log('🔐 Checking for login form...');
    try {
      // Wait a bit to see if login form appears
      await page.waitForTimeout(5000);
      
      // Check if we're on a login page or need to click sign in first
      const currentUrl = page.url();
      console.log(`🔍 Current URL: ${currentUrl}`);
      
      // First, try to find and click "Anmelden" or "Sign in" button if it exists
      const signinButtons = [
        'button:has-text("Anmelden")',
        'button:has-text("Sign in")',
        'a:has-text("Anmelden")',
        'a:has-text("Sign in")'
      ];
      
      for (const selector of signinButtons) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          await page.click(selector);
          console.log(`✅ Clicked initial sign in button: ${selector}`);
          await page.waitForTimeout(3000);
          break;
        } catch (error) {
          // Continue to next selector
        }
      }
      
      // Now check if we're on the actual login form
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin') || page.url().includes('accounts.google.com')) {
        console.log('📧 Login form detected, entering credentials...');
        
        // Enter email
        const emailSelectors = [
          'input[type="email"]',
          'input[name="identifier"]',
          '#identifierId'
        ];
        
        for (const selector of emailSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            await page.click(selector);
            await page.keyboard.type('mail@xelth.com', { delay: 100 });
            console.log('✅ Entered email');
            
            // Press Enter after email
            await page.keyboard.press('Enter');
            console.log('✅ Pressed Enter after email');
            
            await page.waitForTimeout(3000);
            break;
          } catch (error) {
            // Continue to next selector
          }
        }
        
        // Enter password
        const passwordSelectors = [
          'input[type="password"]',
          'input[name="password"]',
          '#password'
        ];
        
        for (const selector of passwordSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            await page.click(selector);
            await page.keyboard.type('duckd.,gxMentio529', { delay: 100 });
            console.log('✅ Entered password');
            
            // Press Enter after password
            await page.keyboard.press('Enter');
            console.log('✅ Pressed Enter after password');
            
            await page.waitForTimeout(5000);
            break;
          } catch (error) {
            // Continue to next selector
          }
        }
        
        // Wait for redirect to Gemini
        console.log('⏳ Waiting for redirect to Gemini...');
        await page.waitForTimeout(10000);
      }
    } catch (error) {
      console.log('ℹ️ No login form found or already logged in');
    }

    // Additional wait for full page load
    await page.waitForTimeout(5000);
    
    console.log('🔍 Looking for input element...');
    
    // Find the input element - try the most common Gemini selector first
    const inputElement = page.locator('div.ql-editor[contenteditable="true"]').first();
    
    try {
      // Wait for the input element to be available
      await inputElement.waitFor({ timeout: 10000 });
      console.log('✅ Found input element');
      
      // Click to focus the input element
      console.log('🎯 Clicking input element to focus...');
      await inputElement.click();
      await page.waitForTimeout(1000);
      
      // Clear any existing text
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(500);
      
      // Type the prompt character by character with human-like delay
      console.log('⌨️ Typing prompt character by character...');
      await page.keyboard.type(prompt, { delay: 100 });
      await page.waitForTimeout(2000);
      
      console.log('🚀 Submitting with Enter key...');
      await page.keyboard.press('Enter');
      
    } catch (error) {
      console.log('⚠️ Standard input element not found, trying alternative approach...');
      
      // Fallback: try clicking anywhere and typing
      await page.click('body');
      await page.waitForTimeout(1000);
      await page.keyboard.type(prompt, { delay: 100 });
      await page.waitForTimeout(2000);
      await page.keyboard.press('Enter');
    }
    
    console.log('⏳ Waiting for Gemini response...');
    
    // Wait for response - look for the last response container
    let responseText = '';
    const maxWaitTime = 60000; // 60 seconds - longer wait for response
    const startTime = Date.now();
    
    while (!responseText.trim() && (Date.now() - startTime) < maxWaitTime) {
      await page.waitForTimeout(3000); // Wait 3 seconds between checks
      
      try {
        // Look for response in the most common Gemini response containers
        const responseSelectors = [
          '.response-container .markdown',
          '.markdown',
          '[data-testid*="response"]',
          '.model-response',
          '.assistant-message'
        ];
        
        for (const selector of responseSelectors) {
          try {
            const elements = await page.$$(selector);
            if (elements.length > 0) {
              // Get the last (most recent) response
              const lastElement = elements[elements.length - 1];
              const text = await lastElement.textContent();
              
              if (text && text.trim() && text.length > 10 && !text.includes(prompt)) {
                responseText = text.trim();
                console.log(`✅ Found response using selector: ${selector}`);
                break;
              }
            }
          } catch (error) {
            // Continue to next selector
          }
        }
        
        if (responseText.trim()) break;
        
        // Fallback: get all text and try to find a meaningful response
        const bodyText = await page.textContent('body');
        const lines = bodyText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        // Look for new content that appeared after our prompt
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (line.length > 20 && 
              !line.includes('Enter a prompt') && 
              !line.includes('Send') &&
              !line.includes('Loading') &&
              !line.includes('Generating') &&
              !line.includes('Menü') &&
              !line.includes('Dokumente') &&
              !line.includes(prompt)) {
            responseText = line;
            console.log('✅ Found response using text analysis');
            break;
          }
        }
        
      } catch (error) {
        console.log('⚠️ Error during response extraction:', error.message);
      }
      
      console.log('🔄 Still waiting for response...');
    }
    
    if (!responseText.trim()) {
      // Take a screenshot for debugging
      await page.screenshot({ path: 'debug-gemini-response.png' });
      console.log('📸 Screenshot saved for debugging');
      throw new Error('Could not extract response from Gemini within timeout period');
    }
    
    console.log('✅ Successfully extracted Gemini response');
    return responseText;

  } catch (error) {
    console.error('❌ Error during Gemini automation:', error);
    
    // Save debug information
    try {
      if (browser && page) {
        await page.screenshot({ path: 'logs/gemini-error-screenshot.png' });
        
        const htmlContent = await page.content();
        await fs.promises.writeFile('logs/gemini-error-page.html', htmlContent);
      }
    } catch (debugError) {
      console.error('⚠️ Failed to save debug information:', debugError);
    }
    
    throw error;
  } finally {
    // Don't close browser - keep it open for next questions
    console.log('✅ Keeping browser open for next question...');
  }
}