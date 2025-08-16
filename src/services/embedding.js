import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the client. Ensure the API key is set in the environment variables.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateEmbedding(text, taskType = 'RETRIEVAL_DOCUMENT') {
  console.log(`🔍 [Gemini] Generating embedding for: "${text.substring(0, 50)}..."`);
  const model = genAI.getGenerativeModel({ model: "embedding-001" });

  try {
    const result = await model.embedContent({ 
      content: { parts: [{ text }] },
      taskType
    });
    const embedding = result.embedding.values;
    console.log(`✅ [Gemini] Embedding created with ${embedding.length} dimensions.`);
    return embedding;
  } catch (error) {
    console.error('❌ Gemini Embedding Error:', error.message);
    throw error;
  }
}

export const embeddingService = {
  generateEmbedding
};