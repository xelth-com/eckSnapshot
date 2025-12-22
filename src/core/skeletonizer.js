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

async function loadTreeSitter() {
    if (!Parser) {
        try {
            const treeSitterModule = await import('tree-sitter');
            Parser = treeSitterModule.default;
            Python = (await import('tree-sitter-python')).default;
            Java = (await import('tree-sitter-java')).default;
            Kotlin = (await import('tree-sitter-kotlin')).default;
            C = (await import('tree-sitter-c')).default;
        } catch (error) {
            console.warn('Tree-sitter not available:', error.message);
            return false;
        }
    }
    return true;
}

// Initialize parsers map (will be populated lazily)
const languages = {
    '.py': () => Python,
    '.java': () => Java,
    '.kt': () => Kotlin,
    '.c': () => C,
    '.h': () => C,
    '.cpp': () => C, // C parser often handles C++ basics well enough for skeletons
    '.hpp': () => C
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

    // 2. Tree-sitter Strategy (Python, Java, Kotlin, C)
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    if (languages[ext]) {
        // Lazy-load tree-sitter
        const available = await loadTreeSitter();
        if (!available) {
            return content; // Fallback: return original content if tree-sitter unavailable
        }
        return skeletonizeTreeSitter(content, languages[ext]());
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
                    path.node.body.body = [];
                    path.node.body.innerComments = [{ type: 'CommentBlock', value: ' Implementation hidden. Use `eck-snapshot show` to view. ' }];
                }
            },
            ClassMethod(path) {
                if (path.node.body && path.node.body.type === 'BlockStatement') {
                    path.node.body.body = [];
                    path.node.body.innerComments = [{ type: 'CommentBlock', value: ' Implementation hidden ' }];
                }
            }
        });

        const output = generate(ast, {}, content);
        return output.code;
    } catch (e) {
        return content + '\n// [Skeleton generation warning: Babel parse failed, returning full content]';
    }
}

function skeletonizeTreeSitter(content, language) {
    try {
        const parser = new Parser();
        parser.setLanguage(language);
        const tree = parser.parse(content);

        // We will reconstruct the file by slicing the original string,
        // skipping over the bodies of functions/methods.

        // Define node types that represent function bodies for different languages
        const bodyTypes = ['block', 'function_body', 'compound_statement'];

        // Helper to traverse and find bodies
        // Note: Tree-sitter traversal for modification is tricky. 
        // A simpler approach for "skeleton" is to find Definition nodes and capture their signatures,
        // but replacing in-place is harder without a printer.
        // 
        // ALTERNATIVE SIMPLIFIED APPROACH for v1 stability:
        // Iterate specific node types that define functions, locate their 'body' child, and create a replacement map.

        const replacements = [];

        const visit = (node) => {
            // Check for function definitions
            const isFunction = [
                'function_definition', // Python, C
                'method_declaration',  // Java
                'function_declaration', // Kotlin
                'class_declaration',   // Kotlin/Java/Python (to clean init blocks if needed, but risky)
            ].includes(node.type);

            if (isFunction) {
                // Find the body node
                let bodyNode = null;
                for (let i = 0; i < node.childCount; i++) {
                    const child = node.child(i);
                    if (bodyTypes.includes(child.type)) {
                        bodyNode = child;
                        break;
                    }
                }

                if (bodyNode) {
                    // Identify indentation for nice formatting
                    const start = bodyNode.startIndex;
                    const end = bodyNode.endIndex;
                    replacements.push({ start, end, text: '{ /* Implementation hidden */ }' });
                    return; // Don't traverse inside the body we just stripped
                }
            }

            // Python uses colons and indentation, distinct from {} blocks
            if (node.type === 'function_definition' && language === Python) {
                const body = node.lastChild;
                if (body && body.type === 'block') {
                    replacements.push({
                        start: body.startIndex,
                        end: body.endIndex,
                        text: 'pass  # Implementation hidden'
                    });
                    return;
                }
            }

            for (let i = 0; i < node.childCount; i++) {
                visit(node.child(i));
            }
        };

        visit(tree.rootNode);

        // Sort replacements reversed to apply without messing up indices
        replacements.sort((a, b) => b.start - a.start);

        let currentContent = content;
        for (const rep of replacements) {
            currentContent = currentContent.substring(0, rep.start) + rep.text + currentContent.substring(rep.end);
        }

        return currentContent;

    } catch (e) {
        return content + `\n// [Skeleton generation warning: Tree-sitter failed: ${e.message}]`;
    }
}
