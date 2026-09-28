import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type { CourseListItem } from './useCourses';

export interface SanaweyaCourseFilters {
  grade?: string;
  subject?: string;
  search?: string;
  price?: 'all' | 'free' | 'paid';
  ministryAligned?: boolean;
  page?: number;
  limit?: number;
}

export const useSanaweyaCourses = (filters: SanaweyaCourseFilters = {}) => {
  const { grade, subject, search, price, ministryAligned, page, limit } = filters;

  const query = useQuery({
    queryKey: ['sanaweya-courses', { grade, subject, search, price, ministryAligned, page, limit }],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {};
      if (grade && grade !== 'all') params.grade = grade;
      if (subject) params.subject = subject;
      if (search) params.search = search;
      if (price && price !== 'all') params.price = price;
      if (ministryAligned) params.ministryAligned = true;
      if (page) params.page = page;
      if (limit) params.limit = limit;

      const { data } = await api.get('/api/sanaweya/courses', { params });
      return data.courses as CourseListItem[];
    },
  });

  return { courses: query.data ?? [], isLoading: query.isLoading, error: query.error };
};
