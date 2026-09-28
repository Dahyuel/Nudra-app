import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useSocket } from './useSocket';

export interface CommunityPostAuthor {
  name: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  anonToken: string | null;
  isInstructor: boolean;
}

export interface CommunityPost {
  id: string;
  content: string;
  title: string | null;
  tag: string | null;
  isPinned: boolean;
  isAnonymous: boolean;
  createdAt: string;
  author: CommunityPostAuthor;
  voteCount: number;
  replyCount: number;
  hasVoted: boolean;
}

export interface CommunityFilters {
  search?: string;
  tag?: string;
}

export const useCommunityPosts = (courseId: string | null, filters: CommunityFilters = {}) => {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const { search, tag } = filters;

  const queryKey = ['community-posts', courseId ?? 'general', { search, tag }];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (courseId) params.courseId = courseId;
      if (search) params.search = search;
      if (tag) params.tag = tag;

      const { data } = await api.get('/api/community/posts', { params });
      return (data.posts ?? []) as CommunityPost[];
    },
  });

  useEffect(() => {
    const room = courseId ? `course:${courseId}` : 'community:general';
    socket.emit('join_room', room);

    const handleNewPost = () => {
      queryClient.invalidateQueries({ queryKey });
    };

    socket.on('new_post', handleNewPost);

    return () => {
      socket.off('new_post', handleNewPost);
    };
  }, [socket, courseId, queryClient, queryKey]);

  return { posts: query.data ?? [], isLoading: query.isLoading, error: query.error };
};
