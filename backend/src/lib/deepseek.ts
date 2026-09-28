import axios from 'axios';

const DEEPSEEK_PROXY_URL = process.env.DEEPSEEK_PROXY_URL || 'http://localhost:4981';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  thinking_enabled?: boolean;
  search_enabled?: boolean;
  [key: string]: unknown;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data;
    return `DeepSeek proxy error ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  try {
    const { data } = await axios.post(
      `${DEEPSEEK_PROXY_URL}/openai/v1/chat/completions`,
      {
        model: 'default',
        messages,
        stream: false,
        ...options,
      },
      { timeout: 300000 }
    );

    return data.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        throw new Error('AI service authentication expired — please refresh DeepSeek session');
      }
    }
    throw new Error(getErrorMessage(err, 'AI request failed'));
  }
}

export async function streamChatCompletion(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options: ChatOptions = {}
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${DEEPSEEK_PROXY_URL}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'default',
        messages,
        stream: true,
        ...options,
      }),
    });
  } catch (err) {
    throw new Error('AI service authentication expired — please refresh DeepSeek session');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('AI service authentication expired — please refresh DeepSeek session');
    }
    const body = await response.text();
    throw new Error(`DeepSeek proxy error ${response.status}: ${body}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('AI service authentication expired — please refresh DeepSeek session');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;

      try {
        const json = JSON.parse(payload);
        const content = json.choices?.[0]?.delta?.content;
        if (content != null) {
          onChunk(content);
        }
      } catch {
        // Ignore malformed SSE lines
      }
    }
  }
}
