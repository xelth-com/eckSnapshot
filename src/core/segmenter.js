import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default;
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

function generateId(filePath, segmentName, occurrence) {
  return crypto.createHash('md5').update(`${filePath}:${segmentName}:${occurrence}`).digest('hex');
}

function generateHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function segmentJavaScript(content, filePath) {
  const segments = [];
  const nameOccurrences = new Map();

  try {
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'importMeta'],
      errorRecovery: true,
    });

    const createSegment = (pathNode, type, name) => {
      const segmentName = name || 'anonymous';
      const occurrence = (nameOccurrences.get(segmentName) || 0) + 1;
      nameOccurrences.set(segmentName, occurrence);

      const segmentContent = content.slice(pathNode.start, pathNode.end);
      return {
        id: generateId(filePath, segmentName, occurrence),
        type,
        name: segmentName,
        filePath,
        content: segmentContent,
        contentHash: generateHash(segmentContent),
      };
    };

    traverse(ast, {
      FunctionDeclaration(path) {
        segments.push(createSegment(path.node, 'function', path.node.id?.name));
      },
      ClassDeclaration(path) {
        segments.push(createSegment(path.node, 'class', path.node.id?.name));
      }
    });
  
    if (segments.length === 0) {
        segments.push({ id: generateId(filePath, 'file', 1), type: 'file', name: path.basename(filePath), filePath, content, contentHash: generateHash(content) });
    }

  } catch (e) {
    throw new Error(`Failed to parse ${filePath} with AST. Please check the file for syntax errors or unsupported JavaScript features. Original error: ${e.message}`);
  }
  return segments;
}

export async function segmentFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      return segmentJavaScript(content, filePath);
    }
    const fileContent = content;
    return [{ id: generateId(filePath, 'file', 1), type: 'file', name: path.basename(filePath), filePath, content: fileContent, contentHash: generateHash(fileContent) }];
  } catch (error) {
      if (error.message.startsWith('Failed to parse')) {
          throw error; // Re-throw the specific parser error
      }
      console.error(`Failed to read file ${filePath}: ${error.message}`);
      return [];
  }
}