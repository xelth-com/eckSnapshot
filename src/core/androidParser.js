import path from 'path';

// Tree-sitter parsers will be loaded dynamically
let javaParser = null;
let kotlinParser = null;
let Parser = null;

/**
 * Initialize parsers with proper error handling
 */
async function initializeParsers() {
  try {
    // Try to load Tree-sitter base parser first
    if (!Parser) {
      try {
        const TreeSitter = await import('tree-sitter');
        Parser = TreeSitter.default;
      } catch (error) {
        // Tree-sitter not available, will use fallback parsing
        return;
      }
    }
    
    // Try to load Java parser
    if (!javaParser && Parser) {
      try {
        const Java = await import('tree-sitter-java');
        javaParser = new Parser();
        javaParser.setLanguage(Java.default);
      } catch (error) {
        // Java parser not available, will use fallback
      }
    }

    // Try to load Kotlin parser
    if (!kotlinParser && Parser) {
      try {
        const Kotlin = await import('tree-sitter-kotlin');
        kotlinParser = new Parser();
        kotlinParser.setLanguage(Kotlin.default);
      } catch (error) {
        // Kotlin parser not available, will use fallback
      }
    }
  } catch (error) {
    // Tree-sitter initialization failed, will use fallback parsing
  }
}

/**
 * Determines if a file should be parsed as Kotlin or Java
 * @param {string} filePath - Path to the file
 * @returns {'kotlin'|'java'|null}
 */
export function getFileLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.kt' || ext === '.kts') {
    return 'kotlin';
  } else if (ext === '.java') {
    return 'java';
  }
  
  return null;
}

/**
 * Parses Android source files and extracts meaningful segments
 * @param {string} content - File content
 * @param {string} language - 'kotlin' or 'java'
 * @param {string} filePath - Path to the file
 * @returns {Array} Array of code segments
 */
export async function parseAndroidFile(content, language, filePath) {
  await initializeParsers();
  
  const parser = language === 'kotlin' ? kotlinParser : javaParser;
  
  if (!parser) {
    // Fallback to simple text-based parsing
    return fallbackParsing(content, language, filePath);
  }

  try {
    const tree = parser.parse(content);
    const segments = [];
    
    // Extract different types of code segments
    extractSegments(tree.rootNode, content, segments, language);
    
    return segments;
  } catch (error) {
    console.warn(`⚠️ Failed to parse ${filePath} with tree-sitter:`, error.message);
    return fallbackParsing(content, language, filePath);
  }
}

/**
 * Recursively extracts code segments from the AST
 */
function extractSegments(node, sourceCode, segments, language) {
  // Define important node types for Android development
  const importantNodeTypes = new Set([
    'class_declaration',
    'interface_declaration', 
    'object_declaration', // Kotlin
    'enum_declaration',
    'annotation_declaration',
    'method_declaration',
    'function_declaration', // Kotlin
    'constructor_declaration',
    'field_declaration',
    'property_declaration', // Kotlin
    'companion_object', // Kotlin
    'init_block', // Kotlin
    'lambda_expression',
    'anonymous_class'
  ]);

  if (importantNodeTypes.has(node.type)) {
    const segment = {
      type: node.type,
      language,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      content: sourceCode.slice(node.startIndex, node.endIndex),
      name: extractElementName(node, sourceCode)
    };
    
    // Add contextual information
    segment.context = getContextualInfo(node, sourceCode, language);
    
    segments.push(segment);
  }

  // Recursively process child nodes
  for (let i = 0; i < node.childCount; i++) {
    extractSegments(node.child(i), sourceCode, segments, language);
  }
}

/**
 * Extracts the name of a code element (class, method, etc.)
 */
function extractElementName(node, sourceCode) {
  // Try to find identifier nodes
  const identifierNode = findChildByType(node, 'identifier') || 
                         findChildByType(node, 'simple_identifier') ||
                         findChildByType(node, 'type_identifier');
  
  if (identifierNode) {
    return sourceCode.slice(identifierNode.startIndex, identifierNode.endIndex);
  }
  
  return 'anonymous';
}

/**
 * Extracts contextual information for better LLM understanding
 */
function getContextualInfo(node, sourceCode, language) {
  const context = {};
  
  // Extract annotations
  const annotations = extractAnnotations(node, sourceCode);
  if (annotations.length > 0) {
    context.annotations = annotations;
  }
  
  // Extract modifiers (public, private, etc.)
  const modifiers = extractModifiers(node, sourceCode);
  if (modifiers.length > 0) {
    context.modifiers = modifiers;
  }
  
  // For classes, extract extends/implements
  if (node.type === 'class_declaration') {
    const inheritance = extractInheritance(node, sourceCode);
    if (inheritance) {
      context.inheritance = inheritance;
    }
  }
  
  // For methods, extract parameters and return type
  if (node.type === 'method_declaration' || node.type === 'function_declaration') {
    const signature = extractMethodSignature(node, sourceCode);
    if (signature) {
      context.signature = signature;
    }
  }
  
  return context;
}

/**
 * Fallback parsing when tree-sitter is not available
 */
function fallbackParsing(content, language, filePath) {
  const segments = [];
  const lines = content.split('\n');
  
  let currentSegment = null;
  let braceDepth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect class declarations
    if (line.match(/^(public|private|protected)?\s*(class|interface|object|enum)\s+\w+/)) {
      if (currentSegment) {
        segments.push(currentSegment);
      }
      
      currentSegment = {
        type: 'class_declaration',
        language,
        startLine: i + 1,
        content: '',
        name: extractNameFromLine(line)
      };
    }
    
    // Detect method/function declarations
    else if (line.match(/^(public|private|protected)?\s*(fun\s+|static\s+)?[\w<>[\],\s]+\s+\w+\s*\(/)) {
      if (currentSegment && currentSegment.type === 'method_declaration') {
        segments.push(currentSegment);
      }
      
      currentSegment = {
        type: language === 'kotlin' ? 'function_declaration' : 'method_declaration',
        language,
        startLine: i + 1,
        content: '',
        name: extractNameFromLine(line)
      };
    }
    
    // Track braces for segment boundaries
    braceDepth += (line.match(/\{/g) || []).length;
    braceDepth -= (line.match(/\}/g) || []).length;
    
    if (currentSegment) {
      currentSegment.content += lines[i] + '\n';
      
      // End segment when braces balance
      if (braceDepth === 0 && line.includes('}')) {
        currentSegment.endLine = i + 1;
        segments.push(currentSegment);
        currentSegment = null;
      }
    }
  }
  
  // Add any remaining segment
  if (currentSegment) {
    currentSegment.endLine = lines.length;
    segments.push(currentSegment);
  }
  
  return segments;
}

/**
 * Helper functions for AST parsing
 */
function findChildByType(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === type) {
      return child;
    }
    const found = findChildByType(child, type);
    if (found) return found;
  }
  return null;
}

function extractAnnotations(node, sourceCode) {
  const annotations = [];
  // This would need specific implementation based on tree-sitter grammar
  // For now, return empty array
  return annotations;
}

function extractModifiers(node, sourceCode) {
  const modifiers = [];
  // This would need specific implementation based on tree-sitter grammar
  return modifiers;
}

function extractInheritance(node, sourceCode) {
  // Extract extends/implements information
  return null;
}

function extractMethodSignature(node, sourceCode) {
  // Extract method parameters and return type
  return null;
}

function extractNameFromLine(line) {
  // Simple regex-based name extraction
  const match = line.match(/(?:class|interface|object|enum|fun|function)\s+(\w+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Checks if Android parsing is available
 */
export async function isAndroidParsingAvailable() {
  await initializeParsers();
  return javaParser !== null || kotlinParser !== null;
}

/**
 * Gets information about available parsers
 */
export async function getParserInfo() {
  await initializeParsers();
  
  return {
    java: javaParser !== null,
    kotlin: kotlinParser !== null,
    fallbackAvailable: true
  };
}