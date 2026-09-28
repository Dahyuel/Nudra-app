import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export interface LessonProgressItem {
  watchedSeconds: number;
  completed: boolean;
  completedAt: string | null;
}

export const useLessonProgress = (
  courseId: string | undefined,
  lessonId: string | undefined
) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['lesson-progress', courseId, user?.id],
    queryFn: async () => {
      const { data } = await api.get(`/api/progress/course/${courseId}`);
      return (data.progress ?? {}) as Record<string, LessonProgressItem>;
    },
    enabled: !!courseId && !!user && user.role === 'student',
  });

  const mutation = useMutation({
    mutationFn: async ({ watchedSeconds, completed }: { watchedSeconds: number; completed: boolean }) => {
      const { data } = await api.post(`/api/progress/lesson/${lessonId}`, {
        watchedSeconds,
        completed,
      });
      return data as { lessonProgress: unknown; courseProgress: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-progress', courseId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['my-enrollments', user?.id] });
    },
  });

  return {
    courseProgress: query.data ?? {},
    isLoading: query.isLoading,
    markProgress: (watchedSeconds: number, completed: boolean) => {
      if (!user || user.role !== 'student') return;
      mutation.mutate({ watchedSeconds, completed });
    },
  };
};
