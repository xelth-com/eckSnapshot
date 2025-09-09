import { detectProjectType, getProjectSpecificFiltering } from '../../utils/projectDetector.js';
import { displayProjectInfo } from '../../utils/fileUtils.js';
import chalk from 'chalk';

/**
 * Command to detect and display project information
 * @param {string} projectPath - Path to the project
 * @param {object} options - Command options
 */
export async function detectProject(projectPath = '.', options = {}) {
  console.log(chalk.blue('🔍 Detecting project type...\n'));
  
  try {
    // Detect project type
    const detection = await detectProjectType(projectPath);
    displayProjectInfo(detection);
    
    // Show filtering rules that would be applied
    if (detection.type !== 'unknown') {
      const filtering = await getProjectSpecificFiltering(detection.type);
      
      if (filtering.filesToIgnore.length > 0 || 
          filtering.dirsToIgnore.length > 0 || 
          filtering.extensionsToIgnore.length > 0) {
        console.log(chalk.yellow('📋 Project-specific filtering rules:'));
        
        if (filtering.filesToIgnore.length > 0) {
          console.log(`   Files to ignore: ${filtering.filesToIgnore.join(', ')}`);
        }
        
        if (filtering.dirsToIgnore.length > 0) {
          console.log(`   Directories to ignore: ${filtering.dirsToIgnore.join(', ')}`);
        }
        
        if (filtering.extensionsToIgnore.length > 0) {
          console.log(`   Extensions to ignore: ${filtering.extensionsToIgnore.join(', ')}`);
        }
        
        console.log('');
      }
    }
    
    // Show Android parsing info if it's an Android project
    if (detection.type === 'android') {
      console.log(chalk.green('🤖 Android parsing supported via unified segmenter'));
      console.log('');
    }
    
    // Show verbose details if requested
    if (options.verbose && detection.allDetections) {
      console.log(chalk.blue('📊 All detection results:'));
      for (const result of detection.allDetections) {
        console.log(`   ${result.type}: score ${result.score}, priority ${result.priority}`);
      }
      console.log('');
    }
    
    // Provide suggestions
    console.log(chalk.blue('💡 Suggested commands:'));
    
    if (detection.type === 'android') {
      console.log('   eck-snapshot snapshot --profile android-core    # Core Android files');
      console.log('   eck-snapshot snapshot --profile android-config  # Build configuration');
      console.log('   eck-snapshot index                              # For large projects');
    } else if (detection.type === 'nodejs') {
      console.log('   eck-snapshot snapshot --profile backend         # Backend code');
      console.log('   eck-snapshot snapshot --profile frontend        # Frontend code');
      console.log('   eck-snapshot index                              # For large projects');
    } else {
      console.log('   eck-snapshot snapshot                           # Full project snapshot');
      console.log('   eck-snapshot index                              # For semantic search');
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error detecting project:'), error.message);
    process.exit(1);
  }
}

/**
 * Command to test file parsing using the unified segmenter
 * @param {string} filePath - Path to the file to test
 * @param {object} options - Command options
 */
export async function testFileParsing(filePath, options = {}) {
  console.log(chalk.blue(`🧪 Testing file parsing: ${filePath}\n`));
  
  try {
    const { segmentFile } = await import('../../core/segmenter.js');
    const fs = await import('fs/promises');
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(chalk.blue(`📄 File size: ${content.length} characters`));
    
    // Parse file using unified segmenter
    const chunks = await segmentFile(filePath);
    
    console.log(chalk.green(`\n🎯 Extracted ${chunks.length} chunks:`));
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`\n${i + 1}. ${chalk.yellow(chunk.chunk_name)} (${chunk.chunk_type})`);
      
      if (options.showContent) {
        const preview = chunk.code.substring(0, 200);
        console.log(chalk.gray(`   Content preview: ${preview}${chunk.code.length > 200 ? '...' : ''}`));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error parsing file:'), error.message);
    process.exit(1);
  }
}