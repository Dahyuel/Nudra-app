import axios from 'axios';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

export async function embedText(text: string): Promise<number[]> {
  try {
    const { data } = await axios.post(
      `${OLLAMA_URL}/api/embeddings`,
      { model: 'nomic-embed-text', prompt: text },
      { timeout: 30000 }
    );

    if (!data || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response');
    }

    return data.embedding as number[];
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const isUnavailable =
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        err.message?.toLowerCase().includes('timeout');

      if (isUnavailable) {
        throw new Error('Embedding service unavailable');
      }
    }
    throw err;
  }
}
