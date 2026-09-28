import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Flame,
  ArrowRight,
  Play,
  Calendar,
  Users,
  Video,
  ExternalLink,
  MessageSquare,
  ThumbsUp,
  ShieldAlert,
  Sparkles,
  Plus
} from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { WeeklyChart } from '../components/WeeklyChart';
import { FocusTimer } from '../components/FocusTimer';
import { ProgressArc } from '../components/ProgressArc';
import { TopInstructorsCard } from '../components/TopInstructorsCard';
import { useAuth } from '../context/AuthContext';
import { useMyEnrollments } from '../hooks/useMyEnrollments';
import { useProgressStats } from '../hooks/useProgressStats';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { enrollments, isLoading } = useMyEnrollments();
  const { stats } = useProgressStats();

  const completedCount = enrollments.filter((e) => e.progress === 100).length;
  const inProgress = enrollments.filter((e) => e.progress < 100);
  const recentCourses = enrollments.slice(0, 4);
  const continueCourse = inProgress[0];

  const hoursLearned = Math.round(
    stats?.totalHoursThisWeek ?? (stats?.weeklyHours ?? []).reduce((sum, h) => sum + h.hours, 0)
  );

  const todayIndex = (new Date().getDay() + 6) % 7;
  const weeklyChartData = (stats?.weeklyHours ?? []).map((item, index) => ({
    day: item.day,
    hours: item.hours,
    active: index === todayIndex,
  }));

  const avgProgress =
    enrollments.length > 0
      ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length)
      : 0;
  const topEnrollment = enrollments.reduce<(typeof enrollments)[number] | null>(
    (best, e) => (best === null || e.progress > best.progress ? e : best),
    null
  );
  const topCourseTitle = topEnrollment
    ? topEnrollment.title.length > 30
      ? `${topEnrollment.title.slice(0, 30)}...`
      : topEnrollment.title
    : 'No course yet';

  const {
    data: communityPosts,
    isLoading: postsLoading,
    isError: postsError,
  } = useQuery({
    queryKey: ['community-posts-preview'],
    queryFn: async () => {
      const { data } = await api.get('/api/community/posts', { params: { limit: 3 } });
      return (data.posts ?? []) as Array<{
        id: string;
        title: string;
        author: { name: string | null; isAnonymous: boolean };
        voteCount: number;
        replyCount: number;
        createdAt: string;
      }>;
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Header - Donezo style */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Plan, prioritize and accomplish your learning goals with ease
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/browse"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-sm font-bold shadow-sm transition-all hover:shadow"
          >
            <Plus className="w-4 h-4" />
            <span>Explore Courses</span>
          </Link>
          <Link
            to="/ai-tutor"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-[#1B1B1B] text-sm font-semibold shadow-2xs transition-colors"
          >
            <Sparkles className="w-4 h-4 text-[#52B788]" />
            <span>Ask AI Tutor</span>
          </Link>
        </div>
      </div>

      {/* 1. Four Stat Cards (Donezo Style: 1st is signature primary green card, other 3 are sleek white cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm animate-pulse space-y-4"
            >
              <div className="h-3 w-1/2 bg-gray-200 rounded" />
              <div className="h-8 w-1/3 bg-gray-200 rounded" />
              <div className="h-3 w-2/3 bg-gray-200 rounded" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              title="Enrolled Courses"
              value={enrollments.length}
              badge="Active learning journey"
              isPrimary={true}
              icon={BookOpen}
            />
            <StatCard
              title="Completed Courses"
              value={completedCount}
              subtitle="Certificates earned"
              isPrimary={false}
              icon={CheckCircle2}
            />
            <StatCard
              title="Hours Learned"
              value={0}
              subtitle="Based on completed lessons"
              isPrimary={false}
              icon={Clock}
            />
            <StatCard
              title="Current Streak"
              value={`${stats?.streak ?? 0} Days`}
              subtitle="Days in a row"
              isPrimary={false}
              icon={Flame}
            />
          </>
        )}
      </div>

      {/* 2. Middle Row: Learning Analytics & Donezo-inspired Live Reminders & Top Instructors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Weekly Study Analytics Chart */}
        <div className="lg:col-span-6">
          <WeeklyChart />
        </div>

        {/* Center: Upcoming Live Sessions Card (Modeled directly after Donezo's "Reminders / Meeting With Mr.Thomson" card) */}
        <div className="lg:col-span-3">
          <div className="h-full rounded-2xl p-6 bg-white border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Upcoming Live Session
                </span>
              </div>

              <h3 className="text-lg font-bold text-[#1B1B1B] leading-snug line-clamp-2">
                Live Sessions
              </h3>

              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mt-3">
                <Calendar className="w-4 h-4 text-[#2D6A4F]" />
                <span>Live sessions are not available yet.</span>
              </div>
            </div>

            <div className="mt-6 pt-2">
              <Link
                to="/community"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#22523d] text-white text-xs font-bold shadow-sm transition-all"
              >
                <Video className="w-4 h-4" />
                <span>Visit Community</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Right: Top Instructors (Matching Donezo's "Top Collaborators" card) */}
        <div className="lg:col-span-3">
          <TopInstructorsCard />
        </div>
      </div>

      {/* 3. Continue Learning Section (2 Course Cards with Progress Bars) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1B1B1B]">Continue Learning</h2>
            <p className="text-xs text-[#6B7280]">Pick up right where you left off</p>
          </div>
          <Link
            to="/my-courses"
            className="text-xs font-bold text-[#2D6A4F] hover:text-[#1E4D38] flex items-center gap-1 group"
          >
            <span>View All ({enrollments.length})</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading &&
            Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm animate-pulse space-y-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-xl bg-gray-200 shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 w-1/3 bg-gray-200 rounded" />
                    <div className="h-4 w-5/6 bg-gray-200 rounded" />
                  </div>
                </div>
                <div className="h-10 w-full bg-gray-200 rounded-xl" />
                <div className="h-2.5 w-full bg-gray-200 rounded-full" />
              </div>
            ))}

          {!isLoading && !continueCourse && (
            <div className="rounded-2xl p-8 bg-white border border-gray-100 shadow-sm text-center md:col-span-2">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 text-sm">No courses in progress</h3>
              <p className="text-xs text-gray-500 mt-1">
                Browse the catalog to start your learning journey.
              </p>
              <Link
                to="/browse"
                className="mt-4 inline-block px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#22523d] transition-colors"
              >
                Explore Courses
              </Link>
            </div>
          )}

          {!isLoading && continueCourse && (
            <div
              key={continueCourse.id}
              className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow group"
            >
              <div>
                <div className="flex items-start gap-4 mb-4">
                  <img
                    src={continueCourse.thumbnail ?? undefined}
                    alt={continueCourse.title}
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 rounded-xl object-cover shadow-2xs group-hover:scale-102 transition-transform shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-[#2D6A4F] bg-[#B7E4C7]/30 px-2 py-0.5 rounded-md inline-block mb-1.5">
                      {continueCourse.category}
                    </span>
                    <h3 className="font-bold text-sm text-[#1B1B1B] leading-snug line-clamp-2">
                      {continueCourse.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                      <span>By {continueCourse.instructor.name}</span>
                    </p>
                  </div>
                </div>

                {/* Current lesson note */}
                <div className="bg-[#F8FAF9] p-3 rounded-xl mb-4 border border-gray-100">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                    Current Lesson
                  </p>
                  <p className="text-xs font-semibold text-gray-800 truncate mt-0.5">
                    {continueCourse.lastLessonId ? 'Resume where you left off' : 'Start your first lesson'}
                  </p>
                </div>
              </div>

              <div>
                {/* Progress bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                    <span className="text-gray-600">Course Progress</span>
                    <span className="text-[#2D6A4F]">{continueCourse.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-[#2D6A4F] h-full rounded-full transition-all duration-500"
                      style={{ width: `${continueCourse.progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">
                    {continueCourse.lessonsCount} lessons
                  </span>
                  <Link
                    to={
                      continueCourse.lastLessonId
                        ? `/course/${continueCourse.id}/lesson/${continueCourse.lastLessonId}`
                        : `/course/${continueCourse.id}`
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold transition-all shadow-2xs"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Resume Lesson</span>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. Bottom Row: Progress Arc, Focus Timer & Community Mini Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Study Progress Arc (Donezo Adaptrum-P3 style) */}
        <div className="lg:col-span-4">
          <ProgressArc
            title="Course Progress"
            subtitle={`${enrollments.length} enrolled`}
            percentage={avgProgress}
          />
        </div>

        {/* Center: Donezo Focus Time Tracker */}
        <div className="lg:col-span-4">
          <FocusTimer />
        </div>

        {/* Right: Recent Community Posts Mini Feed (3 items, some anonymous) */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-base text-[#1B1B1B]">Community Feed</h3>
                  <p className="text-xs text-[#6B7280]">Recent discussions & queries</p>
                </div>
                <Link
                  to="/community"
                  className="text-xs font-bold text-[#2D6A4F] hover:underline"
                >
                  View All
                </Link>
              </div>

              <div className="space-y-3.5">
                {postsLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2 animate-pulse">
                      <div className="h-3 w-3/4 bg-gray-200 rounded" />
                      <div className="h-3 w-1/2 bg-gray-200 rounded" />
                    </div>
                  ))}

                {!postsLoading && postsError && (
                  <p className="text-xs text-red-500">Failed to load discussions</p>
                )}

                {!postsLoading && !postsError && (communityPosts?.length ?? 0) === 0 && (
                  <p className="text-xs text-gray-400 italic">No recent discussions</p>
                )}

                {!postsLoading &&
                  !postsError &&
                  (communityPosts ?? []).map((post) => (
                    <Link
                      key={post.id}
                      to="/community"
                      className="block p-2 rounded-xl hover:bg-[#F8FAF9] transition-colors"
                    >
                      <p className="text-xs font-bold text-gray-900 line-clamp-1">
                        {post.title || 'منشور'}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {post.author?.isAnonymous ? 'طالب' : post.author?.name || 'طالب'} ·{' '}
                        {post.replyCount} ردود
                      </p>
                    </Link>
                  ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 mt-4">
              <Link
                to="/community"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9] transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#2D6A4F]" />
                <span>Start Discussion</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
