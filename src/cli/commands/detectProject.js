import { detectProjectType, getProjectSpecificFiltering } from '../../utils/projectDetector.js';
import { displayProjectInfo } from '../../utils/fileUtils.js';
import { isAndroidParsingAvailable, getParserInfo } from '../../core/androidParser.js';
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
    
    // Show Android parsing capabilities if it's an Android project
    if (detection.type === 'android') {
      console.log(chalk.green('🤖 Android parsing capabilities:'));
      
      const isAvailable = await isAndroidParsingAvailable();
      const parserInfo = await getParserInfo();
      
      console.log(`   Tree-sitter parsing: ${isAvailable ? chalk.green('✓ Available') : chalk.red('✗ Not available')}`);
      console.log(`   Java parser: ${parserInfo.java ? chalk.green('✓') : chalk.red('✗')}`);
      console.log(`   Kotlin parser: ${parserInfo.kotlin ? chalk.green('✓') : chalk.red('✗')}`);
      console.log(`   Fallback parsing: ${parserInfo.fallbackAvailable ? chalk.green('✓') : chalk.red('✗')}`);
      
      if (!isAvailable) {
        console.log(chalk.yellow('\n   💡 Install tree-sitter parsers for better Android support:'));
        console.log(chalk.gray('      npm install tree-sitter-java tree-sitter-kotlin'));
      }
      
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
 * Command to test Android file parsing
 * @param {string} filePath - Path to the Android file to test
 * @param {object} options - Command options
 */
export async function testAndroidParsing(filePath, options = {}) {
  console.log(chalk.blue(`🧪 Testing Android file parsing: ${filePath}\n`));
  
  try {
    const { parseAndroidFile, getFileLanguage } = await import('../../core/androidParser.js');
    const fs = await import('fs/promises');
    
    // Detect file language
    const language = getFileLanguage(filePath);
    if (!language) {
      console.log(chalk.red('❌ Not an Android source file (expected .kt, .kts, or .java)'));
      return;
    }
    
    console.log(chalk.green(`✓ Detected language: ${language}`));
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(chalk.blue(`📄 File size: ${content.length} characters`));
    
    // Parse file
    const segments = await parseAndroidFile(content, language, filePath);
    
    console.log(chalk.green(`\n🎯 Extracted ${segments.length} segments:`));
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`\n${i + 1}. ${chalk.yellow(segment.name)} (${segment.type})`);
      
      if (segment.startLine && segment.endLine) {
        console.log(`   Lines: ${segment.startLine}-${segment.endLine}`);
      }
      
      if (segment.context) {
        const context = segment.context;
        if (context.modifiers && context.modifiers.length > 0) {
          console.log(`   Modifiers: ${context.modifiers.join(', ')}`);
        }
        if (context.annotations && context.annotations.length > 0) {
          console.log(`   Annotations: ${context.annotations.join(', ')}`);
        }
      }
      
      if (options.showContent) {
        const preview = segment.content.substring(0, 200);
        console.log(chalk.gray(`   Content preview: ${preview}${segment.content.length > 200 ? '...' : ''}`));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error parsing Android file:'), error.message);
    process.exit(1);
  }
}