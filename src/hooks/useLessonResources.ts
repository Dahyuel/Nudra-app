import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface LessonResourceItem {
  id: string;
  title: string;
  filename: string;
  file_url: string;
  file_format: string;
  file_size_text: string | null;
}

export const useLessonResources = (
  courseId: string | undefined,
  lessonId: string | undefined
) => {
  const query = useQuery({
    queryKey: ['lesson-resources', courseId, lessonId],
    queryFn: async () => {
      const { data } = await api.get(`/api/courses/${courseId}/lessons/${lessonId}/resources`);
      return (data.resources ?? []) as LessonResourceItem[];
    },
    enabled: !!courseId && !!lessonId,
  });

  return { resources: query.data ?? [], isLoading: query.isLoading };
};
