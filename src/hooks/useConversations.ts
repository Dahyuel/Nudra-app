import { useQuery } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL ?? window.location.origin;

export interface Conversation {
  id: string;
  courseId: string | null;
  courseTitle: string | null;
  createdAt: string;
  messageCount: number;
  lastMessage: string | null;
}

async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_URL}/api/ai/conversations`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load conversations');
  const data = (await res.json()) as { conversations: Conversation[] };
  return data.conversations;
}

export function useConversations() {
  return useQuery({
    queryKey: ['ai-conversations'],
    queryFn: fetchConversations,
    staleTime: 30 * 1000,
  });
}
