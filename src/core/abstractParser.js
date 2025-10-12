import Parser from 'tree-sitter';
import C from 'tree-sitter-c';

const parser = new Parser();
parser.setLanguage(C);

export async function createAbstract(sourceCode, level = 5) {
  const tree = parser.parse(sourceCode);
  let abstractContent = '';

  function extractName(node) {
    // Try to find the name field
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      return nameNode.text;
    }
    // Fallback: look for identifier in children
    for (const child of node.children) {
      if (child.type === 'type_identifier' || child.type === 'identifier') {
        return child.text;
      }
    }
    return null;
  }

  function walk(node) {
    const nodeType = node.type;

    // Skip preprocessor conditionals - don't show #if/#ifdef/#endif blocks
    if (nodeType === 'preproc_ifdef' ||
        nodeType === 'preproc_if' ||
        nodeType === 'preproc_elif' ||
        nodeType === 'preproc_else') {
      // Process children but don't show the conditional directives themselves
      for (const child of node.children) {
        walk(child);
      }
      return;
    }

    // Rule-based filtering based on abstraction level
    switch (nodeType) {
      case 'preproc_include':
      case 'preproc_def':
      case 'preproc_function_def':
        abstractContent += node.text + '\n';
        return;

      case 'type_definition': {
        // Check if this is a typedef with struct/union/enum definition
        let hasComplexType = false;
        for (const child of node.children) {
          if (child.type === 'struct_specifier' ||
              child.type === 'union_specifier' ||
              child.type === 'enum_specifier') {
            hasComplexType = true;
            // Extract typedef name (last identifier before semicolon)
            const text = node.text.trim();
            const match = text.match(/typedef\s+(?:struct|union|enum)\s*\{[^}]*\}\s*(\w+)/);
            if (match) {
              const typeName = match[1];
              const keyword = child.type.replace('_specifier', '');
              // Just declare the type without body
              abstractContent += `typedef ${keyword} ${typeName} ${typeName};\n`;
            } else {
              // Fallback: just show typedef without details
              const simpleMatch = text.match(/typedef\s+[^;]+\s+(\w+);/);
              if (simpleMatch) {
                abstractContent += `typedef struct ${simpleMatch[1]};\n`;
              }
            }
            return;
          }
        }
        // Simple typedef (e.g., typedef int myint) - keep as is
        abstractContent += node.text + '\n';
        return;
      }

      case 'struct_specifier':
      case 'union_specifier':
      case 'enum_specifier': {
        const keyword = nodeType.replace('_specifier', '');
        const name = extractName(node);
        if (name) {
          // Forward declaration only
          abstractContent += `${keyword} ${name};\n`;
        }
        return; // Don't traverse children (skip field definitions)
      }

      case 'declaration': {
        let text = node.text.trim();

        // Remove inline comments (both // and /* */)
        text = text.replace(/\/\/.*$/gm, '').replace(/\/\*.*?\*\//g, '').trim();

        // Check if this is a function prototype (has function_declarator)
        let isFunctionPrototype = false;
        for (const child of node.children) {
          if (child.type === 'function_declarator') {
            isFunctionPrototype = true;
            break;
          }
        }

        // Always keep function prototypes at all levels
        if (isFunctionPrototype) {
          abstractContent += text + '\n';
          return;
        }

        // Skip array declarations at low abstraction levels
        if (level <= 3 && text.includes('[')) {
          return;
        }

        // Skip variable assignments unless extern
        if (text.includes('=') && !text.startsWith('extern')) {
          // At level <= 3, skip all non-extern declarations
          if (level <= 3) {
            return;
          }
          // At higher levels, show only the declaration part (remove initialization)
          const declMatch = text.match(/^([^=]+)/);
          if (declMatch) {
            abstractContent += declMatch[1].trim() + ';\n';
          }
          return;
        }

        // Keep extern declarations at all levels
        if (text.startsWith('extern')) {
          abstractContent += text + '\n';
          return;
        }

        // For level <= 3, skip non-extern variable declarations
        if (level <= 3) {
          return;
        }

        // Keep simple variable declarations at higher levels
        abstractContent += text + '\n';
        return;
      }

      case 'function_definition': {
        const functionBody = node.childForFieldName('body');
        if (functionBody) {
          const signatureEnd = functionBody.startIndex;
          abstractContent += sourceCode.substring(node.startIndex, signatureEnd).trim().replace(/\s*\n\s*/g, ' ') + ';\n\n';
        } else {
          abstractContent += node.text + ';\n';
        }
        return; // Stop traversal for this branch
      }

      case 'comment': {
        if (level >= 9) {
          abstractContent += node.text + '\n'; // Keep all comments
        } else if (level >= 7 && node.text.startsWith('/**')) {
          abstractContent += node.text + '\n'; // Keep doc-style comments
        }
        return;
      }
    }

    // Traverse children for unhandled node types
    for (const child of node.children) {
      walk(child);
    }
  }

  walk(tree.rootNode);

  // Final cleanup pass
  let result = abstractContent;

  // Remove all inline comments that might have slipped through
  result = result.replace(/\/\/.*$/gm, '');
  result = result.replace(/\/\*.*?\*\//gs, '');

  // Remove lines that are just preprocessor conditionals without content
  result = result.replace(/^#(if|ifdef|ifndef|elif|else|endif).*$/gm, '');

  // For low abstraction levels, remove array declarations and complex lines
  if (level <= 3) {
    // Remove lines with array brackets [...]
    result = result.split('\n').filter(line => {
      const trimmed = line.trim();
      // Keep lines without brackets or lines that are just forward declarations
      if (trimmed.includes('[') && !trimmed.match(/^(struct|union|enum|typedef)\s+\w+\s*;/)) {
        return false;
      }
      return true;
    }).join('\n');
  }

  // Clean up excessive newlines and whitespace
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/[ \t]+$/gm, ''); // Remove trailing spaces
  result = result.trim();

  return result;
}
