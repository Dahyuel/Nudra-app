import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface CourseLesson {
  id: string;
  title: string;
  duration: string | null;
  isFree: boolean;
  position: number;
  videoUrl: string | null;
  isLocked: boolean;
}

export interface CourseSection {
  id: string;
  title: string;
  position: number;
  lessons: CourseLesson[];
}

export interface CourseReview {
  id: string;
  author: string;
  avatar: string | null;
  rating: number;
  comment: string | null;
  date: string;
}

export interface CourseDetail {
  id: string;
  title: string;
  titleAr: string | null;
  subtitle: string | null;
  description: string;
  thumbnail: string | null;
  category: string;
  level: string;
  price: number;
  originalPrice: number | null;
  duration: string | null;
  createdAt: string;
  updatedAt: string;
  instructor: { id: string; name: string; avatar: string | null };
  rating: number;
  ratingCount: number;
  studentsCount: number;
  lessonsCount: number;
  curriculum: CourseSection[];
  reviews: CourseReview[];
  ratingBreakdown: Record<string, number>;
  is_enrolled: boolean;
  progress: number;
  last_lesson_id: string | null;
}

export const useCourse = (id: string | undefined) => {
  const query = useQuery({
    queryKey: ['course', id],
    queryFn: async () => {
      const { data } = await api.get(`/api/courses/${id}`);
      return data.course as CourseDetail;
    },
    enabled: !!id,
  });

  return { course: query.data, isLoading: query.isLoading, error: query.error };
};