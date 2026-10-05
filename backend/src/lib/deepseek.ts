import axios from 'axios';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
interface ChatOptions { [key: string]: unknown }

const isProduction = () => process.env.AI_ENVIRONMENT === 'production';

function endpoint() {
  if (!isProduction()) {
    return `${(process.env.DEEPSEEK_PROXY_URL || 'http://localhost:4981').replace(/\/$/, '')}/openai/v1/chat/completions`;
  }
  const baseUrl = process.env.QWEN_API_BASE_URL;
  if (!baseUrl) throw new Error('QWEN_API_BASE_URL is required for production AI');
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}

function model() {
  return isProduction() ? (process.env.QWEN_CHAT_MODEL || 'qwen3.7-flash') : 'default';
}

function headers(): Record<string, string> {
  const key = isProduction() ? process.env.DASHSCOPE_API_KEY : undefined;
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function requestOptions(options: ChatOptions) {
  const clean = { ...options };
  if (isProduction()) {
    // These are options understood by the local DeepSeek web proxy only.
    delete clean.thinking_enabled;
    delete clean.search_enabled;
  }
  return clean;
}

function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data;
    const provider = isProduction() ? 'Qwen' : 'local DeepSeek proxy';
    return `${provider} API error ${status ?? 'network'}: ${typeof body === 'string' ? body : JSON.stringify(body ?? err.message)}`;
  }
  return err instanceof Error ? err.message : 'AI request failed';
}

export async function chatCompletion(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  try {
    const { data } = await axios.post(endpoint(), {
      model: model(), messages, stream: false, ...requestOptions(options),
    }, { timeout: 300000, headers: headers() });
    return data.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    throw new Error(getErrorMessage(err));
  }
}

export async function streamChatCompletion(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options: ChatOptions = {}
): Promise<void> {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model: model(), messages, stream: true, ...requestOptions(options) }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${isProduction() ? 'Qwen' : 'local DeepSeek proxy'} API error ${response.status}: ${body}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI provider returned an empty response stream');

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
        const content = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (typeof content === 'string') onChunk(content);
      } catch {
        // Ignore non-JSON keep-alive or partial server-sent event lines.
      }
    }
  }
}
