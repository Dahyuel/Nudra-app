import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface SearchCourse {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  instructorName: string;
  category: string;
  level: string;
  price: number;
}

export interface SearchLesson {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
}

export interface SearchPost {
  id: string;
  title: string | null;
  content: string;
  courseId: string | null;
  createdAt: string;
}

export interface SearchResults {
  courses: SearchCourse[];
  lessons: SearchLesson[];
  posts: SearchPost[];
}

export const useSearch = (query: string) => {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debounced.length >= 2;

  const result = useQuery({
    queryKey: ['search', debounced],
    queryFn: async () => {
      const { data } = await api.get('/api/search', { params: { q: debounced } });
      return data as SearchResults;
    },
    enabled,
  });

  const results: SearchResults = result.data ?? { courses: [], lessons: [], posts: [] };
  const hasResults =
    results.courses.length > 0 || results.lessons.length > 0 || results.posts.length > 0;

  return { results, isLoading: result.isLoading && enabled, hasResults, query: debounced, enabled };
};
