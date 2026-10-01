import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import api from '../lib/api';

interface CourseReviewFormProps {
  courseId: string;
  existing: { rating: number; comment: string | null } | null;
}

/** Lets an enrolled student rate the course (creates or updates their one review). */
export const CourseReviewForm: React.FC<CourseReviewFormProps> = ({ courseId, existing }) => {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setMessage({ type: 'err', text: 'Please choose a star rating.' });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      await api.post(`/api/courses/${courseId}/reviews`, { rating, comment: comment.trim() || undefined });
      setMessage({ type: 'ok', text: existing ? 'Your review was updated.' : 'Thanks! Your review was posted.' });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
    } catch (err: any) {
      setMessage({ type: 'err', text: err?.response?.data?.message || 'Could not save your review.' });
    } finally {
      setIsSaving(false);
    }
  };

  const shown = hover || rating;

  return (
    <form onSubmit={submit} className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
      <div>
        <h3 className="font-bold text-base text-[#1B1B1B]">{existing ? 'Your review' : 'Rate this course'}</h3>
        <p className="text-xs text-gray-500">Your rating helps other students choose.</p>
      </div>

      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${value} star${value > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(value)}
            onClick={() => setRating(value)}
            className="p-0.5"
          >
            <Star className={`w-7 h-7 ${value <= shown ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
          </button>
        ))}
        {rating > 0 && <span className="ml-2 text-xs font-bold text-gray-600">{rating} / 5</span>}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="What did you like? What could be better? (optional)"
        className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
      />

      {message && (
        <p className={`text-xs font-semibold ${message.type === 'ok' ? 'text-[#2D6A4F]' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold disabled:opacity-60"
      >
        {isSaving ? 'Saving...' : existing ? 'Update review' : 'Post review'}
      </button>
    </form>
  );
};
