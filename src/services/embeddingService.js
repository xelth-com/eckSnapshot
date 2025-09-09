import { pipeline } from '@xenova/transformers';

class EmbeddingService {
    static instance = null;
    static modelName = 'Xenova/jina-embeddings-v2-base-en'; // Can be made configurable

    static async getInstance() {
        if (this.instance === null) {
            console.log(`Загрузка модели-индексатора: ${this.modelName}...`);
            this.instance = await pipeline('feature-extraction', this.modelName);
            console.log('Модель-индексатор готова.');
        }
        return this.instance;
    }

    static releaseModel() {
        if (this.instance) {
            console.log(`Выгрузка модели-индексатора: ${this.modelName}...`);
            this.instance = null;
            // In Node.js, there's no explicit GPU memory release, 
            // relying on the garbage collector is the standard way.
        }
    }
}

export async function generateEmbedding(code) {
    const extractor = await EmbeddingService.getInstance();
    const result = await extractor(code, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
}

export async function generateBatchEmbeddings(texts) {
    if (!texts || texts.length === 0) return [];
    const extractor = await EmbeddingService.getInstance();
    const result = await extractor(texts, { pooling: 'mean', normalize: true });
    
    // Convert tensor to array of arrays
    const embeddings = [];
    for (let i = 0; i < result.dims[0]; i++) {
        const start = i * result.dims[1];
        const end = start + result.dims[1];
        embeddings.push(Array.from(result.data.slice(start, end)));
    }
    return embeddings;
}

export const releaseModel = EmbeddingService.releaseModel;