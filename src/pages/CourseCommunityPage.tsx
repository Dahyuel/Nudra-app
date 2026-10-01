import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Pin,
  Ghost,
  ThumbsUp,
  MessageSquare,
  Send,
  ArrowLeft,
  Shield,
  Award,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCourse } from '../hooks/useCourse';
import { useCommunityPosts } from '../hooks/useCommunityPosts';
import { PostRepliesSection } from '../components/PostRepliesSection';
import api from '../lib/api';

export const CourseCommunityPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { course } = useCourse(id);
  const { posts, isLoading } = useCommunityPosts(id ?? null, {});

  // New post form state
  const [postContent, setPostContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Expanded replies state
  const [expandedPostIds, setExpandedPostIds] = useState<{ [postId: string]: boolean }>({});

  // Reply draft text per post
  const [replyDrafts, setReplyDrafts] = useState<{ [postId: string]: string }>({});

  const queryKey = ['community-posts', id ?? 'general', { search: undefined, tag: undefined }];

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim() || !id) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await api.post('/api/community/posts', {
        content: postContent.trim(),
        isAnonymous,
        courseId: id,
      });

      setPostContent('');
      setIsAnonymous(false);
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || 'Failed to publish discussion. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleUpvote = async (postId: string) => {
    const previous = queryClient.getQueryData<ReturnType<typeof useCommunityPosts>['posts']>(queryKey);

    queryClient.setQueryData(queryKey, (old: typeof previous) => {
      if (!old) return old;
      return old.map((p) => {
        if (p.id !== postId) return p;
        const hasVoted = !p.hasVoted;
        return {
          ...p,
          hasVoted,
          voteCount: hasVoted ? p.voteCount + 1 : p.voteCount - 1,
        };
      });
    });

    try {
      await api.post(`/api/community/posts/${postId}/vote`);
      queryClient.invalidateQueries({ queryKey });
    } catch {
      queryClient.setQueryData(queryKey, previous);
    }
  };

  const handleToggleExpand = (postId: string) => {
    setExpandedPostIds((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const handlePin = async (postId: string) => {
    try {
      await api.post(`/api/community/posts/${postId}/pin`);
      queryClient.invalidateQueries({ queryKey });
    } catch {
      // Ignore errors silently; the button is only shown to instructors.
    }
  };

  const formatTimestamp = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('');

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-200">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to={`/course/${course?.id ?? id}`}
          className="inline-flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-[#2D6A4F] transition-colors bg-white px-3.5 py-2 rounded-xl border border-gray-100 shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to {course?.title ?? 'Course'}</span>
        </Link>

        <span className="text-xs font-semibold text-gray-500">
          Course Forum • <strong className="text-gray-900 font-bold">{course?.title ?? '...'}</strong>
        </span>
      </div>

      {/* Header Banner */}
      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#1B1B1B] tracking-tight">
            Course Discussions & Study Circle
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280] mt-1">
            Exchange solutions, collaborate on assignments, or ask for guidance with anonymous posting protection.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#2D6A4F] bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
            <Shield className="w-4 h-4" />
            <span>Instructor Monitored</span>
          </div>
        </div>
      </div>

      {/* TOP: "Create Post" Card with Text Input + Toggle switch labeled "Post Anonymously" + Submit button */}
      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          {isAnonymous ? (
            <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-gray-600 shadow-2xs">
              <Ghost className="w-5 h-5 text-gray-600" />
            </div>
          ) : user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-cover border border-emerald-200 shadow-2xs"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#2D6A4F] text-xs font-black shadow-2xs">
              {user ? getInitials(user.name) : '?'}
            </div>
          )}

          <div>
            <h3 className="font-bold text-sm text-[#1B1B1B]">
              {isAnonymous ? 'Anonymous Student' : user?.name ?? 'Guest'}
            </h3>
            <span className="text-[11px] text-gray-400">
              {isAnonymous
                ? 'Your name and avatar will remain private'
                : 'Posting publicly with your student profile'}
            </span>
          </div>
        </div>

        <form onSubmit={handleCreatePost} className="space-y-4">
          <textarea
            rows={3}
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            placeholder="Ask a question about this course, share code insights, or start a study discussion..."
            className="w-full px-4 py-3 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] placeholder-gray-400 transition-colors"
          />

          {submitError && <p className="text-xs text-red-600 font-medium">{submitError}</p>}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            {/* Toggle Switch Labeled "Post Anonymously" */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative inline-flex items-center">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2D6A4F]"></div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                <Ghost className="w-4 h-4 text-[#2D6A4F]" />
                <span>Post Anonymously</span>
              </div>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!postContent.trim() || isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] disabled:opacity-40 text-white text-xs font-bold shadow-sm transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Publishing...' : 'Publish Discussion'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* FEED OF POSTS */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Loading discussions...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No discussions yet.</div>
        ) : (
          posts.map((post) => {
            const isPinned = !!post.isPinned;
            const isExpanded = !!expandedPostIds[post.id];

            return (
              <div
                key={post.id}
                className={`rounded-2xl p-6 bg-white shadow-sm transition-all ${
                  isPinned
                    ? 'border-2 border-[#2D6A4F] bg-gradient-to-br from-emerald-50/20 via-white to-white'
                    : 'border border-gray-100'
                }`}
              >
                {/* Pinned post banner */}
                {isPinned && (
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#2D6A4F] mb-3 uppercase tracking-wider">
                    <Pin className="w-3.5 h-3.5 fill-current" />
                    <span>Pinned by Instructor</span>
                  </div>
                )}

                {/* Post Author Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {post.author.isAnonymous ? (
                      <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600 shrink-0">
                        <Ghost className="w-5 h-5" />
                      </div>
                    ) : post.author.avatarUrl ? (
                      <img
                        src={post.author.avatarUrl}
                        alt={post.author.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-gray-100 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#2D6A4F] text-xs font-black shrink-0">
                        {getInitials(post.author.name)}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-[#1B1B1B]">
                          {post.author.name}
                        </h4>

                        {/* Instructor Badge */}
                        {post.author.isInstructor && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#2D6A4F] text-white">
                            <Award className="w-3 h-3" />
                            <span>Instructor</span>
                          </span>
                        )}

                        {post.author.isAnonymous && (
                          <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                            Anonymous
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400">
                          {formatTimestamp(post.createdAt)}
                        </span>
                        {user?.role === 'instructor' && (
                          <button
                            onClick={() => handlePin(post.id)}
                            title={isPinned ? 'Unpin post' : 'Pin post'}
                            className="inline-flex items-center justify-center p-1 rounded-md text-gray-400 hover:text-[#2D6A4F] hover:bg-emerald-50 transition-colors"
                          >
                            <Pin className={`w-3 h-3 ${isPinned ? 'fill-current text-[#2D6A4F]' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Text Content */}
                <p className="text-xs sm:text-sm text-gray-800 leading-relaxed my-3.5 whitespace-pre-line">
                  {post.content}
                </p>

                {/* Post Action Buttons: Upvote with count, Reply button */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-50 text-xs">
                  <div className="flex items-center gap-3">
                    {/* Upvote Button with Count */}
                    <button
                      onClick={() => handleToggleUpvote(post.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors ${
                        post.hasVoted
                          ? 'bg-[#2D6A4F] text-white shadow-2xs'
                          : 'bg-[#F8FAF9] text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <ThumbsUp className={`w-3.5 h-3.5 ${post.hasVoted ? 'fill-current' : ''}`} />
                      <span>{post.voteCount}</span>
                    </button>

                    {/* Reply Button */}
                    <button
                      onClick={() => handleToggleExpand(post.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F8FAF9] text-gray-600 hover:bg-gray-100 font-bold transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{post.replyCount} Replies</span>
                    </button>
                  </div>

                  <span className="text-[11px] text-gray-400">
                    {isPinned ? 'Announcements' : 'Discussion'}
                  </span>
                </div>

                {/* REPLIES SECTION */}
                {isExpanded && (
                  <PostRepliesSection
                    postId={post.id}
                    draft={replyDrafts[post.id] || ''}
                    onChangeDraft={(value) =>
                      setReplyDrafts((prev) => ({ ...prev, [post.id]: value }))
                    }
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
