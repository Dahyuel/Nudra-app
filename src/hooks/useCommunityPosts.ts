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
  /** Show a Sanaweya subject community's feed instead of the general one. */
  subjectCommunityId?: string | null;
}

export const useCommunityPosts = (courseId: string | null, filters: CommunityFilters = {}) => {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const { search, tag, subjectCommunityId } = filters;

  const scope = courseId ?? (subjectCommunityId ? `subject:${subjectCommunityId}` : 'general');
  const queryKey = ['community-posts', scope, { search, tag }];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (courseId) params.courseId = courseId;
      else if (subjectCommunityId) params.subjectCommunityId = subjectCommunityId;
      if (search) params.search = search;
      if (tag) params.tag = tag;

      const { data } = await api.get('/api/community/posts', { params });
      return (data.posts ?? []) as CommunityPost[];
    },
  });

  useEffect(() => {
    const room = courseId
      ? `course:${courseId}`
      : subjectCommunityId
        ? `subject:${subjectCommunityId}`
        : 'community:general';
    socket.emit('join_room', room);

    const handleNewPost = () => {
      queryClient.invalidateQueries({ queryKey });
    };

    socket.on('new_post', handleNewPost);

    return () => {
      socket.off('new_post', handleNewPost);
    };
  }, [socket, courseId, subjectCommunityId, queryClient, queryKey]);

  return { posts: query.data ?? [], isLoading: query.isLoading, error: query.error, queryKey };
};
