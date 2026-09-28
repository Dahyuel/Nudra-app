import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface FlashcardItem {
  id: string;
  question: string;
  answer: string;
}

export const useFlashcards = (lessonId: string | undefined) => {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['flashcards', lessonId],
    queryFn: async () => {
      const { data } = await api.get(`/api/ai/flashcards/${lessonId}`);
      return (data ?? []) as FlashcardItem[];
    },
    enabled: !!lessonId,
  });

  const generateFlashcards = async () => {
    if (!lessonId) return;

    setIsGenerating(true);
    setError(null);

    try {
      await api.post(`/api/ai/flashcards/${lessonId}`);
      queryClient.invalidateQueries({ queryKey: ['flashcards', lessonId] });
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to generate flashcards';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    flashcards: query.data ?? [],
    isLoading: query.isLoading,
    isGenerating,
    generateFlashcards,
    error,
  };
};
