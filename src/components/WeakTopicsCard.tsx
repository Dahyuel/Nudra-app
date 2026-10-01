import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Sparkles, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useMyEnrollments } from '../hooks/useMyEnrollments';
import { MarkdownRenderer } from './MarkdownRenderer';

interface WeakTopics {
  topicSummary: string;
  recommendations: string;
  generatedAt: string;
}

/** AI analysis of a student's weakest topics in a course, based on their quiz results. */
export const WeakTopicsCard: React.FC = () => {
  const { enrollments } = useMyEnrollments();
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId && enrollments.length > 0) setCourseId(enrollments[0].id);
  }, [enrollments, courseId]);

  const { data: saved, isLoading } = useQuery({
    queryKey: ['weak-topics', courseId],
    queryFn: async () => ((await api.get(`/api/ai/weak-topics/${courseId}`)).data.weakTopics ?? null) as WeakTopics | null,
    enabled: !!courseId,
  });

  const analyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/ai/weak-topics/${courseId}`);
      queryClient.setQueryData(['weak-topics', courseId], data as WeakTopics);
    } catch (err: any) {
      setError(
        !err?.response
          ? "Can't reach the Nudra server. Please try again."
          : err.response.data?.message || 'Could not analyse your weak topics right now.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (enrollments.length === 0) return null;

  return (
    <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-[#1B1B1B] flex items-center gap-2">
            <Target className="w-4 h-4 text-[#2D6A4F]" />
            Weak topics
          </h3>
          <p className="text-xs text-gray-500">AI review of your quiz results, with what to study next</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setError(null);
            }}
            className="max-w-[220px] px-3 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#2D6A4F]"
          >
            {enrollments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={analyze}
            disabled={!courseId || isAnalyzing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold disabled:opacity-60 shrink-0"
          >
            {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isAnalyzing ? 'Analysing...' : saved ? 'Re-analyse' : 'Analyse'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      {isLoading ? (
        <div className="h-16 rounded-xl bg-gray-50 animate-pulse" />
      ) : saved ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-[#F8FAF9] border border-gray-100 p-4">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Areas to work on</h4>
            <MarkdownRenderer content={saved.topicSummary} />
          </div>
          {saved.recommendations && (
            <div className="rounded-xl bg-[#F8FAF9] border border-gray-100 p-4">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Recommendations</h4>
              <MarkdownRenderer content={saved.recommendations} />
            </div>
          )}
          <p className="text-[11px] text-gray-400">Last analysed {new Date(saved.generatedAt).toLocaleString()}</p>
        </div>
      ) : (
        !error && (
          <p className="text-xs text-gray-500">
            No analysis yet. Complete at least 2 lesson quizzes in this course, then press Analyse.
          </p>
        )
      )}
    </div>
  );
};
