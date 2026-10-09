import { withProviderBudget } from './providerBudget';
import axios from 'axios';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
interface ChatOptions { [key: string]: unknown }
function validatePrompt(messages:ChatMessage[]) {
  if (messages.length>100 || Buffer.byteLength(JSON.stringify(messages))>131072) throw new Error('AI prompt exceeds the processing budget');
}

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
  delete clean.signal;
  clean.max_tokens = Math.min(4096, Math.max(1, Number(clean.max_tokens) || 2048));
  return clean;
}

function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const provider = isProduction() ? 'Qwen' : 'local DeepSeek proxy';
    return `${provider} API error ${status ?? 'network'}`;
  }
  return err instanceof Error ? err.message : 'AI request failed';
}

export async function chatCompletion(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  validatePrompt(messages);
  return withProviderBudget('chat', async signal => {
  try {
    const { data } = await axios.post(endpoint(), {
      model: model(), messages, stream: false, ...requestOptions(options),
    }, { timeout: 90000, signal, headers: headers(), maxContentLength: 131072, maxBodyLength: 1048576 });
    const content = data.choices?.[0]?.message?.content ?? '';
    if (typeof content !== 'string' || Buffer.byteLength(content) > 65536) throw new Error('AI output limit exceeded');
    return content;
  } catch (err) {
    throw new Error(getErrorMessage(err));
  }
  });
}

export async function streamChatCompletion(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options: ChatOptions = {}
): Promise<void> {
  validatePrompt(messages);
  return withProviderBudget('chat', async signal => {
  const response = await fetch(endpoint(), {
    signal,
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model: model(), messages, stream: true, ...requestOptions(options) }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${isProduction() ? 'Qwen' : 'local DeepSeek proxy'} API error ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI provider returned an empty response stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let outputBytes = 0;
  try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > 131072) throw new Error('AI stream frame limit exceeded');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;
      let content;
      try { content = JSON.parse(payload).choices?.[0]?.delta?.content; } catch { continue; }
      if (typeof content === 'string') {
        outputBytes += Buffer.byteLength(content);
        if (outputBytes > 65536) throw new Error('AI output limit exceeded');
        onChunk(content);
      }
    }
  }
  } finally { await reader.cancel().catch(() => {}); }
  });
}
