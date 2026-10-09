import { withProviderBudget } from './providerBudget';
import axios from 'axios';
import OpenAI from 'openai';

const DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 768);

export function getEmbeddingProvider(): string {
  return process.env.AI_ENVIRONMENT === 'production'
    ? `dashscope:${process.env.QWEN_EMBEDDING_MODEL || 'qwen3.7-text-embedding'}:${DIMENSIONS}`
    : `ollama:${process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'}:${DIMENSIONS}`;
}

export async function embedText(text: string): Promise<number[]> {
  return withProviderBudget('embedding', async signal => {
  try {
    let embedding: number[];
    if (process.env.AI_ENVIRONMENT === 'production') {
      if (!process.env.DASHSCOPE_API_KEY || !process.env.QWEN_API_BASE_URL) {
        throw new Error('DASHSCOPE_API_KEY and QWEN_API_BASE_URL are required for production embeddings');
      }
      const client = new OpenAI({
        apiKey: process.env.DASHSCOPE_API_KEY,
        timeout: 30000, maxRetries: 0,
        baseURL: process.env.QWEN_API_BASE_URL,
      });
      const result = await client.embeddings.create({
        model: process.env.QWEN_EMBEDDING_MODEL || 'qwen3.7-text-embedding',
        input: text,
        dimensions: DIMENSIONS,
      }, {signal});
      embedding = result.data[0]?.embedding ?? [];
    } else {
      const base = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
      const { data } = await axios.post(`${base}/api/embeddings`, {
        model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
        prompt: text,
      }, { timeout: 30000, signal, maxContentLength: 1048576 });
      embedding = data?.embedding;
    }

    if (!Array.isArray(embedding) || embedding.length !== DIMENSIONS || !embedding.every(value=>typeof value==='number' && Number.isFinite(value))) {
      throw new Error(`Expected ${DIMENSIONS} embedding values; received ${Array.isArray(embedding) ? embedding.length : 'no vector'}`);
    }
    return embedding;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Embedding service unavailable: ${msg}`);
  }
  });
}
