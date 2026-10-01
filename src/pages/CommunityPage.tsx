import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  ThumbsUp,
  Plus,
  Search,
  Shield,
  EyeOff,
  X,
  Share2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCommunityPosts } from '../hooks/useCommunityPosts';
import { PostRepliesSection } from '../components/PostRepliesSection';
import api from '../lib/api';

export const CommunityPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  // New post form state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTag, setNewTag] = useState('General');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedPostIds, setExpandedPostIds] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const toggleReplies = (postId: string) =>
    setExpandedPostIds((prev) => ({ ...prev, [postId]: !prev[postId] }));

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const { posts, isLoading } = useCommunityPosts(null, {
    search: searchFilter,
    tag: selectedTag === 'All' ? undefined : selectedTag,
  });

  const tags = ['All', 'Web Dev & RTL', 'UI/UX Design', 'Certifications', 'AI & Machine Learning'];

  const queryKey = ['community-posts', 'general', { search: searchFilter, tag: selectedTag === 'All' ? undefined : selectedTag }];

  const handleLike = async (id: string) => {
    const previous = queryClient.getQueryData<ReturnType<typeof useCommunityPosts>['posts']>(queryKey);

    queryClient.setQueryData(queryKey, (old: typeof previous) => {
      if (!old) return old;
      return old.map((p) => {
        if (p.id !== id) return p;
        const hasVoted = !p.hasVoted;
        return {
          ...p,
          hasVoted,
          voteCount: hasVoted ? p.voteCount + 1 : p.voteCount - 1,
        };
      });
    });

    try {
      await api.post(`/api/community/posts/${id}/vote`);
      queryClient.invalidateQueries({ queryKey });
    } catch {
      queryClient.setQueryData(queryKey, previous);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await api.post('/api/community/posts', {
        content: newContent.trim(),
        title: newTitle.trim(),
        tag: newTag,
        isAnonymous,
        courseId: null,
      });

      setNewTitle('');
      setNewContent('');
      setNewTag('General');
      setIsAnonymous(false);
      setShowNewPostModal(false);
      queryClient.invalidateQueries({ queryKey: ['community-posts', 'general'] });
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || 'Failed to publish discussion. Please try again.');
    } finally {
      setIsSubmitting(false);
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

  return (
    <>
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] px-4 py-2.5 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold shadow-lg animate-in fade-in">
          {toast}
        </div>
      )}
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
            Learner Community
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Exchange ideas, ask questions anonymously, and collaborate with peer students
          </p>
        </div>

        <button
          onClick={() => setShowNewPostModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-sm font-bold shadow-sm transition-all self-start"
        >
          <Plus className="w-4 h-4" />
          <span>New Discussion</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTag(t)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedTag === t
                  ? 'bg-[#2D6A4F] text-white shadow-2xs'
                  : 'text-gray-600 hover:bg-[#F8FAF9]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search discussions..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAF9] border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
          />
        </div>
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Loading discussions...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No discussions found.</div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Author row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {post.author.isAnonymous ? (
                    <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600">
                      <EyeOff className="w-5 h-5 text-gray-500" />
                    </div>
                  ) : post.author.avatarUrl ? (
                    <img
                      src={post.author.avatarUrl}
                      alt={post.author.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-gray-100"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#2D6A4F] text-xs font-black">
                      {post.author.name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#1B1B1B]">{post.author.name}</span>
                      {post.author.isAnonymous ? (
                        <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Shield className="w-3 h-3 text-gray-500" />
                          Anonymous Post
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-gray-400">
                          {post.author.isInstructor ? 'Instructor' : 'Verified Learner'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{formatTimestamp(post.createdAt)}</span>
                  </div>
                </div>

                <span className="text-xs font-bold text-[#2D6A4F] bg-[#B7E4C7]/30 px-3 py-1 rounded-full">
                  {post.tag}
                </span>
              </div>

              {/* Post Content */}
              <h3 className="font-bold text-base text-[#1B1B1B] mb-2 leading-snug">
                {post.title}
              </h3>
              <p className="text-sm text-[#6B7280] leading-relaxed mb-4">
                {post.content}
              </p>

              {/* Actions footer */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleLike(post.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      post.hasVoted
                        ? 'bg-emerald-50 text-[#2D6A4F]'
                        : 'text-gray-500 hover:bg-[#F8FAF9]'
                    }`}
                  >
                    <ThumbsUp className={`w-3.5 h-3.5 ${post.hasVoted ? 'fill-current' : ''}`} />
                    <span>{post.voteCount} Helpful</span>
                  </button>

                  <button
                    onClick={() => toggleReplies(post.id)}
                    aria-expanded={!!expandedPostIds[post.id]}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      expandedPostIds[post.id]
                        ? 'bg-emerald-50 text-[#2D6A4F]'
                        : 'text-gray-500 hover:bg-[#F8FAF9]'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{post.replyCount} Replies</span>
                  </button>
                </div>

                <button
                  onClick={handleShare}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                  title="Share discussion"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>

              {expandedPostIds[post.id] && (
                <PostRepliesSection
                  postId={post.id}
                  draft={replyDrafts[post.id] ?? ''}
                  onChangeDraft={(value) => setReplyDrafts((prev) => ({ ...prev, [post.id]: value }))}
                  canReply={!!user}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* New Discussion Modal with Anonymous Toggle */}
      {showNewPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setShowNewPostModal(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 z-10 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">Start a Discussion</h3>
              <button
                onClick={() => setShowNewPostModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Best practices for Arabic RTL typography scaling"
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Topic Category
                </label>
                <select
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
                >
                  <option value="Web Dev & RTL">Web Dev & RTL</option>
                  <option value="UI/UX Design">UI/UX Design</option>
                  <option value="AI & Machine Learning">AI & Machine Learning</option>
                  <option value="Certifications">Certifications</option>
                  <option value="General">General Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Description / Question
                </label>
                <textarea
                  rows={4}
                  required
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Elaborate on what you are trying to solve or share with peers..."
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
                />
              </div>

              {/* Anonymous Post Toggle Checkbox */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAF9] border border-gray-200">
                <div className="flex items-center gap-2.5">
                  <EyeOff className="w-4 h-4 text-[#2D6A4F]" />
                  <div>
                    <span className="text-xs font-bold text-gray-900 block">
                      Post Anonymously
                    </span>
                    <span className="text-[11px] text-gray-500">
                      Hide your profile name and avatar from this thread
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2D6A4F]"></div>
                </label>
              </div>

              {submitError && (
                <p className="text-xs text-red-600 font-medium">{submitError}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewPostModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] disabled:opacity-60 text-white text-xs font-bold shadow-sm"
                >
                  {isSubmitting ? 'Publishing...' : 'Publish Discussion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
};
