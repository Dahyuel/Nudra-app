import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Ghost, ThumbsUp, Award } from 'lucide-react';
import { usePostReplies } from '../hooks/usePostReplies';
import api from '../lib/api';

interface PostRepliesSectionProps {
  postId: string;
  draft: string;
  onChangeDraft: (value: string) => void;
  /** Hide the reply box (e.g. for logged-out visitors on public pages). */
  canReply?: boolean;
}

export const PostRepliesSection: React.FC<PostRepliesSectionProps> = ({
  postId,
  draft,
  onChangeDraft,
  canReply = true,
}) => {
  const queryClient = useQueryClient();
  const { replies, isLoading } = usePostReplies(postId);
  const queryKey = ['community-replies', postId];

  const handleToggleReplyUpvote = async (replyId: string) => {
    const previous = queryClient.getQueryData<ReturnType<typeof usePostReplies>['replies']>(queryKey);

    queryClient.setQueryData(queryKey, (old: typeof previous) => {
      if (!old) return old;
      return old.map((r) => {
        if (r.id !== replyId) return r;
        const hasVoted = !r.hasVoted;
        return {
          ...r,
          hasVoted,
          voteCount: hasVoted ? r.voteCount + 1 : r.voteCount - 1,
        };
      });
    });

    try {
      await api.post(`/api/community/replies/${replyId}/vote`);
      queryClient.invalidateQueries({ queryKey });
    } catch {
      queryClient.setQueryData(queryKey, previous);
    }
  };

  const handleAddReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

    try {
      await api.post(`/api/community/posts/${postId}/replies`, {
        content: trimmed,
        isAnonymous: false,
      });
      onChangeDraft('');
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    } catch {
      // Keep draft on error so the user can retry.
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

  if (isLoading) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-100 pl-4 sm:pl-8 border-l-2 border-emerald-100">
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-emerald-200 border-t-[#2D6A4F] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 pl-4 sm:pl-8 border-l-2 border-emerald-100">
      {replies.map((reply) => (
        <div
          key={reply.id}
          className={`p-4 rounded-xl space-y-2 ${
            reply.author.isInstructor
              ? 'bg-emerald-50/50 border border-emerald-200/80 shadow-2xs'
              : 'bg-[#F8FAF9] border border-gray-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {reply.author.isAnonymous ? (
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600">
                  <Ghost className="w-3.5 h-3.5" />
                </div>
              ) : reply.author.avatarUrl ? (
                <img
                  src={reply.author.avatarUrl}
                  alt={reply.author.name}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center text-[#2D6A4F] text-[10px] font-black">
                  {reply.author.name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-gray-900">{reply.author.name}</span>

                {/* Instructor Badge */}
                {reply.author.isInstructor && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#2D6A4F] text-white">
                    <Award className="w-2.5 h-2.5" />
                    <span>Instructor</span>
                  </span>
                )}

                <span className="text-[10px] text-gray-400">
                  {formatTimestamp(reply.createdAt)}
                </span>
              </div>
            </div>

            {/* Reply Upvote */}
            <button
              onClick={() => handleToggleReplyUpvote(reply.id)}
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                reply.hasVoted
                  ? 'bg-[#2D6A4F] text-white'
                  : 'text-gray-500 hover:text-[#2D6A4F]'
              }`}
            >
              <ThumbsUp className="w-3 h-3" />
              <span>{reply.voteCount}</span>
            </button>
          </div>

          <p className="text-xs text-gray-700 leading-relaxed pl-9">
            {reply.content}
          </p>
        </div>
      ))}

      {replies.length === 0 && <p className="text-xs text-gray-400 italic">No replies yet.</p>}

      {/* Add Reply Input */}
      {canReply && (
        <form onSubmit={handleAddReply} className="flex items-center gap-2 pt-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => onChangeDraft(e.target.value)}
            placeholder="Write a helpful reply..."
            className="flex-1 px-3.5 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="px-4 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] disabled:opacity-40 text-white text-xs font-bold transition-colors"
          >
            Reply
          </button>
        </form>
      )}
    </div>
  );
};
