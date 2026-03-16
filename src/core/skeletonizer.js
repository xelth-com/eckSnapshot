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
        return content; // Fallback: return original content if tree-sitter unavailable
    }

    // 3. Fallback (Return as is)
    return content;
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
