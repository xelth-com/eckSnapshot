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

function generateHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

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
    // Graph relations for tree-sitter are not implemented in this step.
    const relations = [];

    function walk(node) {
        const nodeTypeMap = {
            'function_definition': 'function', 'class_definition': 'class', // Python
            'function_declaration': 'function', 'class_declaration': 'class', // Kotlin/Java
            'method_declaration': 'function', // Java
        };

        if (nodeTypeMap[node.type]) {
            const nameNode = node.childForFieldName('name') || node.child(1);
            const chunkName = nameNode ? nameNode.text : 'anonymous';
            const chunkCode = node.text;
            chunks.push({
                filePath,
                chunk_type: nodeTypeMap[node.type],
                chunk_name: chunkName,
                code: chunkCode,
                contentHash: generateHash(chunkCode)
            });
        }
        node.children.forEach(walk);
    }
    walk(tree.rootNode);
    return { chunks, relations };
}

async function _segmentJavaScript(content, filePath) {
    const chunks = [];
    const relations = [];

    try {
        const ast = parse(content, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true });

        const getChunkData = (node) => {
            const chunkName = node.id ? node.id.name : 'anonymous';
            const chunkCode = content.substring(node.start, node.end);
            return { filePath, chunk_name: chunkName, code: chunkCode, contentHash: generateHash(chunkCode) };
        };

        traverse(ast, {
            enter(path) {
                let currentScopeName = 'file';
                const parentFunction = path.findParent((p) => p.isFunctionDeclaration() || p.isClassDeclaration());
                if (parentFunction && parentFunction.node.id) {
                    currentScopeName = parentFunction.node.id.name;
                }

                if (path.isFunctionDeclaration() || path.isClassDeclaration()) {
                    chunks.push({ ...getChunkData(path.node), chunk_type: path.isClassDeclaration() ? 'class' : 'function' });
                }

                if (path.isImportDeclaration()) {
                    const sourceFile = path.node.source.value;
                    relations.push({ from: filePath, to: sourceFile, type: 'IMPORTS' });
                }

                if (path.isCallExpression()) {
                    const calleeName = path.get('callee').toString();
                    relations.push({ from: currentScopeName, to: calleeName, type: 'CALLS' });
                }
            }
        });
    } catch (e) {
        console.error(`Babel parsing error in ${filePath}: ${e.message}`);
    }
    return { chunks, relations };
}

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
        
        // Fallback: if no specific chunks, treat the whole file as one
        if (result.chunks.length === 0) {
            const code = content;
            result.chunks.push({ filePath, chunk_type: 'file', chunk_name: path.basename(filePath), code, contentHash: generateHash(code) });
        }

        return result;
    } catch (error) {
        console.error(`Failed to segment file ${filePath}: ${error.message}`);
        return { chunks: [], relations: [] };
    }
}