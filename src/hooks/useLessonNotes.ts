import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface LessonNote {
  id: string;
  studentId: string;
  lessonId: string;
  content: string;
  timestampSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export const useLessonNotes = (lessonId: string | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['lesson-notes', lessonId],
    queryFn: async () => {
      const { data } = await api.get(`/api/notes/lesson/${lessonId}`);
      return (data.notes ?? []) as LessonNote[];
    },
    enabled: !!lessonId,
  });

  const createMutation = useMutation({
    mutationFn: async ({ content, timestampSeconds }: { content: string; timestampSeconds: number }) => {
      const { data } = await api.post(`/api/notes/lesson/${lessonId}`, {
        content,
        timestampSeconds,
      });
      return data.note as LessonNote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-notes', lessonId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      await api.delete(`/api/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-notes', lessonId] });
    },
  });

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    addNote: (content: string, timestampSeconds: number) =>
      createMutation.mutate({ content, timestampSeconds }),
    deleteNote: (noteId: string) => deleteMutation.mutate(noteId),
  };
};
