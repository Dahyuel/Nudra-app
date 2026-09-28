import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useSocket } from './useSocket';
import type { CommunityPostAuthor } from './useCommunityPosts';

export interface CommunityReply {
  id: string;
  content: string;
  createdAt: string;
  author: CommunityPostAuthor;
  voteCount: number;
  hasVoted: boolean;
}

export const usePostReplies = (postId: string | undefined) => {
  const socket = useSocket();
  const queryClient = useQueryClient();

  const queryKey = ['community-replies', postId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!postId) return [];
      const { data } = await api.get(`/api/community/posts/${postId}/replies`);
      return (data.replies ?? []) as CommunityReply[];
    },
    enabled: !!postId,
  });

  useEffect(() => {
    if (!postId) return;

    const eventName = `new_reply:${postId}`;
    const handleNewReply = () => {
      queryClient.invalidateQueries({ queryKey });
    };

    socket.on(eventName, handleNewReply);

    return () => {
      socket.off(eventName, handleNewReply);
    };
  }, [socket, postId, queryClient, queryKey]);

  return { replies: query.data ?? [], isLoading: query.isLoading, error: query.error };
};
