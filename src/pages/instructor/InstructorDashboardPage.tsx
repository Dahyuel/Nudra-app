import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  DollarSign,
  Star,
  BookOpen,
  TrendingUp,
  MessageSquare,
  Edit3,
  CheckCircle2,
  Upload
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useInstructorCourses } from '../../hooks/useInstructorCourses';
import { useInstructorEarnings } from '../../hooks/useInstructorEarnings';
import { PageErrorBanner } from '../../components/PageErrorBanner';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface CommunityQuestion {
  postId: string;
  courseId: string | null;
  content: string;
  courseTitle: string;
  createdAt: string;
  replyCount: number;
}

export const InstructorDashboardPage: React.FC = () => {
  const { courses, isLoading, error: coursesError } = useInstructorCourses();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { earnings, error: earningsError } = useInstructorEarnings();

  const { data: communityQuestions = [], error: questionsError } = useQuery({
    queryKey: ['instructor-community-questions', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/instructor/community-questions');
      return data.questions as CommunityQuestion[];
    },
    enabled: !!user && user.role === 'instructor',
  });

  const totalStudents = useMemo(
    () => courses.reduce((acc, c) => acc + c.enrollmentCount, 0),
    [courses]
  );
  const totalRevenue = useMemo(
    () => courses.reduce((acc, c) => acc + c.revenue, 0),
    [courses]
  );
  const avgRating = useMemo(() => {
    const rated = courses.filter((c) => c.rating > 0);
    if (rated.length === 0) return 0;
    return rated.reduce((acc, c) => acc + c.rating, 0) / rated.length;
  }, [courses]);

  const revenueData = useMemo(
    () => earnings.map((e) => ({ month: e.month, revenue: e.revenue })),
    [earnings]
  );

  const questions = useMemo(
    () =>
      communityQuestions.map((q) => ({
        id: q.postId,
        courseId: q.courseId,
        courseName: q.courseTitle,
        question: q.content,
        timeAgo: new Date(q.createdAt).toLocaleDateString(),
        answer: '',
      })),
    [communityQuestions]
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <PageErrorBanner errors={[coursesError, earningsError, questionsError]} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
            Instructor Studio & Performance
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Real-time analytics, revenue distribution, and student inquiries
          </p>
        </div>

        <Link
          to="/instructor/upload"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm transition-all self-start sm:self-auto"
        >
          <Upload className="w-4 h-4" />
          <span>Upload New Course</span>
        </Link>
      </div>

      {/* 1. Stats Row: Total Students, Total Revenue (in EGP), Avg Rating, Active Courses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Total Revenue in EGP */}
        <div className="rounded-2xl p-6 bg-[#2D6A4F] text-white shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100">
              Total Revenue
            </span>
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-200" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight">
              {isLoading ? '—' : `${totalRevenue.toLocaleString()} EGP`}
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-200">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Across all courses</span>
            </div>
          </div>
        </div>

        {/* Total Students */}
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Total Students
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#2D6A4F] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tight">
              {isLoading ? '—' : totalStudents.toLocaleString()}
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-[#2D6A4F]">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Across all your courses</span>
            </div>
          </div>
        </div>

        {/* Avg Rating */}
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Average Rating
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tight">
              {isLoading ? '—' : `${avgRating.toFixed(1)} / 5.0`}
            </p>
            <p className="mt-2 text-xs font-semibold text-gray-500">
              Across your rated courses
            </p>
          </div>
        </div>

        {/* Active Courses */}
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Active Courses
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#2D6A4F] flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tight">
              {isLoading ? '—' : `${courses.filter((c) => c.isPublished).length} Published`}
            </p>
            <p className="mt-2 text-xs font-semibold text-gray-500">
              {isLoading
                ? '—'
                : `${courses.filter((c) => !c.isPublished).length} Course Draft in Review`}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Middle Grid: Revenue Bar Chart (Recharts) + Top Questions from Community */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Revenue Bar Chart (Last 6 Months in EGP) */}
        <div className="lg:col-span-7 rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-base text-[#1B1B1B]">
                Earnings Trend (Last 6 Months)
              </h3>
              <p className="text-xs text-[#6B7280]">
                Monthly net income payout in Egyptian Pounds (EGP)
              </p>
            </div>
            <span className="text-xs font-black text-[#2D6A4F] bg-emerald-50 px-2.5 py-1 rounded-lg">
              EGP Currency
            </span>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(val) => `${val / 1000}k`}
                />
                <Tooltip
                  formatter={(val: any) => [`${val.toLocaleString()} EGP`, 'Revenue']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                />
                <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                  {revenueData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index === revenueData.length - 1 ? '#2D6A4F' : '#52B788'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Questions from Community Card (3 unanswered questions with Reply button) */}
        <div className="lg:col-span-5 rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-base text-[#1B1B1B] flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#2D6A4F]" />
                <span>Top Community Inquiries</span>
              </h3>
              <p className="text-xs text-[#6B7280]">
                Unanswered student questions waiting for instructor review
              </p>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              {questions.length} Pending
            </span>
          </div>

          <div className="space-y-3.5">
            {questions.length === 0 && (
              <p className="py-8 text-center text-xs text-gray-400 italic">No pending questions</p>
            )}
            {questions.map((q) => (
              <div
                key={q.id}
                className="p-4 rounded-xl bg-[#F8FAF9] border border-gray-100 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-bold text-[#2D6A4F] block truncate">
                    {q.courseName}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">{q.timeAgo}</span>
                </div>

                <p className="text-xs text-gray-700 leading-relaxed">"{q.question}"</p>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() =>
                      navigate(q.courseId ? `/course/${q.courseId}/community?post=${q.id}` : '/community')
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-bold text-[#2D6A4F] hover:bg-[#2D6A4F] hover:text-white transition-colors shadow-2xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Reply to Student</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Courses Table */}
      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-base text-[#1B1B1B]">My Published Masterclasses</h3>
            <p className="text-xs text-[#6B7280]">
              Performance breakdown, active enrollments, and status controls
            </p>
          </div>

          <Link
            to="/instructor/upload"
            className="text-xs font-bold text-[#2D6A4F] hover:underline"
          >
            + Create New Course
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="pb-3 px-2">Course Name</th>
                <th className="pb-3 px-3">Enrolled</th>
                <th className="pb-3 px-3">Rating</th>
                <th className="pb-3 px-3">Revenue (EGP)</th>
                <th className="pb-3 px-3">Status</th>
                <th className="pb-3 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-2"><div className="h-4 w-48 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-10 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-5 w-16 bg-gray-200 rounded-full" /></td>
                    <td className="py-4 px-2"><div className="h-7 w-14 bg-gray-200 rounded-xl ml-auto" /></td>
                  </tr>
                ))}
              {!isLoading && courses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 italic">
                    No courses yet. Create your first course to get started.
                  </td>
                </tr>
              )}
              {!isLoading && courses.map((course) => (
                <tr key={course.id} className="hover:bg-[#F8FAF9] transition-colors">
                  <td className="py-4 px-2 font-bold text-gray-900 max-w-xs truncate">
                    {course.title}
                    <span className="block text-[10px] text-gray-400 font-normal">
                      Updated {new Date(course.updatedAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="py-4 px-3 font-semibold text-gray-700">
                    {course.enrollmentCount.toLocaleString()} students
                  </td>
                  <td className="py-4 px-3">
                    {course.rating > 0 ? (
                      <span className="flex items-center gap-1 font-bold text-gray-900">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{course.rating}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">No ratings yet</span>
                    )}
                  </td>
                  <td className="py-4 px-3 font-black text-gray-900">
                    {course.revenue.toLocaleString()} EGP
                  </td>
                  <td className="py-4 px-3">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                        course.isPublished
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {course.isPublished ? 'published' : 'draft'}
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <button
                      onClick={() => navigate(`/instructor/upload?edit=${course.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#2D6A4F] hover:text-white transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
