import { pipeline } from '@xenova/transformers';

class AnalysisService {
    static instance = null;
    static modelName = 'Xenova/distilgpt2'; // Can be made configurable

    static async getInstance() {
        if (this.instance === null) {
            console.log(`Загрузка модели-аналитика: ${this.modelName}...`);
            this.instance = await pipeline('text-generation', this.modelName);
            console.log('Модель-аналитик готова.');
        }
        return this.instance;
    }

    static releaseModel() {
        if (this.instance) {
            console.log(`Выгрузка модели-аналитика: ${this.modelName}...`);
            this.instance = null;
        }
    }
}

export async function getCodeSummary(codeChunk) {
    const generator = await AnalysisService.getInstance();

    const prompt = `This code:\n${codeChunk.substring(0, 150)}\nSummary:`;

    const output = await generator(prompt, {
        max_new_tokens: 50,
        temperature: 0.7,
        do_sample: true
    });

    const generatedText = output[0].generated_text;
    const summary = generatedText.replace(prompt, '').trim() || 'Auto-generated description';
    return summary.substring(0, 200); // Limit summary length
}

export const releaseModel = AnalysisService.releaseModel;