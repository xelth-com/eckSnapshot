import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

function generateId(filePath, startLine) {
  return crypto.createHash('md5').update(`${filePath}:${startLine}`).digest('hex');
}

async function segmentJavaScript(content, filePath) {
  const segments = [];
  try {
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true,
    });

    traverse(ast, {
      FunctionDeclaration(path) {
        segments.push({
          id: generateId(filePath, path.node.loc.start.line),
          type: 'function',
          name: path.node.id?.name || 'anonymous',
          filePath,
          content: content.slice(path.node.start, path.node.end)
        });
      },
      ClassDeclaration(path) {
        segments.push({
          id: generateId(filePath, path.node.loc.start.line),
          type: 'class',
          name: path.node.id?.name,
          filePath,
          content: content.slice(path.node.start, path.node.end)
        });
      }
    });
  } catch (e) {
    console.warn(`Could not parse ${filePath} with AST, treating as a single chunk.`);
    segments.push({ id: generateId(filePath, 1), type: 'file', name: path.basename(filePath), filePath, content });
  }
  return segments.length > 0 ? segments : [{ id: generateId(filePath, 1), type: 'file', name: path.basename(filePath), filePath, content }];
}

export async function segmentFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const ext = path.extname(filePath);
  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    return segmentJavaScript(content, filePath);
  }
  return [{ id: generateId(filePath, 1), type: 'file', name: path.basename(filePath), filePath, content }];
}