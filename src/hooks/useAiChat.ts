import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? window.location.origin;

export function useAiChat(courseId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const createConversation = useCallback(async () => {
    const body: { courseId?: string } = {};
    if (courseId) body.courseId = courseId;

    const res = await fetch(`${API_URL}/api/ai/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Failed to create conversation');
    const data = (await res.json()) as { conversationId: string };
    return data.conversationId;
  }, [courseId]);

  const resetConversation = useCallback(async () => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setError(null);
    try {
      const id = await createConversation();
      setConversationId(id);
    } catch {
      setError('Failed to start AI conversation. Please refresh the page.');
    }
  }, [createConversation]);

  const loadConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/ai/conversations/${id}/messages`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load conversation');

      const rows = (await res.json()) as Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        createdAt: string;
      }>;

      setMessages(
        rows.map((r) => ({
          id: r.id,
          role: r.role,
          text: r.content,
          createdAt: r.createdAt,
        }))
      );
      setConversationId(id);
    } catch (err) {
      console.error('loadConversation error', err);
      setError('Failed to load this conversation.');
    }
  }, []);

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const id = await createConversation();
        if (active) setConversationId(id);
      } catch (err) {
        if (active) setError('Failed to start AI conversation. Please refresh the page.');
      }
    };

    init();

    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [courseId, createConversation]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!conversationId) return;

      setError(null);

      const userMessage: ChatMessage = {
        id: `usr-${Date.now()}`,
        role: 'user',
        text: text.trim(),
        createdAt: new Date().toISOString(),
      };

      const placeholder: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: '',
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage, placeholder]);
      setIsStreaming(true);

      try {
        abortRef.current = new AbortController();

        const res = await fetch(`${API_URL}/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: abortRef.current.signal,
          body: JSON.stringify({
            message: text.trim(),
            conversationId,
            courseId,
          }),
        });

        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE messages are separated by a blank line ("\n\n")
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || ''; // keep incomplete message in buffer

          for (const part of parts) {
            // A single SSE message may have multiple `data:` lines — join them
            const dataLines = part
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).replace(/^ /, '')); // strip exactly ONE space

            if (dataLines.length === 0) continue;
            const payload = dataLines.join('\n');

            if (payload === '[DONE]') {
              setIsStreaming(false);
              queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
              return;
            }

            if (payload === '[ERROR:AI_AUTH_EXPIRED]') {
              setError('AI service session expired. Please try again later.');
              setIsStreaming(false);
              return;
            }

            if (payload === '[ERROR:UNKNOWN]') {
              setError('Something went wrong. Please try again.');
              setIsStreaming(false);
              return;
            }

            // ✅ New object each chunk → React re-renders → markdown updates live
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              const last = updated[lastIndex];
              if (last && last.role === 'assistant') {
                updated[lastIndex] = { ...last, text: last.text + payload };
              }
              return updated;
            });
          }
        }

        setIsStreaming(false);
        queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setIsStreaming(false);
          return;
        }
        console.error('sendMessage error', err);
        setError('Something went wrong. Please try again.');
        setIsStreaming(false);
      }
    },
    [conversationId, courseId, queryClient]
  );

  return {
    messages,
    isStreaming,
    sendMessage,
    resetConversation,
    loadConversation,
    conversationId,
    error,
    setError,
  };
}
