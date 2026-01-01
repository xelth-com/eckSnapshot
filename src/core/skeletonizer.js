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
 * @returns {Promise<string>} - Skeletonized code
 */
export async function skeletonize(content, filePath) {
    if (!content) return content;

    // 1. JS/TS Strategy (Babel is better for JS ecosystem)
    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(filePath)) {
        return skeletonizeJs(content);
    }

    // 2. Tree-sitter Strategy (Python, Java, Kotlin, C, Rust, Go)
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    if (languages[ext]) {
        // Lazy-load tree-sitter
        const available = await loadTreeSitter();
        const langModule = languages[ext]();

        // Only attempt tree-sitter if both the parser and the specific language module are ready
        if (available && Parser && langModule) {
            return skeletonizeTreeSitter(content, langModule, ext);
        }
        return content; // Fallback: return original content if tree-sitter unavailable
    }

    // 3. Fallback (Return as is)
    return content;
}

function skeletonizeJs(content) {
    try {
        const ast = parse(content, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx', 'decorators-legacy'],
            errorRecovery: true
        });

        traverse(ast, {
            Function(path) {
                if (path.node.body && path.node.body.type === 'BlockStatement') {
                    // Preserve leading comments (JSDoc) before emptying body
                    const leadingComments = path.node.leadingComments || [];
                    path.node.body.body = [];
                    path.node.body.innerComments = leadingComments.length > 0
                        ? leadingComments
                        : [{ type: 'CommentBlock', value: ' ... ' }];
                }
            },
            ClassMethod(path) {
                if (path.node.body && path.node.body.type === 'BlockStatement') {
                    // Preserve leading comments (JSDoc) before emptying body
                    const leadingComments = path.node.leadingComments || [];
                    path.node.body.body = [];
                    path.node.body.innerComments = leadingComments.length > 0
                        ? leadingComments
                        : [{ type: 'CommentBlock', value: ' ... ' }];
                }
            }
        });

        const output = generate(ast, {}, content);
        return output.code;
    } catch (e) {
        return content + '\n// [Skeleton parse error]';
    }
}

function skeletonizeTreeSitter(content, language, ext) {
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
                    replacements.push({
                        start: bodyNode.startIndex,
                        end: bodyNode.endIndex,
                        text: replacementText
                    });
                    return;
                }
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

        return currentContent;
    } catch (e) {
        return content + `\n// [Skeleton error: ${e.message}]`;
    }
}
