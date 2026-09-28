import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export const useSanaweyaDashboard = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['sanaweya-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/api/sanaweya/dashboard');
      return data;
    },
    enabled: !!user && user.role === 'student',
  });

  return { dashboard: query.data ?? null, isLoading: query.isLoading, error: query.error };
};
