import { pipeline, env } from '@xenova/transformers';

env.logLevel = 'error';

class AnalysisService {
    static instancePromise = null;
    static modelName = 'Xenova/flan-t5-small'; // Upgraded model

    static getInstance() {
        if (this.instancePromise === null) {
            console.log(`Загрузка модели-аналитика: ${this.modelName}...`);
            this.instancePromise = pipeline('text2text-generation', this.modelName);
        }
        return this.instancePromise;
    }

    static async releaseModel() {
        if (this.instancePromise) {
            console.log(`Выгрузка модели-аналитика: ${this.modelName}...`);
            const instance = await this.instancePromise.catch(() => null);
            if (instance && typeof instance.dispose === 'function') {
                await instance.dispose();
            }
            this.instancePromise = null;
        }
    }
}

export async function getCodeSummary(codeChunk) {
    const generator = await AnalysisService.getInstance();

    // Updated prompt format for instruction-tuned model
    const prompt = `Summarize this code in one concise line:\n\n${codeChunk.substring(0, 500)}`;

    const output = await generator(prompt, {
        max_new_tokens: 50,
        temperature: 0.2,
        no_repeat_ngram_size: 3
    });

    const summary = output[0].generated_text.trim() || 'Auto-generated description';
    return summary.substring(0, 200);
}

export const releaseModel = AnalysisService.releaseModel.bind(AnalysisService);
