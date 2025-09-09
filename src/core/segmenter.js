import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default;
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import Java from 'tree-sitter-java';
import Kotlin from 'tree-sitter-kotlin';

// --- Utility Functions ---
function generateId(filePath, segmentName, startLine) {
  return crypto.createHash('md5').update(`${filePath}:${segmentName}:${startLine}`).digest('hex');
}

// --- Tree-sitter Parser Logic ---
const tsParser = new Parser();
const languageParsers = {
    '.py': Python,
    '.java': Java,
    '.kt': Kotlin,
};

async function _segmentWithTreeSitter(content, filePath, language) {
    tsParser.setLanguage(language);
    const tree = tsParser.parse(content);
    const chunks = [];
    const relations = []; // Not implemented for Tree-sitter yet, but prepared for future

    function walkTree(node) {
        const importantTypes = {
            'function_definition': 'function', // Python
            'class_definition': 'class', // Python
            'function_declaration': 'function', // Kotlin
            'class_declaration': 'class', // Kotlin/Java
            'method_declaration': 'function', // Java
        };
        if (importantTypes[node.type]) {
            const nameNode = node.childForFieldName('name') || node.child(1);
            const chunkName = nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : 'anonymous';
            const chunkCode = content.slice(node.startIndex, node.endIndex);
            const startLine = node.startPosition.row + 1;
            chunks.push({
                id: generateId(filePath, chunkName, startLine),
                filePath,
                chunk_type: importantTypes[node.type],
                chunk_name: chunkName,
                code: chunkCode,
            });
        }
        for (let i = 0; i < node.childCount; i++) {
            walkTree(node.child(i));
        }
    }
    walkTree(tree.rootNode);
    return { chunks, relations };
}

// --- Babel Parser for JavaScript ---
async function _segmentJavaScript(content, filePath) {
    const chunks = [];
    const relations = [];
    const nameToChunkId = {};

    try {
        const ast = parse(content, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true });

        const addChunk = (type, node, name) => {
            const chunkName = name || 'anonymous';
            const chunkCode = content.slice(node.start, node.end);
            const chunkId = generateId(filePath, chunkName, node.loc.start.line);
            nameToChunkId[chunkName] = chunkId;
            chunks.push({ id: chunkId, filePath, chunk_type: type, chunk_name: chunkName, code: chunkCode });
            return chunkId;
        };

        traverse(ast, {
            FunctionDeclaration(path) {
                addChunk('function', path.node, path.node.id?.name);
            },
            ClassDeclaration(path) {
                addChunk('class', path.node, path.node.id?.name);
            },
            ImportDeclaration(path) {
                const sourceFile = path.node.source.value;
                path.node.specifiers.forEach(specifier => {
                    if (specifier.type === 'ImportSpecifier') {
                        relations.push({ from: filePath, to: sourceFile, type: 'IMPORTS' });
                    }
                });
            },
            CallExpression(path) {
                const calleeName = path.get('callee').toString();
                const parentFunction = path.findParent((p) => p.isFunctionDeclaration());
                if (parentFunction) {
                    const parentName = parentFunction.node.id?.name;
                    if (parentName) {
                        relations.push({ from: parentName, to: calleeName, type: 'CALLS' });
                    }
                }
            },
        });
    } catch (e) {
        console.error(`Babel parsing error in ${filePath}: ${e.message}`);
    }
    return { chunks, relations };
}

// --- Main Router Function ---
export async function segmentFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const extension = path.extname(filePath);
        let result = { chunks: [], relations: [] };

        if (['.js', '.jsx', '.ts', '.tsx'].includes(extension)) {
            result = await _segmentJavaScript(content, filePath);
        } else if (languageParsers[extension]) {
            result = await _segmentWithTreeSitter(content, filePath, languageParsers[extension]);
        } 
        
        if (result.chunks.length === 0) {
            const chunkId = generateId(filePath, path.basename(filePath), 1);
            result.chunks.push({ id: chunkId, filePath, chunk_type: 'file', chunk_name: path.basename(filePath), code: content });
        }

        return result;
    } catch (error) {
        console.error(`Failed to segment file ${filePath}: ${error.message}`);
        return { chunks: [], relations: [] };
    }
}