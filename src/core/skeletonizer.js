import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import _generate from '@babel/generator';
const generate = _generate.default || _generate;

// Lazy-load tree-sitter to avoid breaking when native bindings are unavailable
let Parser = null;
let Python = null;
let Java = null;
let Kotlin = null;
let C = null;
let Rust = null;
let Go = null;

async function loadTreeSitter() {
    if (Parser) return true; // Already loaded

    try {
        // We use dynamic imports and check for basic sanity to handle broken native builds (common on Windows)
        const treeSitterModule = await import('tree-sitter').catch(() => null);
        if (!treeSitterModule || !treeSitterModule.default) return false;

        Parser = treeSitterModule.default;

        // Load language packs with Promise.allSettled to handle individual failures
        const langs = await Promise.allSettled([
            import('tree-sitter-python'),
            import('tree-sitter-java'),
            import('tree-sitter-kotlin'),
            import('tree-sitter-c'),
            import('tree-sitter-rust'),
            import('tree-sitter-go')
        ]);

        Python = langs[0].status === 'fulfilled' ? langs[0].value.default : null;
        Java = langs[1].status === 'fulfilled' ? langs[1].value.default : null;
        Kotlin = langs[2].status === 'fulfilled' ? langs[2].value.default : null;
        C = langs[3].status === 'fulfilled' ? langs[3].value.default : null;
        Rust = langs[4].status === 'fulfilled' ? langs[4].value.default : null;
        Go = langs[5].status === 'fulfilled' ? langs[5].value.default : null;

        return true;
    } catch (error) {
        // Silently fail, skeletonize will fallback to original content
        return false;
    }
}

// Initialize parsers map (will be populated lazily)
const languages = {
    '.py': () => Python,
    '.java': () => Java,
    '.kt': () => Kotlin,
    '.c': () => C,
    '.h': () => C,
    '.cpp': () => C,
    '.hpp': () => C,
    '.rs': () => Rust,
    '.go': () => Go
};

/**
 * Strips implementation details from code.
 * @param {string} content - Full file content
 * @param {string} filePath - File path to determine language
 * @param {object} [options] - Options
 * @param {boolean} [options.preserveDocs=true] - Keep JSDoc/docstrings (depth 6) or strip them (depth 5)
 * @returns {Promise<string>} - Skeletonized code
 */
export async function skeletonize(content, filePath, options = {}) {
    if (!content) return content;
    const preserveDocs = options.preserveDocs !== undefined ? options.preserveDocs : true;

    // 1. JS/TS Strategy (Babel is better for JS ecosystem)
    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(filePath)) {
        return skeletonizeJs(content, preserveDocs);
    }

    // 2. Tree-sitter Strategy (Python, Java, Kotlin, C, Rust, Go)
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    if (languages[ext]) {
        // Lazy-load tree-sitter
        const available = await loadTreeSitter();
        const langModule = languages[ext]();

        // Only attempt tree-sitter if both the parser and the specific language module are ready
        if (available && Parser && langModule) {
            return skeletonizeTreeSitter(content, langModule, ext, preserveDocs);
        }
        // Fallback to regex-based skeletonizer when tree-sitter is unavailable
        return skeletonizeRegex(content, ext, preserveDocs);
    }

    // 3. Fallback for other languages — try regex if it uses braces
    return skeletonizeRegex(content, filePath.substring(filePath.lastIndexOf('.')), preserveDocs);
}

function skeletonizeJs(content, preserveDocs = true) {
    try {
        const ast = parse(content, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx', 'decorators-legacy'],
            errorRecovery: true
        });

        const emptyBody = (path) => {
            if (path.node.body && path.node.body.type === 'BlockStatement') {
                if (preserveDocs) {
                    // Keep leading comments (JSDoc) before emptying body
                    const leadingComments = path.node.leadingComments || [];
                    path.node.body.body = [];
                    path.node.body.innerComments = leadingComments.length > 0
                        ? leadingComments
                        : [{ type: 'CommentBlock', value: ' ... ' }];
                } else {
                    // Strip everything including docs
                    path.node.leadingComments = null;
                    path.node.body.body = [];
                    path.node.body.innerComments = [{ type: 'CommentBlock', value: ' ... ' }];
                }
            }
        };

        traverse(ast, {
            Function: emptyBody,
            ClassMethod: emptyBody
        });

        const output = generate(ast, {}, content);
        return output.code;
    } catch (e) {
        return content + '\n// [Skeleton parse error]';
    }
}

function skeletonizeTreeSitter(content, language, ext, preserveDocs = true) {
    try {
        const parser = new Parser();
        parser.setLanguage(language);
        const tree = parser.parse(content);

        // Define node types that represent function bodies
        const bodyTypes = ['block', 'function_body', 'compound_statement'];
        const replacements = [];

        const visit = (node) => {
            const type = node.type;
            let isFunction = false;
            let replacementText = '{ /* ... */ }';

            // Language specific detection
            if (ext === '.rs') {
                isFunction = ['function_item', 'method_declaration'].includes(type);
            } else if (ext === '.go') {
                isFunction = ['function_declaration', 'method_declaration'].includes(type);
            } else if (ext === '.py') {
                isFunction = type === 'function_definition';
                replacementText = '...';
            } else {
                isFunction = [
                    'function_definition',
                    'method_declaration',
                    'function_declaration'
                ].includes(type);
            }

            if (isFunction) {
                let bodyNode = null;
                for (let i = 0; i < node.childCount; i++) {
                    const child = node.child(i);
                    if (bodyTypes.includes(child.type)) {
                        bodyNode = child;
                        break;
                    }
                }

                if (bodyNode) {
                    // For Python with preserveDocs: keep docstring as first statement
                    if (preserveDocs && ext === '.py' && bodyNode.childCount > 0) {
                        const docstring = extractPythonDocstring(bodyNode);
                        if (docstring) {
                            replacements.push({
                                start: bodyNode.startIndex,
                                end: bodyNode.endIndex,
                                text: docstring + '\n    ...'
                            });
                            return;
                        }
                    }

                    replacements.push({
                        start: bodyNode.startIndex,
                        end: bodyNode.endIndex,
                        text: replacementText
                    });
                    return;
                }
            }

            // If not preserveDocs, also strip standalone comment blocks
            if (!preserveDocs && type === 'comment') {
                replacements.push({
                    start: node.startIndex,
                    end: node.endIndex,
                    text: ''
                });
                return;
            }

            for (let i = 0; i < node.childCount; i++) {
                visit(node.child(i));
            }
        };

        visit(tree.rootNode);
        replacements.sort((a, b) => b.start - a.start);

        let currentContent = content;
        for (const rep of replacements) {
            currentContent = currentContent.substring(0, rep.start) + rep.text + currentContent.substring(rep.end);
        }

        // Clean up excessive blank lines from stripped comments
        if (!preserveDocs) {
            currentContent = currentContent.replace(/\n{3,}/g, '\n\n');
        }

        return currentContent;
    } catch (e) {
        return content + `\n// [Skeleton error: ${e.message}]`;
    }
}

/**
 * Regex-based fallback skeletonizer for when tree-sitter is unavailable.
 * Works by counting braces to find and hollow out function bodies.
 * Supports: Rust, Go, Java, C/C++, Python, and other brace-based languages.
 */
function skeletonizeRegex(content, ext, preserveDocs = true) {
    if (ext === '.py') {
        return skeletonizePythonRegex(content, preserveDocs);
    }
    // Brace-based languages (Rust, Go, Java, C, C++, etc.)
    return skeletonizeBraceRegex(content, ext, preserveDocs);
}

/**
 * Skeleton for brace-based languages: finds function/method signatures
 * and replaces their bodies with { /* ... * / }
 */
function skeletonizeBraceRegex(content, ext, preserveDocs) {
    const lines = content.split('\n');
    const result = [];
    let i = 0;

    // Patterns that indicate a function/method definition line
    // We look for lines ending with '{' that look like function signatures
    const fnPatterns = {
        '.rs': /^\s*(?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?(?:fn|impl)\s+/,
        '.go': /^\s*func\s+/,
        '.java': /^\s*(?:public|private|protected|static|final|abstract|synchronized|native|\s)*\s+\w+\s*\([^)]*\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*)?\s*\{?\s*$/,
        '.kt': /^\s*(?:(?:public|private|protected|internal|override|open|abstract|suspend|inline|fun)\s+)+/,
        '.c': null, // use generic detection
        '.h': null,
        '.cpp': null,
        '.hpp': null,
    };

    const fnPattern = fnPatterns[ext] || null;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // Skip doc comments if !preserveDocs
        if (!preserveDocs) {
            // Block doc comments: /** ... */ or /// lines
            if (trimmed.startsWith('///') || trimmed.startsWith('//!')) {
                i++;
                continue;
            }
            if (trimmed.startsWith('/**') || trimmed.startsWith('/*!')) {
                while (i < lines.length && !lines[i].includes('*/')) {
                    i++;
                }
                i++; // skip the closing */
                continue;
            }
        }

        // Check if this line starts a function definition
        let isFnLine = false;
        if (fnPattern) {
            isFnLine = fnPattern.test(line);
        } else {
            // Generic C/C++ heuristic: line has parens and ends with or is followed by {
            isFnLine = /\w+\s*\([^;]*\)\s*\{?\s*$/.test(trimmed) && !trimmed.startsWith('if') &&
                !trimmed.startsWith('while') && !trimmed.startsWith('for') &&
                !trimmed.startsWith('switch') && !trimmed.startsWith('#');
        }

        // For Rust: also handle impl blocks — keep them but skeleton their methods
        if (isFnLine) {
            // Find the opening brace (may be on same line or next line)
            let sigLines = [line];
            let j = i + 1;

            // If no opening brace on this line, scan ahead for it
            if (!line.includes('{')) {
                while (j < lines.length) {
                    sigLines.push(lines[j]);
                    if (lines[j].includes('{')) {
                        j++;
                        break;
                    }
                    j++;
                }
            } else {
                // Opening brace is on the signature line
            }

            // Now count braces to find the end of the body
            let braceCount = 0;
            let bodyStart = i;
            let bodyEnd = i;
            let foundOpen = false;

            for (let k = i; k < (foundOpen ? lines.length : j); k++) {
                for (const ch of lines[k]) {
                    if (ch === '{') { braceCount++; foundOpen = true; }
                    if (ch === '}') braceCount--;
                }
                bodyEnd = k;
                if (foundOpen && braceCount === 0) break;
            }

            // If we didn't finish counting, continue from j
            if (foundOpen && braceCount > 0) {
                for (let k = j; k < lines.length; k++) {
                    for (const ch of lines[k]) {
                        if (ch === '{') braceCount++;
                        if (ch === '}') braceCount--;
                    }
                    bodyEnd = k;
                    if (braceCount === 0) break;
                }
            }

            if (foundOpen && braceCount === 0) {
                // Emit signature (up to opening brace) + skeleton
                const sigText = sigLines.join('\n');
                const braceIdx = sigText.indexOf('{');
                const signature = sigText.substring(0, braceIdx).trimEnd();
                const indent = line.match(/^(\s*)/)[1];
                result.push(signature + ' { /* ... */ }');
                i = bodyEnd + 1;
                continue;
            }
        }

        result.push(line);
        i++;
    }

    return result.join('\n');
}

/**
 * Skeleton for Python: finds function/class defs and replaces bodies with ...
 */
function skeletonizePythonRegex(content, preserveDocs) {
    const lines = content.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trimStart();
        const indent = line.length - trimmed.length;

        if (/^(async\s+)?def\s+/.test(trimmed) || /^class\s+/.test(trimmed)) {
            result.push(line);
            i++;

            // Determine body indent (should be > current indent)
            const bodyIndent = indent + 4; // standard Python indent

            // Check for docstring
            if (i < lines.length) {
                const nextTrimmed = lines[i].trimStart();
                if (preserveDocs && (nextTrimmed.startsWith('"""') || nextTrimmed.startsWith("'''"))) {
                    const quote = nextTrimmed.substring(0, 3);
                    // Emit docstring lines
                    if (nextTrimmed.indexOf(quote, 3) > 0) {
                        // Single-line docstring
                        result.push(lines[i]);
                        i++;
                    } else {
                        // Multi-line docstring
                        result.push(lines[i]);
                        i++;
                        while (i < lines.length && !lines[i].trimStart().includes(quote)) {
                            result.push(lines[i]);
                            i++;
                        }
                        if (i < lines.length) {
                            result.push(lines[i]); // closing quote line
                            i++;
                        }
                    }
                }
            }

            // Add ... and skip body
            result.push(' '.repeat(bodyIndent) + '...');

            // Skip remaining body lines (lines with indent > current def indent)
            while (i < lines.length) {
                const bodyLine = lines[i];
                const bodyTrimmed = bodyLine.trimStart();
                const bodyLineIndent = bodyLine.length - bodyTrimmed.length;
                // Empty lines or lines indented more than the def are part of body
                if (bodyTrimmed === '' || bodyLineIndent > indent) {
                    i++;
                } else {
                    break;
                }
            }
            continue;
        }

        result.push(line);
        i++;
    }

    return result.join('\n');
}

/**
 * Extract Python docstring from the first statement of a function body block.
 */
function extractPythonDocstring(bodyNode) {
    for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        // Python docstrings are expression_statement containing a string
        if (child.type === 'expression_statement') {
            const expr = child.child(0);
            if (expr && expr.type === 'string') {
                // Return the indented docstring text
                return '\n    ' + expr.text;
            }
        }
        // Skip newline/indent tokens, but stop at first real statement
        if (child.type !== 'newline' && child.type !== 'indent' && child.type !== 'NEWLINE' && child.type !== 'INDENT') {
            if (child.type !== 'expression_statement') break;
        }
    }
    return null;
}
