import { pipeline, env } from '@xenova/transformers';

env.logLevel = 'error';

class EmbeddingService {
    static instancePromise = null;
    static modelName = 'Xenova/jina-embeddings-v2-base-en';

    static getInstance() {
        if (this.instancePromise === null) {
            console.log(`Загрузка модели-индексатора: ${this.modelName}...`);
            this.instancePromise = pipeline('feature-extraction', this.modelName);
        }
        return this.instancePromise;
    }

    static async releaseModel() {
        if (this.instancePromise) {
            console.log(`Выгрузка модели-индексатора: ${this.modelName}...`);
            const instance = await this.instancePromise.catch(() => null);
            if (instance && typeof instance.dispose === 'function') {
                await instance.dispose();
            }
            this.instancePromise = null;
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

export const releaseModel = EmbeddingService.releaseModel.bind(EmbeddingService);
