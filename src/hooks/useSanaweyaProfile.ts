import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export interface SanaweyaProfile {
  id: string;
  userId: string;
  grade: string;
  createdAt: string;
  updatedAt: string;
}

export const useSanaweyaProfile = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['sanaweya-profile'],
    queryFn: async () => {
      const { data } = await api.get('/api/sanaweya/profile');
      return (data.profile ?? null) as SanaweyaProfile | null;
    },
    enabled: !!user && user.role === 'student',
    staleTime: 5 * 60 * 1000,
  });

  return { profile: query.data ?? null, isLoading: query.isLoading, error: query.error };
};
