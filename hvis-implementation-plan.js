// ============================================
// ФАЗА 1: БАЗОВАЯ АРХИТЕКТУРА
// ============================================

// src/core/segmenter.js
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as ts from 'typescript';
import crypto from 'crypto';

export class CodeSegmenter {
  constructor(options = {}) {
    this.options = {
      maxSegmentSize: 2000,
      overlapSize: 200,
      minComplexity: 3,
      ...options
    };
    this.segments = new Map();
  }

  /**
   * Главный метод сегментации проекта
   */
  async segmentProject(projectPath, files) {
    const hierarchy = {
      project: await this.createProjectLevel(projectPath),
      modules: new Map(),
      files: new Map(),
      functions: new Map(),
      snippets: new Map()
    };

    for (const file of files) {
      const fileSegments = await this.segmentFile(file);
      this.mergeIntoHierarchy(hierarchy, fileSegments);
    }

    return hierarchy;
  }

  /**
   * Сегментация отдельного файла
   */
  async segmentFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);
    
    let segments = [];
    
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      segments = await this.segmentJavaScript(content, filePath);
    } else if (['.py'].includes(ext)) {
      segments = await this.segmentPython(content, filePath);
    } else {
      segments = await this.segmentGeneric(content, filePath);
    }

    return segments;
  }

  /**
   * AST-based сегментация JavaScript/TypeScript
   */
  async segmentJavaScript(content, filePath) {
    const segments = [];
    
    try {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy'],
        errorRecovery: true
      });

      traverse(ast, {
        // Функции
        FunctionDeclaration(path) {
          segments.push({
            id: generateId(filePath, path.node.loc.start),
            type: 'function',
            level: 'function',
            name: path.node.id?.name || 'anonymous',
            path: filePath,
            start: path.node.loc.start,
            end: path.node.loc.end,
            content: content.slice(path.node.start, path.node.end),
            complexity: calculateComplexity(path.node),
            params: path.node.params.map(p => getParamName(p)),
            async: path.node.async,
            generator: path.node.generator,
            metadata: extractJSDoc(path.node, content)
          });
        },

        // Классы
        ClassDeclaration(path) {
          const methods = [];
          
          path.traverse({
            ClassMethod(methodPath) {
              methods.push({
                name: methodPath.node.key.name,
                kind: methodPath.node.kind,
                static: methodPath.node.static,
                async: methodPath.node.async
              });
            }
          });

          segments.push({
            id: generateId(filePath, path.node.loc.start),
            type: 'class',
            level: 'module',
            name: path.node.id?.name,
            path: filePath,
            start: path.node.loc.start,
            end: path.node.loc.end,
            content: content.slice(path.node.start, path.node.end),
            methods,
            extends: path.node.superClass?.name,
            complexity: calculateClassComplexity(path.node)
          });
        },

        // Экспорты
        ExportNamedDeclaration(path) {
          if (path.node.declaration) {
            segments.push({
              id: generateId(filePath, path.node.loc.start),
              type: 'export',
              level: 'snippet',
              path: filePath,
              exported: getExportedNames(path.node),
              content: content.slice(path.node.start, path.node.end)
            });
          }
        },

        // Импорты
        ImportDeclaration(path) {
          segments.push({
            id: generateId(filePath, path.node.loc.start),
            type: 'import',
            level: 'snippet',
            path: filePath,
            source: path.node.source.value,
            imported: path.node.specifiers.map(s => s.local.name),
            content: content.slice(path.node.start, path.node.end)
          });
        }
      });

    } catch (error) {
      console.warn(`Failed to parse ${filePath}: ${error.message}`);
      // Fallback на простую сегментацию
      segments.push(...await this.segmentGeneric(content, filePath));
    }

    return segments;
  }

  /**
   * Умная сегментация для больших функций
   */
  splitLargeSegment(segment) {
    if (segment.content.length <= this.options.maxSegmentSize) {
      return [segment];
    }

    const lines = segment.content.split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;

    for (let i = 0; i < lines.length; i++) {
      currentChunk.push(lines[i]);
      currentSize += lines[i].length;

      if (currentSize >= this.options.maxSegmentSize - this.options.overlapSize) {
        // Добавляем overlap из следующих строк
        const overlapLines = lines.slice(i + 1, i + 5);
        chunks.push({
          ...segment,
          id: `${segment.id}_chunk_${chunks.length}`,
          content: currentChunk.concat(overlapLines).join('\n'),
          isChunk: true,
          chunkIndex: chunks.length,
          totalChunks: Math.ceil(segment.content.length / this.options.maxSegmentSize)
        });

        // Начинаем новый chunk с overlap
        currentChunk = lines.slice(Math.max(0, i - 2), i + 1);
        currentSize = currentChunk.join('\n').length;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push({
        ...segment,
        id: `${segment.id}_chunk_${chunks.length}`,
        content: currentChunk.join('\n'),
        isChunk: true,
        chunkIndex: chunks.length,
        totalChunks: chunks.length + 1
      });
    }

    return chunks;
  }
}

// ============================================
// src/vector/embeddings.js
// ============================================

export class EmbeddingGenerator {
  constructor(provider = 'local', options = {}) {
    this.provider = provider;
    this.options = options;
    this.cache = new Map();
    this.batchQueue = [];
    this.batchTimeout = null;
  }

  async initialize() {
    switch (this.provider) {
      case 'openai':
        const { OpenAI } = await import('openai');
        this.client = new OpenAI({ apiKey: this.options.apiKey });
        this.model = this.options.model || 'text-embedding-3-small';
        break;
        
      case 'local':
        const { pipeline } = await import('@xenova/transformers');
        this.embedder = await pipeline(
          'feature-extraction',
          'Xenova/all-MiniLM-L6-v2'
        );
        break;
        
      case 'ollama':
        // Используем Ollama для локальных эмбеддингов
        this.ollamaUrl = this.options.url || 'http://localhost:11434';
        this.model = this.options.model || 'nomic-embed-text';
        break;
    }
  }

  /**
   * Генерация эмбеддинга для сегмента кода
   */
  async generateEmbedding(segment) {
    // Проверяем кэш
    const cacheKey = this.getCacheKey(segment);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Подготавливаем текст для эмбеддинга
    const text = this.prepareText(segment);

    let embedding;
    switch (this.provider) {
      case 'openai':
        embedding = await this.generateOpenAIEmbedding(text);
        break;
      case 'local':
        embedding = await this.generateLocalEmbedding(text);
        break;
      case 'ollama':
        embedding = await this.generateOllamaEmbedding(text);
        break;
    }

    this.cache.set(cacheKey, embedding);
    return embedding;
  }

  /**
   * Подготовка текста для эмбеддинга
   */
  prepareText(segment) {
    let text = '';
    
    // Добавляем контекстную информацию
    if (segment.type) text += `Type: ${segment.type}\n`;
    if (segment.name) text += `Name: ${segment.name}\n`;
    if (segment.path) text += `Path: ${segment.path}\n`;
    
    // Добавляем метаданные для функций
    if (segment.type === 'function') {
      if (segment.params?.length) {
        text += `Parameters: ${segment.params.join(', ')}\n`;
      }
      if (segment.metadata?.description) {
        text += `Description: ${segment.metadata.description}\n`;
      }
    }
    
    // Добавляем основной контент
    text += `\nCode:\n${segment.content}`;
    
    // Обрезаем если слишком длинный
    const maxLength = this.options.maxTextLength || 8000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...';
    }
    
    return text;
  }

  /**
   * Batch processing для эффективности
   */
  async generateBatch(segments) {
    const batchSize = this.options.batchSize || 100;
    const results = [];
    
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      const texts = batch.map(s => this.prepareText(s));
      
      let embeddings;
      switch (this.provider) {
        case 'openai':
          const response = await this.client.embeddings.create({
            model: this.model,
            input: texts
          });
          embeddings = response.data.map(d => d.embedding);
          break;
          
        case 'local':
          embeddings = await Promise.all(
            texts.map(t => this.generateLocalEmbedding(t))
          );
          break;
      }
      
      // Сохраняем в кэш
      batch.forEach((segment, idx) => {
        const cacheKey = this.getCacheKey(segment);
        this.cache.set(cacheKey, embeddings[idx]);
      });
      
      results.push(...embeddings);
    }
    
    return results;
  }

  getCacheKey(segment) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({
        content: segment.content,
        type: segment.type,
        name: segment.name
      }))
      .digest('hex');
  }
}

// ============================================
// src/vector/vectorDB.js
// ============================================

export class VectorDatabase {
  constructor(provider = 'vectra', options = {}) {
    this.provider = provider;
    this.options = options;
    this.collections = new Map();
  }

  async initialize(projectName) {
    this.projectName = projectName;
    
    switch (this.provider) {
      case 'chroma':
        const { ChromaClient } = await import('chromadb');
        this.client = new ChromaClient({
          path: this.options.persistPath || './chroma_db'
        });
        break;
        
      case 'vectra':
        const { LocalIndex } = await import('vectra');
        this.index = new LocalIndex({
          path: this.options.persistPath || './vectra_index',
          dimensions: this.options.dimensions || 384
        });
        await this.index.createIndex();
        break;
        
      case 'memory':
        // Простая in-memory реализация для тестирования
        this.memoryStore = {
          vectors: [],
          metadata: []
        };
        break;
    }
  }

  /**
   * Создание коллекции для проекта
   */
  async createCollection(name, metadata = {}) {
    const collectionName = `${this.projectName}_${name}`;
    
    switch (this.provider) {
      case 'chroma':
        const collection = await this.client.createCollection({
          name: collectionName,
          metadata
        });
        this.collections.set(name, collection);
        return collection;
        
      case 'vectra':
        // Vectra использует единый индекс
        this.collections.set(name, this.index);
        return this.index;
        
      case 'memory':
        this.collections.set(name, {
          vectors: [],
          metadata: []
        });
        return this.collections.get(name);
    }
  }

  /**
   * Добавление сегментов в базу
   */
  async addSegments(segments, embeddings, collectionName = 'default') {
    const collection = this.collections.get(collectionName);
    
    switch (this.provider) {
      case 'chroma':
        await collection.add({
          ids: segments.map(s => s.id),
          embeddings: embeddings,
          metadatas: segments.map(s => ({
            type: s.type,
            level: s.level,
            name: s.name,
            path: s.path,
            complexity: s.complexity,
            parent_id: s.parent_id,
            dependencies: JSON.stringify(s.dependencies || [])
          })),
          documents: segments.map(s => s.content)
        });
        break;
        
      case 'vectra':
        for (let i = 0; i < segments.length; i++) {
          await this.index.insertItem({
            vector: embeddings[i],
            metadata: {
              id: segments[i].id,
              type: segments[i].type,
              level: segments[i].level,
              name: segments[i].name,
              path: segments[i].path,
              content: segments[i].content,
              complexity: segments[i].complexity
            }
          });
        }
        break;
        
      case 'memory':
        collection.vectors.push(...embeddings);
        collection.metadata.push(...segments);
        break;
    }
  }

  /**
   * Семантический поиск
   */
  async search(queryEmbedding, options = {}) {
    const {
      k = 10,
      filter = {},
      collectionName = 'default'
    } = options;
    
    const collection = this.collections.get(collectionName);
    
    switch (this.provider) {
      case 'chroma':
        const results = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: k,
          where: filter
        });
        return this.formatResults(results);
        
      case 'vectra':
        const items = await this.index.queryItems(queryEmbedding, k, filter);
        return items.map(item => ({
          id: item.metadata.id,
          score: item.score,
          metadata: item.metadata,
          content: item.metadata.content
        }));
        
      case 'memory':
        // Простой косинусный поиск
        const scores = collection.vectors.map((vec, idx) => ({
          score: this.cosineSimilarity(queryEmbedding, vec),
          index: idx
        }));
        
        scores.sort((a, b) => b.score - a.score);
        
        return scores.slice(0, k).map(s => ({
          id: collection.metadata[s.index].id,
          score: s.score,
          metadata: collection.metadata[s.index],
          content: collection.metadata[s.index].content
        }));
    }
  }

  /**
   * Гибридный поиск (векторный + keyword)
   */
  async hybridSearch(query, queryEmbedding, options = {}) {
    const vectorResults = await this.search(queryEmbedding, options);
    
    // Добавляем keyword matching
    const keywords = query.toLowerCase().split(/\s+/);
    
    const scoredResults = vectorResults.map(result => {
      let keywordScore = 0;
      const content = result.content.toLowerCase();
      
      keywords.forEach(keyword => {
        if (content.includes(keyword)) {
          keywordScore += 1;
        }
      });
      
      // Комбинируем векторный и keyword scores
      const combinedScore = result.score * 0.7 + (keywordScore / keywords.length) * 0.3;
      
      return {
        ...result,
        combinedScore,
        keywordMatches: keywordScore
      };
    });
    
    scoredResults.sort((a, b) => b.combinedScore - a.combinedScore);
    return scoredResults;
  }

  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// ============================================
// src/graph/dependency.js
// ============================================

import madge from 'madge';
import { Graph } from 'graphlib';

export class DependencyAnalyzer {
  constructor(options = {}) {
    this.options = options;
    this.graph = new Graph({ directed: true });
    this.modules = new Map();
    this.clusters = [];
  }

  /**
   * Построение графа зависимостей проекта
   */
  async analyzeProject(projectPath) {
    console.log('🔍 Analyzing project dependencies...');
    
    // Используем madge для анализа
    const result = await madge(projectPath, {
      fileExtensions: ['js', 'jsx', 'ts', 'tsx'],
      excludeRegExp: [/node_modules/, /test/, /\.test\./],
      detectiveOptions: {
        es6: {
          mixedImports: true
        },
        ts: {
          mixedImports: true,
          skipTypeImports: true
        }
      }
    });

    const dependencies = result.obj();
    
    // Строим граф
    for (const [module, deps] of Object.entries(dependencies)) {
      this.graph.setNode(module, {
        type: 'module',
        path: module,
        imports: deps,
        complexity: 0,
        centrality: 0
      });
      
      for (const dep of deps) {
        this.graph.setEdge(module, dep, {
          type: 'import',
          weight: 1
        });
      }
    }

    // Вычисляем метрики
    this.calculateMetrics();
    
    // Находим кластеры
    this.detectClusters();
    
    // Находим критические пути
    this.findCriticalPaths();
    
    return {
      graph: this.graph,
      modules: this.modules,
      clusters: this.clusters,
      metrics: this.metrics,
      criticalPaths: this.criticalPaths
    };
  }

  /**
   * Вычисление метрик графа
   */
  calculateMetrics() {
    this.metrics = {
      totalModules: this.graph.nodeCount(),
      totalDependencies: this.graph.edgeCount(),
      avgDependencies: this.graph.edgeCount() / this.graph.nodeCount(),
      maxInDegree: 0,
      maxOutDegree: 0,
      centralNodes: []
    };

    // Вычисляем degree centrality
    this.graph.nodes().forEach(node => {
      const inDegree = this.graph.inEdges(node).length;
      const outDegree = this.graph.outEdges(node).length;
      const centrality = inDegree + outDegree;
      
      this.graph.node(node).inDegree = inDegree;
      this.graph.node(node).outDegree = outDegree;
      this.graph.node(node).centrality = centrality;
      
      this.metrics.maxInDegree = Math.max(this.metrics.maxInDegree, inDegree);
      this.metrics.maxOutDegree = Math.max(this.metrics.maxOutDegree, outDegree);
      
      if (centrality > 10) {
        this.metrics.centralNodes.push({
          node,
          centrality,
          inDegree,
          outDegree
        });
      }
    });
    
    // Сортируем центральные узлы
    this.metrics.centralNodes.sort((a, b) => b.centrality - a.centrality);
  }

  /**
   * Обнаружение кластеров тесно связанных модулей
   */
  detectClusters() {
    // Используем алгоритм Tarjan для поиска сильно связанных компонент
    const tarjan = require('graphlib').alg.tarjan;
    const sccs = tarjan(this.graph);
    
    this.clusters = sccs
      .filter(scc => scc.length > 1)
      .map((scc, idx) => ({
        id: `cluster_${idx}`,
        modules: scc,
        size: scc.length,
        type: this.classifyCluster(scc),
        cohesion: this.calculateCohesion(scc)
      }))
      .sort((a, b) => b.size - a.size);
  }

  /**
   * Классификация кластера
   */
  classifyCluster(modules) {
    // Анализируем пути для определения типа кластера
    const paths = modules.map(m => m.split('/'));
    
    // Проверяем общие директории
    const commonPath = this.findCommonPath(paths);
    
    if (commonPath.includes('components')) return 'ui-components';
    if (commonPath.includes('services')) return 'services';
    if (commonPath.includes('utils')) return 'utilities';
    if (commonPath.includes('models')) return 'data-models';
    if (commonPath.includes('api')) return 'api-layer';
    
    return 'mixed';
  }

  /**
   * Поиск критических путей
   */
  findCriticalPaths() {
    this.criticalPaths = [];
    
    // Находим entry points (модули без входящих зависимостей)
    const entryPoints = this.graph.nodes().filter(
      node => this.graph.inEdges(node).length === 0
    );
    
    // Находим leaf nodes (модули без исходящих зависимостей)
    const leafNodes = this.graph.nodes().filter(
      node => this.graph.outEdges(node).length === 0
    );
    
    // Для каждой пары entry-leaf находим критический путь
    for (const entry of entryPoints) {
      for (const leaf of leafNodes) {
        const path = this.findPath(entry, leaf);
        if (path && path.length > 2) {
          this.criticalPaths.push({
            from: entry,
            to: leaf,
            path,
            length: path.length,
            complexity: this.calculatePathComplexity(path)
          });
        }
      }
    }
    
    // Сортируем по важности
    this.criticalPaths.sort((a, b) => b.complexity - a.complexity);
    
    // Оставляем топ-10
    this.criticalPaths = this.criticalPaths.slice(0, 10);
  }

  /**
   * Поиск пути между узлами
   */
  findPath(from, to) {
    const dijkstra = require('graphlib').alg.dijkstra;
    const results = dijkstra(this.graph, from);
    
    if (!results[to] || results[to].distance === Infinity) {
      return null;
    }
    
    // Восстанавливаем путь
    const path = [];
    let current = to;
    
    while (current !== from) {
      path.unshift(current);
      current = results[current].predecessor;
      if (!current) break;
    }
    
    if (current === from) {
      path.unshift(from);
      return path;
    }
    
    return null;
  }

  /**
   * Расчет сложности пути
   */
  calculatePathComplexity(path) {
    let complexity = path.length;
    
    for (const node of path) {
      const nodeData = this.graph.node(node);
      complexity += nodeData.centrality * 0.1;
      complexity += nodeData.outDegree * 0.05;
    }
    
    return complexity;
  }
}

// ============================================
// HELPERS
// ============================================

function generateId(filePath, location) {
  const hash = crypto.createHash('md5');
  hash.update(`${filePath}:${location.line}:${location.column}`);
  return hash.digest('hex').substring(0, 16);
}

function calculateComplexity(node) {
  // Simplified cyclomatic complexity
  let complexity = 1;
  
  traverse(node, {
    IfStatement() { complexity++; },
    ConditionalExpression() { complexity++; },
    LogicalExpression({ node }) {
      if (node.operator === '&&' || node.operator === '||') {
        complexity++;
      }
    },
    ForStatement() { complexity++; },
    WhileStatement() { complexity++; },
    DoWhileStatement() { complexity++; },
    SwitchCase() { complexity++; },
    CatchClause() { complexity++; }
  }, null, node);
  
  return complexity;
}

function calculateClassComplexity(node) {
  let complexity = 0;
  
  traverse(node, {
    ClassMethod(path) {
      complexity += calculateComplexity(path.node);
    }
  }, null, node);
  
  return complexity;
}

function extractJSDoc(node, content) {
  // Извлекаем JSDoc комментарии перед узлом
  const lines = content.substring(0, node.start).split('\n');
  const commentLines = [];
  
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('*') || line.startsWith('/**') || line.startsWith('*/')) {
      commentLines.unshift(line);
    } else if (commentLines.length > 0) {
      break;
    }
  }
  
  if (commentLines.length === 0) return null;
  
  const jsdoc = commentLines.join('\n');
  const description = jsdoc.match(/@description\s+(.+)/)?.[1] || 
                     jsdoc.match(/\*\s+([^@]+)/)?.[1]?.trim();
  const params = [...jsdoc.matchAll(/@param\s+{([^}]+)}\s+(\w+)\s+-?\s*(.+)/g)]
    .map(m => ({ type: m[1], name: m[2], description: m[3] }));
  const returns = jsdoc.match(/@returns?\s+{([^}]+)}\s+(.+)/);
  
  return {
    description,
    params,
    returns: returns ? { type: returns[1], description: returns[2] } : null,
    raw: jsdoc
  };
}

function getExportedNames(node) {
  if (node.declaration) {
    if (node.declaration.id) {
      return [node.declaration.id.name];
    }
    if (node.declaration.declarations) {
      return node.declaration.declarations.map(d => d.id.name);
    }
  }
  return node.specifiers.map(s => s.exported.name);
}

function getParamName(param) {
  if (param.type === 'Identifier') return param.name;
  if (param.type === 'RestElement') return `...${param.argument.name}`;
  if (param.type === 'ObjectPattern') return '{...}';
  if (param.type === 'ArrayPattern') return '[...]';
  return 'param';
}