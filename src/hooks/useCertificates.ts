import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export interface CertificateItem {
  id: string;
  certCode: string;
  courseId: string;
  courseTitle: string;
  courseDurationText: string | null;
  instructorName: string | null;
  issuedAt: string;
}

export const useCertificates = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['certificates', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/stats/certificates');
      return (data.certificates ?? []) as CertificateItem[];
    },
    enabled: !!user && user.role === 'student',
  });

  return { certificates: query.data ?? [], isLoading: query.isLoading };
};
