import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface LessonSummary {
  lessonId: string;
  content: string;
  cached: boolean;
}

export const useLessonSummary = (lessonId: string | undefined) => {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  const query = useQuery({
    queryKey: ['lesson-summary', lessonId],
    queryFn: async () => {
      const { data } = await api.get(`/api/ai/summary/${lessonId}`);
      return (data.content ?? null) as string | null;
    },
    enabled: !!lessonId,
  });

  const generateSummary = async () => {
    if (!lessonId) return;

    setIsGenerating(true);

    try {
      await api.post(`/api/ai/summary/${lessonId}`);
      queryClient.invalidateQueries({ queryKey: ['lesson-summary', lessonId] });
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isGenerating,
    generateSummary,
  };
};
