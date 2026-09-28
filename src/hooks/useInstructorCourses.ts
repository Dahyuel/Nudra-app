import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export interface InstructorCourse {
  id: string;
  title: string;
  titleAr: string | null;
  subtitle: string | null;
  thumbnail: string | null;
  category: string;
  level: string;
  price: number;
  originalPrice: number | null;
  duration: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  enrollmentCount: number;
  rating: number;
  revenue: number;
  lessonsCount: number;
}

export const useInstructorCourses = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['instructor-courses', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/instructor/courses');
      return data.courses as InstructorCourse[];
    },
    enabled: !!user && user.role === 'instructor',
  });

  return { courses: query.data ?? [], isLoading: query.isLoading, error: query.error };
};