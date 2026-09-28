import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export interface EnrollmentItem {
  id: string;
  title: string;
  titleAr: string | null;
  subtitle: string | null;
  thumbnail: string | null;
  category: string;
  level: string;
  price: number;
  duration: string | null;
  instructor: { name: string };
  progress: number;
  lastLessonId: string | null;
  enrolledAt: string;
  lessonsCount: number;
}

export const useMyEnrollments = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['my-enrollments', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/courses/my-courses/list');
      return data.enrollments as EnrollmentItem[];
    },
    enabled: !!user,
  });

  return { enrollments: query.data ?? [], isLoading: query.isLoading, error: query.error };
};