import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useInstructorCourses } from '../../hooks/useInstructorCourses';
import { PageErrorBanner } from '../../components/PageErrorBanner';
import { withErrorBoundary } from '../../components/withErrorBoundary';

interface QuestionStat {
  questionText: string;
  accuracy: number;
  isDifficult: boolean;
}

interface QuizAnalytic {
  lessonId: string;
  lessonTitle: string;
  totalAttempts: number;
  avgScore: number;
  questions: QuestionStat[];
}

interface FunnelRow {
  courseId: string;
  courseTitle: string;
  enrolledCount: number;
  startedCount: number;
  completedCount: number;
}

const InstructorAnalyticsPageInner: React.FC = () => {
  const { user } = useAuth();
  const { courses, isLoading: coursesLoading, error: coursesError } = useInstructorCourses();
  const [selectedCourseId, setSelectedCourseId] = useState('');

  useEffect(() => {
    if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  const { data: quizAnalytics = [], isLoading: quizLoading, error: quizError } = useQuery({
    queryKey: ['quiz-analytics', selectedCourseId],
    queryFn: async () => {
      const { data } = await api.get(`/api/instructor/courses/${selectedCourseId}/quiz-analytics`);
      return data.analytics as QuizAnalytic[];
    },
    enabled: !!selectedCourseId,
  });

  const { data: funnel = [], isLoading: funnelLoading, error: funnelError } = useQuery({
    queryKey: ['instructor-analytics', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/instructor/analytics');
      return data.funnel as FunnelRow[];
    },
    enabled: !!user && user.role === 'instructor',
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <PageErrorBanner errors={[coursesError, quizError, funnelError]} />
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
          Analytics
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Quiz performance and completion funnels across your courses
        </p>
      </div>

      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <h3 className="font-bold text-base text-[#1B1B1B] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#2D6A4F]" />
            <span>Completion Funnel</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="pb-3 px-2">Course</th>
                <th className="pb-3 px-3">Enrolled</th>
                <th className="pb-3 px-3">Started</th>
                <th className="pb-3 px-3">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {funnelLoading && (
                <tr className="animate-pulse">
                  <td className="py-4 px-2"><div className="h-4 w-48 bg-gray-200 rounded" /></td>
                  <td className="py-4 px-3"><div className="h-4 w-12 bg-gray-200 rounded" /></td>
                  <td className="py-4 px-3"><div className="h-4 w-12 bg-gray-200 rounded" /></td>
                  <td className="py-4 px-3"><div className="h-4 w-12 bg-gray-200 rounded" /></td>
                </tr>
              )}
              {!funnelLoading && funnel.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400 italic">
                    No enrollment data yet.
                  </td>
                </tr>
              )}
              {!funnelLoading &&
                funnel.map((row) => (
                  <tr key={row.courseId} className="hover:bg-[#F8FAF9] transition-colors">
                    <td className="py-4 px-2 font-bold text-gray-900 max-w-xs truncate">{row.courseTitle}</td>
                    <td className="py-4 px-3 font-semibold text-gray-700">{row.enrolledCount}</td>
                    <td className="py-4 px-3 font-semibold text-gray-700">{row.startedCount}</td>
                    <td className="py-4 px-3 font-semibold text-gray-700">{row.completedCount}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-100">
          <h3 className="font-bold text-base text-[#1B1B1B]">Quiz Performance by Lesson</h3>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            disabled={coursesLoading}
            className="px-4 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] bg-white"
          >
            <option value="">Select a course...</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        {quizLoading && (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="p-4 rounded-xl border border-gray-100 animate-pulse space-y-2">
                <div className="h-4 w-1/3 bg-gray-200 rounded" />
                <div className="h-3 w-1/2 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        )}

        {!quizLoading && !selectedCourseId && (
          <p className="text-xs text-gray-400 italic py-6 text-center">
            Select a course to view quiz analytics.
          </p>
        )}

        {!quizLoading && selectedCourseId && quizAnalytics.length === 0 && (
          <p className="text-xs text-gray-400 italic py-6 text-center">
            No quiz attempts recorded for this course yet.
          </p>
        )}

        {!quizLoading &&
          quizAnalytics.map((lesson) => (
            <div key={lesson.lessonId} className="p-4 rounded-xl bg-[#F8FAF9] border border-gray-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-gray-900">{lesson.lessonTitle}</span>
                <div className="flex items-center gap-4 text-xs font-semibold text-gray-600">
                  <span>{lesson.totalAttempts} attempts</span>
                  <span className="text-[#2D6A4F] font-black">Avg {lesson.avgScore}%</span>
                </div>
              </div>

              {lesson.questions.length > 0 && (
                <div className="space-y-1.5">
                  {lesson.questions.map((q, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start justify-between gap-3 text-xs px-3 py-2 rounded-lg border ${
                        q.isDifficult
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-white border-gray-100 text-gray-600'
                      }`}
                    >
                      <span className="flex items-start gap-1.5 flex-1">
                        {q.isDifficult && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                        <span>{q.questionText}</span>
                      </span>
                      <span className="font-bold shrink-0">{q.accuracy}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};

export const InstructorAnalyticsPage = withErrorBoundary(InstructorAnalyticsPageInner);
