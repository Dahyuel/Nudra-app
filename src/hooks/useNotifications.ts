import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from './useSocket';

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/api/notifications');
      return (data.notifications ?? []) as AppNotification[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const event = `notification:${user.id}`;

    const handle = (n: AppNotification) => {
      queryClient.setQueryData<AppNotification[]>(['notifications'], (old) => {
        const list = old ?? [];
        if (list.some((x) => x.id === n.id)) return list;
        return [n, ...list];
      });
    };

    socket.on(event, handle);
    return () => {
      socket.off(event, handle);
    };
  }, [socket, user, queryClient]);

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAllRead = async () => {
    await api.post('/api/notifications/read-all');
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markOneRead = async (id: string) => {
    const { data } = await api.post(`/api/notifications/${id}/read`);
    queryClient.setQueryData<AppNotification[]>(['notifications'], (old) =>
      (old ?? []).map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    return data;
  };

  return { notifications, unreadCount, markAllRead, markOneRead, isLoading: query.isLoading };
};
