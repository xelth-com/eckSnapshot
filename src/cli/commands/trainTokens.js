import { addTrainingPoint, showEstimationStats } from '../../utils/tokenEstimator.js';

/**
 * Train token estimation with actual results
 * @param {string} projectType - Type of project (android, nodejs, etc.)
 * @param {string} fileSizeStr - File size in bytes
 * @param {string} estimatedStr - Estimated tokens
 * @param {string} actualStr - Actual tokens (from user input)
 */
export async function trainTokens(projectType, fileSizeStr, estimatedStr, actualStr) {
  try {
    const fileSizeInBytes = parseInt(fileSizeStr, 10);
    const estimatedTokens = parseInt(estimatedStr, 10);
    
    // Parse actual tokens from user input (remove any text like "tokens", commas, etc.)
    const actualTokens = parseInt(actualStr.replace(/[^\d]/g, ''), 10);
    
    if (isNaN(fileSizeInBytes) || isNaN(estimatedTokens) || isNaN(actualTokens)) {
      throw new Error('Invalid numeric values provided');
    }
    
    await addTrainingPoint(projectType, fileSizeInBytes, estimatedTokens, actualTokens);
    
    console.log('\n📈 Updated polynomial coefficients for improved estimation.');
    
  } catch (error) {
    console.error(`❌ Error training token estimation: ${error.message}`);
    console.error('Usage: eck-snapshot train-tokens <project-type> <file-size-bytes> <estimated-tokens> <actual-tokens>');
    process.exit(1);
  }
}

/**
 * Show token estimation statistics
 */
export async function showTokenStats() {
  await showEstimationStats();
}