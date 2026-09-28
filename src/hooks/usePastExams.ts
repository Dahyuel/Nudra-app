import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface PastExam {
  id: string;
  subject: string;
  grade: string;
  year: number;
  session: string;
  title: string;
  pdfUrl: string;
  answerKeyUrl: string | null;
  isPublished: boolean;
  createdAt: string;
}

export interface PastExamFilters {
  grade?: string;
  subject?: string;
  year?: string;
  session?: string;
}

export const usePastExams = (filters: PastExamFilters = {}) => {
  const { grade, subject, year, session } = filters;

  const query = useQuery({
    queryKey: ['past-exams', { grade, subject, year, session }],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (grade && grade !== 'all') params.grade = grade;
      if (subject && subject !== 'all') params.subject = subject;
      if (year && year !== 'all') params.year = year;
      if (session && session !== 'all') params.session = session;

      const { data } = await api.get('/api/sanaweya/past-exams', { params });
      return data.exams as PastExam[];
    },
  });

  return { exams: query.data ?? [], isLoading: query.isLoading, error: query.error };
};
