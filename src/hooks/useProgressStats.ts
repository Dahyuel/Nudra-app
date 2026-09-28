import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export interface WeeklyHour {
  day: string;
  date: string;
  hours: number;
}

export interface SubjectSlice {
  name: string;
  value: number;
  color: string;
}

export interface BadgeItem {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  badgeColorClass: string;
  isUnlocked: boolean;
  unlockedAt: string | null;
  progressText: string | null;
}

export interface ProgressStats {
  streak: number;
  weeklyHours: WeeklyHour[];
  subjectBreakdown: SubjectSlice[];
  totalHoursThisWeek: number;
  badges: BadgeItem[];
  unlockedBadgeCount: number;
  totalBadgeCount: number;
}

export const useProgressStats = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['progress-stats', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/stats/overview');
      return data as ProgressStats;
    },
    enabled: !!user,
  });

  return { stats: query.data ?? null, isLoading: query.isLoading, error: query.error };
};
