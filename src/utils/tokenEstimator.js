import fs from 'fs/promises';
import path from 'path';

/**
 * Adaptive token estimation system with project-specific polynomials
 */

const ESTIMATION_DATA_FILE = path.join(process.cwd(), '.eck-token-training.json');

/**
 * Default coefficients for different project types (bytes to tokens ratio)
 * Format: [constant, linear, quadratic, cubic] coefficients
 */
const DEFAULT_COEFFICIENTS = {
  'android': [0, 0.25, 0, 0], // Start with simple 1/4 ratio
  'nodejs': [0, 0.20, 0, 0],
  'python': [0, 0.22, 0, 0],
  'rust': [0, 0.18, 0, 0],
  'go': [0, 0.19, 0, 0],
  'unknown': [0, 0.25, 0, 0]
};

/**
 * Load training data from file
 */
async function loadTrainingData() {
  try {
    const data = await fs.readFile(ESTIMATION_DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return default structure
    return {
      coefficients: { ...DEFAULT_COEFFICIENTS },
      trainingPoints: {}
    };
  }
}

/**
 * Save training data to file
 */
async function saveTrainingData(data) {
  await fs.writeFile(ESTIMATION_DATA_FILE, JSON.stringify(data, null, 2));
}

/**
 * Calculate polynomial value
 */
function evaluatePolynomial(coefficients, x) {
  let result = 0;
  for (let i = 0; i < coefficients.length; i++) {
    result += coefficients[i] * Math.pow(x, i);
  }
  return Math.max(0, result); // Ensure non-negative result
}

/**
 * Estimate tokens using project-specific polynomial
 */
export async function estimateTokensWithPolynomial(projectType, fileSizeInBytes) {
  const data = await loadTrainingData();
  const coefficients = data.coefficients[projectType] || data.coefficients['unknown'];
  
  const estimatedTokens = evaluatePolynomial(coefficients, fileSizeInBytes);
  return Math.round(estimatedTokens);
}

/**
 * Generate training command string for data collection
 */
export function generateTrainingCommand(projectType, estimatedTokens, fileSizeInBytes, projectPath) {
  const projectName = path.basename(projectPath);
  
  return `eck-snapshot train-tokens ${projectType} ${fileSizeInBytes} ${estimatedTokens} `;
}

/**
 * Add training point and update polynomial coefficients
 */
export async function addTrainingPoint(projectType, fileSizeInBytes, estimatedTokens, actualTokens) {
  const data = await loadTrainingData();
  
  // Initialize training points array for project type if it doesn't exist
  if (!data.trainingPoints[projectType]) {
    data.trainingPoints[projectType] = [];
  }
  
  // Add new training point
  const trainingPoint = {
    fileSizeInBytes,
    estimatedTokens,
    actualTokens,
    timestamp: new Date().toISOString()
  };
  
  data.trainingPoints[projectType].push(trainingPoint);
  
  // Recalculate coefficients using least squares fitting
  updateCoefficients(data, projectType);
  
  await saveTrainingData(data);
  
  console.log(`✅ Added training point for ${projectType}:`);
  console.log(`   File size: ${fileSizeInBytes} bytes`);
  console.log(`   Estimated: ${estimatedTokens} tokens`);
  console.log(`   Actual: ${actualTokens} tokens`);
  console.log(`   Error: ${Math.abs(actualTokens - estimatedTokens)} tokens (${Math.round(Math.abs(actualTokens - estimatedTokens) / actualTokens * 100)}%)`);
}

/**
 * Update polynomial coefficients using least squares fitting
 * For now, we'll use a simple adaptive approach
 */
function updateCoefficients(data, projectType) {
  const points = data.trainingPoints[projectType];
  if (points.length < 2) return;
  
  // Simple linear regression for now (bytes -> tokens)
  // We can make this more sophisticated later with higher order polynomials
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const n = points.length;
  
  for (const point of points) {
    const x = point.fileSizeInBytes;
    const y = point.actualTokens;
    
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  
  // Calculate linear coefficients: y = a + bx
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Update coefficients [constant, linear, quadratic, cubic]
  data.coefficients[projectType] = [
    Math.max(0, intercept), // constant term (ensure non-negative)
    Math.max(0, slope),     // linear term (ensure non-negative)
    0,                      // quadratic (not used yet)
    0                       // cubic (not used yet)
  ];
}

/**
 * Show current estimation statistics
 */
export async function showEstimationStats() {
  const data = await loadTrainingData();
  
  console.log('\n📊 Token Estimation Statistics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  for (const [projectType, coefficients] of Object.entries(data.coefficients)) {
    const points = data.trainingPoints[projectType] || [];
    console.log(`\n🔸 ${projectType}:`);
    console.log(`   Coefficients: [${coefficients.map(c => c.toFixed(6)).join(', ')}]`);
    console.log(`   Training points: ${points.length}`);
    
    if (points.length > 0) {
      const errors = points.map(p => Math.abs(p.actualTokens - p.estimatedTokens));
      const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
      console.log(`   Average error: ${Math.round(avgError)} tokens`);
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}