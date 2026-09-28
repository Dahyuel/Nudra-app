import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface CourseFilters {
  search?: string;
  category?: string;
  level?: string;
  price?: 'all' | 'free' | 'paid';
  page?: number;
}

export interface CourseListItem {
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
  isPublished: boolean;
  instructor: { name: string; avatar: string | null };
  rating: number;
  ratingCount: number;
  studentsCount: number;
  lessonsCount: number;
}

export const useCourses = (filters: CourseFilters = {}) => {
  const { search, category, level, price, page } = filters;

  const query = useQuery({
    queryKey: ['courses', { search, category, level, price, page }],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (search) params.search = search;
      if (category && category !== 'All') params.category = category;
      if (level && level !== 'All') params.level = level;
      if (price && price !== 'all') params.price = price;
      if (page) params.page = page;

      const { data } = await api.get('/api/courses', { params });
      return data.courses as CourseListItem[];
    },
  });

  return { courses: query.data ?? [], isLoading: query.isLoading, error: query.error };
};