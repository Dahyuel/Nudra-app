import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export interface MonthlyEarning {
  month: string;
  year: number;
  revenue: number;
}

export interface EarningsSummary {
  totalRevenue: number;
  thisMonthRevenue: number;
  totalStudents: number;
  courseCount: number;
}

export interface CourseEarning {
  courseId: string;
  title: string;
  students: number;
  price: number;
  revenue: number;
}

export const useInstructorEarnings = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['instructor-earnings', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/instructor/earnings');
      return data as {
        monthly: MonthlyEarning[];
        summary: EarningsSummary;
        courses: CourseEarning[];
      };
    },
    enabled: !!user && user.role === 'instructor',
  });

  return {
    earnings: query.data?.monthly ?? [],
    summary:
      query.data?.summary ?? {
        totalRevenue: 0,
        thisMonthRevenue: 0,
        totalStudents: 0,
        courseCount: 0,
      },
    courseEarnings: query.data?.courses ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
};
