import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Compass,
  Flame,
  GraduationCap,
  Play,
  Sparkles,
  TrendingUp,
  Award,
  Layers,
  HelpCircle,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageErrorBanner } from '../components/PageErrorBanner';
import { WeeklyChart } from '../components/WeeklyChart';
import { useMyEnrollments } from '../hooks/useMyEnrollments';
import { useProgressStats } from '../hooks/useProgressStats';

/* ──────────────────────────────────────────────────────────────────
   Nudra Editorial Design Tokens & Styling (Light + Dark support)
   --green:  #063e33   (Egyptian deep forest)
   --lime:   #e0f36b   (electric chartreuse accent)
   --paper:  #faf9f3   (warm editorial paper)
   --sage:   #e8edda   (soft olive tint)
   --ink:    #182b25   (near-black green)
   --muted:  #66736b   (soft description ink)
   --accent: #63815c   (sage heading accent)
   ────────────────────────────────────────────────────────────────── */

const editorialCard =
  'rounded-[22px] border border-[#063e33]/10 dark:border-white/10 bg-white dark:bg-[#132026] transition-all duration-300 hover:shadow-[0_8px_32px_rgba(6,62,51,0.06)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-[#063e33]/20 dark:hover:border-white/20';

const learningStages = [
  {
    num: '01',
    title: 'Preparatory school',
    arabic: 'إعدادي · Foundations',
    desc: 'Build strong foundations and learn how to study effectively.',
    link: '/academic',
    image: '/images/landing/editorial/road-preparatory.png',
  },
  {
    num: '02',
    title: 'Secondary school',
    arabic: 'ثانوي · Thanaweya',
    desc: 'Master the curriculum and prepare with practice exams.',
    link: '/academic',
    image: '/images/landing/editorial/road-secondary.png',
  },
  {
    num: '03',
    title: 'University',
    arabic: 'Your next chapter',
    desc: 'Go deeper into your specialization and future career.',
    link: '/academic',
    image: '/images/landing/editorial/road-university.png',
  },
  {
    num: '04',
    title: 'Skills for life',
    arabic: 'Keep becoming',
    desc: 'Languages, technology, business, and continuous growth.',
    link: '/browse',
    image: '/images/landing/editorial/road-skills.png',
  },
];

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enrollments, isLoading, error: enrollmentsError } = useMyEnrollments();
  const { stats, error: statsError } = useProgressStats();

  const [activeFilter, setActiveFilter] = useState<'all' | 'in-progress' | 'completed'>('in-progress');

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'Learner';
  const inProgress = enrollments.filter((e) => e.progress < 100);
  const completed = enrollments.filter((e) => e.progress >= 100);
  const continueCourse = inProgress[0];

  const filteredCourses =
    activeFilter === 'all'
      ? enrollments
      : activeFilter === 'completed'
      ? completed
      : inProgress;

  const weeklyHours = stats?.weeklyHours ?? [];
  const hoursThisWeek =
    Math.round((stats?.totalHoursThisWeek ?? weeklyHours.reduce((sum, item) => sum + item.hours, 0)) * 10) / 10;
  const weeklyChartData = weeklyHours.map((item, index) => ({
    ...item,
    active: index === weeklyHours.length - 1,
  }));

  const averageProgress = enrollments.length
    ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length)
    : 0;

  const todayStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  const handleLaunchAiPrompt = (promptText: string) => {
    navigate(`/ai-tutor?prompt=${encodeURIComponent(promptText)}`);
  };

  return (
    <div className="nudra-student-dashboard mx-auto max-w-[1360px] space-y-8 pb-16 text-[#063e33] dark:text-slate-100 transition-colors duration-200">
      <PageErrorBanner errors={[enrollmentsError, statsError]} />

      {/* ──────────────────────────────────────────────────────────
          1. Editorial Hero Banner & Greeting (Light + Dark)
          ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[26px] border border-[#063e33]/12 dark:border-[#2d5945]/40 bg-[#e8edda] dark:bg-[#132820] p-6 sm:p-9 lg:p-10 shadow-[0_4px_24px_rgba(6,62,51,0.04)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.3)] transition-colors duration-200">
        {/* Subtle decorative motif */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-[#d4ed94]/30 dark:bg-[#e0f36b]/10 blur-2xl" />
        <div className="pointer-events-none absolute right-1/4 -bottom-10 h-48 w-48 rounded-full bg-[#faf9f3]/40 dark:bg-emerald-500/10 blur-xl" />

        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            {/* Eyebrow & Stage Tag */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#063e33]/15 dark:border-white/15 bg-[#faf9f3] dark:bg-black/30 px-3.5 py-1 text-[10px] font-bold tracking-[2px] uppercase text-[#49644f] dark:text-emerald-300 shadow-xs">
                <Sparkles size={12} className="text-[#a6ba49] dark:text-[#e0f36b]" />
                Student sanctuary · مساحتك
              </span>

              {user?.grade ? (
                <span className="inline-flex items-center rounded-full bg-[#063e33] dark:bg-[#063e33] px-3.5 py-1 text-[10px] font-bold tracking-wide text-[#e0f36b] border border-[#e0f36b]/20">
                  {user.grade}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[#063e33]/10 dark:bg-white/10 px-3.5 py-1 text-[10px] font-semibold tracking-wide text-[#063e33] dark:text-emerald-200">
                  Lifelong Learner
                </span>
              )}

              <span className="text-[11px] text-[#66736b] dark:text-emerald-200/60 hidden sm:inline">
                {todayStr}
              </span>
            </div>

            {/* Main Greeting with Editorial Typography */}
            <h1 className="mt-4 text-[clamp(32px,4.5vw,52px)] font-normal tracking-[-1.5px] leading-[1.08] text-[#063e33] dark:text-white">
              Welcome back,{' '}
              <span className="italic text-[#63815c] dark:text-[#a3cca8] font-normal underline decoration-[#e0f36b] decoration-3 underline-offset-4">
                {firstName}
              </span>
              <span className="text-[#a6ba49] dark:text-[#e0f36b]">.</span>
            </h1>

            {/* Motto / Guidance */}
            <p className="mt-3 max-w-xl text-[14px] leading-[1.8] text-[#66736b] dark:text-emerald-100/70">
              Your curiosity has no finish line. Take a small step today, whether reviewing tricky questions or starting your next chapter.
            </p>
          </div>

          {/* Quick Header Action Pills */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              to="/ai-tutor"
              className="inline-flex items-center gap-2 rounded-full bg-[#063e33] dark:bg-[#0a4d3f] px-5 py-3 text-[12px] font-bold text-[#faf9f3] transition-all duration-200 hover:bg-[#063e33]/90 dark:hover:bg-[#0c5c4c] hover:scale-[1.02] active:scale-[0.98] shadow-sm border border-transparent dark:border-[#e0f36b]/20"
            >
              <Sparkles size={14} className="text-[#e0f36b]" />
              <span>Ask AI Tutor</span>
            </Link>

            <Link
              to="/browse"
              className="inline-flex items-center gap-2 rounded-full border border-[#063e33]/25 dark:border-white/20 bg-[#faf9f3] dark:bg-white/10 px-5 py-3 text-[12px] font-bold text-[#063e33] dark:text-white transition-all duration-200 hover:bg-white dark:hover:bg-white/20 hover:border-[#063e33] dark:hover:border-white/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Explore Catalog</span>
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          2. Learning Pulse & Metrics Ribbon (Light + Dark)
          ────────────────────────────────────────────────────────── */}
      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Learning metrics">
        {/* Metric 1: Streak */}
        <div className={`${editorialCard} p-5 flex flex-col justify-between group relative overflow-hidden shadow-[0_4px_20px_rgba(6,62,51,0.04)]`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#49644f] dark:text-emerald-400 flex items-center gap-1.5">
                <span>01</span>
                <span>·</span>
                <span>Active Streak</span>
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-[#063e33] dark:text-white">
                  {stats?.streak ?? 0}
                </span>
                <span className="text-[12px] font-semibold text-[#66736b] dark:text-slate-400">days in a row</span>
              </div>
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e0f36b]/40 dark:bg-[#e0f36b]/20 text-[#063e33] dark:text-[#e0f36b] group-hover:scale-105 transition-transform">
              <Flame size={20} className="fill-[#063e33] dark:fill-[#e0f36b]" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#063e33]/8 dark:border-white/10 flex items-center justify-between text-[11px] text-[#66736b] dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="text-[#a6ba49] dark:text-[#e0f36b]">✦</span>
              <span>Keep the habit alive</span>
            </span>
            <span className="font-semibold text-[#063e33] dark:text-white">Daily goal</span>
          </div>
        </div>

        {/* Metric 2: Weekly Cadence */}
        <div className={`${editorialCard} p-5 flex flex-col justify-between group relative overflow-hidden shadow-[0_4px_20px_rgba(6,62,51,0.04)]`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#49644f] dark:text-emerald-400 flex items-center gap-1.5">
                <span>02</span>
                <span>·</span>
                <span>Weekly Cadence</span>
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-[#063e33] dark:text-white">
                  {hoursThisWeek}
                </span>
                <span className="text-[12px] font-semibold text-[#66736b] dark:text-slate-400">hours logged</span>
              </div>
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8edda] dark:bg-emerald-950/60 text-[#063e33] dark:text-emerald-300 group-hover:scale-105 transition-transform">
              <Clock3 size={20} strokeWidth={1.8} />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#063e33]/8 dark:border-white/10 flex items-center justify-between text-[11px] text-[#66736b] dark:text-slate-400">
            <span>This week's focus</span>
            <span className="font-semibold text-[#63815c] dark:text-emerald-400">
              {hoursThisWeek >= 5 ? 'Strong rhythm ✦' : 'Building up'}
            </span>
          </div>
        </div>

        {/* Metric 3: Active Courses */}
        <div className={`${editorialCard} p-5 flex flex-col justify-between group relative overflow-hidden shadow-[0_4px_20px_rgba(6,62,51,0.04)]`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#49644f] dark:text-emerald-400 flex items-center gap-1.5">
                <span>03</span>
                <span>·</span>
                <span>Active Shelf</span>
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-[#063e33] dark:text-white">
                  {inProgress.length}
                </span>
                <span className="text-[12px] font-semibold text-[#66736b] dark:text-slate-400">
                  of {enrollments.length} courses
                </span>
              </div>
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#eaf2f5] dark:bg-teal-950/60 text-[#24583f] dark:text-teal-300 group-hover:scale-105 transition-transform">
              <BookOpen size={20} strokeWidth={1.8} />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#063e33]/8 dark:border-white/10 flex items-center justify-between text-[11px] text-[#66736b] dark:text-slate-400">
            <span>{completed.length} completed</span>
            <Link to="/my-courses" className="font-semibold text-[#063e33] dark:text-white hover:underline flex items-center gap-0.5">
              <span>View all</span>
              <ArrowRight size={11} />
            </Link>
          </div>
        </div>

        {/* Metric 4: Milestones */}
        <div className={`${editorialCard} p-5 flex flex-col justify-between group relative overflow-hidden shadow-[0_4px_20px_rgba(6,62,51,0.04)]`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#49644f] dark:text-emerald-400 flex items-center gap-1.5">
                <span>04</span>
                <span>·</span>
                <span>Achievements</span>
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-[#063e33] dark:text-white">
                  {stats?.unlockedBadgeCount ?? completed.length}
                </span>
                <span className="text-[12px] font-semibold text-[#66736b] dark:text-slate-400">badges earned</span>
              </div>
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff3df] dark:bg-amber-950/60 text-[#c27b21] dark:text-amber-300 group-hover:scale-105 transition-transform">
              <Award size={20} strokeWidth={1.8} />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#063e33]/8 dark:border-white/10 flex items-center justify-between text-[11px] text-[#66736b] dark:text-slate-400">
            <span>Progress score</span>
            <span className="font-semibold text-[#063e33] dark:text-white">{averageProgress}% avg</span>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          3. Focus Stage: Current Chapter (Continue Learning)
          ────────────────────────────────────────────────────────── */}
      {continueCourse ? (
        <section
          className="relative isolate overflow-hidden rounded-[26px] bg-[#063e33] text-white border border-transparent dark:border-white/10 shadow-[0_20px_60px_rgba(6,62,51,0.25)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-all duration-300"
          aria-label="Continue learning focus"
        >
          {/* Subtle background glow & texture */}
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-[#63815c]/25 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-[#e0f36b]/10 blur-3xl" />

          <div className="relative flex flex-col gap-8 p-6 sm:p-9 lg:flex-row lg:items-center lg:justify-between lg:p-10">
            {/* Left Course Information */}
            <div className="max-w-2xl lg:max-w-[60%]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#e0f36b] px-3.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase text-[#063e33]">
                  ✦ In Progress
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/85">
                  {continueCourse.category || 'Curriculum'}
                </span>
                {continueCourse.level && (
                  <span className="text-[11px] text-white/60">
                    · {continueCourse.level}
                  </span>
                )}
              </div>

              <h2 className="mt-4 text-[clamp(24px,3.2vw,36px)] font-bold tracking-[-1px] leading-[1.18] text-white">
                {continueCourse.title}
              </h2>

              <p className="mt-2 text-[13px] text-white/75 leading-relaxed line-clamp-2">
                {continueCourse.subtitle ||
                  `Guided by ${continueCourse.instructor?.name || 'Your Instructor'}. Keep your momentum going.`}
              </p>

              {/* Progress and Lesson Stats Bar */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex-1 max-w-xs">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-white/70">Course completion</span>
                    <span className="font-bold text-[#e0f36b]">{continueCourse.progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#e0f36b] to-[#a6ba49] transition-all duration-700"
                      style={{ width: `${continueCourse.progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[12px] text-white/70">
                  <span className="flex items-center gap-1.5">
                    <Clock3 size={14} className="text-[#e0f36b]" />
                    <span>{continueCourse.duration || 'Self-paced'}</span>
                  </span>
                  <span>·</span>
                  <span>{continueCourse.lessonsCount || 12} lessons</span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-7 flex flex-wrap items-center gap-3.5">
                <Link
                  to={
                    continueCourse.lastLessonId
                      ? `/course/${continueCourse.id}/lesson/${continueCourse.lastLessonId}`
                      : `/course/${continueCourse.id}`
                  }
                  className="inline-flex items-center gap-2.5 rounded-full bg-[#e0f36b] px-6 py-3.5 text-[13px] font-bold text-[#063e33] transition-all duration-200 hover:bg-white hover:scale-[1.02] active:scale-[0.98] shadow-md"
                >
                  <Play size={15} fill="currentColor" />
                  <span>Resume Lecture</span>
                </Link>

                <Link
                  to={`/course/${continueCourse.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-5 py-3.5 text-[12px] font-semibold text-white transition-all duration-200 hover:bg-white/20 hover:border-white/40"
                >
                  <span>Syllabus & notes</span>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>

            {/* Right Course Visual Thumbnail */}
            <div className="relative shrink-0 self-center lg:self-auto">
              <div className="relative overflow-hidden rounded-[20px] border-2 border-white/15 bg-white/5 p-2 shadow-2xl backdrop-blur-sm">
                {continueCourse.thumbnail ? (
                  <img
                    src={continueCourse.thumbnail}
                    alt={continueCourse.title}
                    className="h-44 w-72 rounded-[14px] object-cover sm:h-52 sm:w-80"
                  />
                ) : (
                  <div className="flex h-44 w-72 flex-col items-center justify-center rounded-[14px] bg-[#063e33]/90 sm:h-52 sm:w-80 text-white/80">
                    <BookOpen size={48} strokeWidth={1.3} className="text-[#e0f36b]" />
                    <span className="mt-3 text-xs font-semibold uppercase tracking-widest text-white/60">
                      Nudra Course
                    </span>
                  </div>
                )}

                {/* Floating percentage badge with editorial rotation */}
                <div className="absolute -bottom-2 -left-2 rotate-[-3deg] rounded-full border border-[#063e33]/15 dark:border-white/15 bg-[#faf9f3] dark:bg-[#132026] px-3.5 py-1.5 text-[11px] font-bold text-[#063e33] dark:text-white shadow-lg">
                  {continueCourse.progress}% Completed
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* Empty State / Welcome to Begin Journey */
        <section className="relative overflow-hidden rounded-[26px] border border-[#063e33]/12 dark:border-white/10 bg-[#faf9f3] dark:bg-[#132026] p-7 sm:p-10 shadow-xs transition-colors duration-200">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="max-w-xl text-center md:text-left">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[2px] uppercase text-[#63815c] dark:text-emerald-400">
                <Sparkles size={12} className="text-[#a6ba49] dark:text-[#e0f36b]" />
                Your journey starts wherever you are
              </span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#063e33] dark:text-white">
                Ready to find your first course?
              </h2>
              <p className="mt-2 text-[13px] leading-[1.8] text-[#66736b] dark:text-slate-300">
                Explore school curriculums, university subjects, and practical skills taught by dedicated Egyptian educators.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
                <Link
                  to="/browse"
                  className="inline-flex items-center gap-2 rounded-full bg-[#063e33] dark:bg-[#0a4d3f] px-6 py-3 text-[12px] font-bold text-white transition hover:bg-[#063e33]/90 dark:hover:bg-[#0c5c4c]"
                >
                  <span>Browse catalog</span>
                  <ArrowRight size={15} />
                </Link>
                <Link
                  to="/academic"
                  className="inline-flex items-center gap-2 rounded-full border border-[#063e33]/20 dark:border-white/20 bg-transparent px-5 py-3 text-[12px] font-semibold text-[#063e33] dark:text-white hover:bg-[#e8edda] dark:hover:bg-white/10"
                >
                  <span>Academic tracks</span>
                </Link>
              </div>
            </div>

            <div className="shrink-0">
              <img
                src="/images/landing/editorial/experience.png"
                alt="Learners studying"
                className="h-44 w-auto object-contain opacity-90 sm:h-52"
              />
            </div>
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────
          4. Main Dashboard Split: Course Shelf + Study Companion
          ────────────────────────────────────────────────────────── */}
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
        {/* Left Column: Course Shelf & Learning Stages */}
        <div className="space-y-8 min-w-0">
          {/* Section: Your Course Shelf */}
          <div className={`${editorialCard} p-6 sm:p-7 shadow-[0_4px_24px_rgba(6,62,51,0.04)]`}>
            {/* Header with Filter Pills */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#49644f] dark:text-emerald-400">
                  Active Shelf · مقرراتك الحالية
                </span>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#063e33] dark:text-white">
                  My courses
                </h2>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 rounded-full border border-[#063e33]/10 dark:border-white/10 bg-[#faf9f3] dark:bg-[#0b141a] p-1 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveFilter('in-progress')}
                  className={`rounded-full px-3.5 py-1.5 transition-all cursor-pointer ${
                    activeFilter === 'in-progress'
                      ? 'bg-[#063e33] dark:bg-[#0a4d3f] text-white shadow-xs'
                      : 'text-[#66736b] dark:text-slate-400 hover:text-[#063e33] dark:hover:text-white'
                  }`}
                >
                  In progress ({inProgress.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={`rounded-full px-3.5 py-1.5 transition-all cursor-pointer ${
                    activeFilter === 'all'
                      ? 'bg-[#063e33] dark:bg-[#0a4d3f] text-white shadow-xs'
                      : 'text-[#66736b] dark:text-slate-400 hover:text-[#063e33] dark:hover:text-white'
                  }`}
                >
                  All ({enrollments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('completed')}
                  className={`rounded-full px-3.5 py-1.5 transition-all cursor-pointer ${
                    activeFilter === 'completed'
                      ? 'bg-[#063e33] dark:bg-[#0a4d3f] text-white shadow-xs'
                      : 'text-[#66736b] dark:text-slate-400 hover:text-[#063e33] dark:hover:text-white'
                  }`}
                >
                  Completed ({completed.length})
                </button>
              </div>
            </div>

            {/* Courses List */}
            {isLoading ? (
              <div className="mt-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#faf9f3] dark:bg-white/5" />
                ))}
              </div>
            ) : filteredCourses.length > 0 ? (
              <div className="mt-6 divide-y divide-[#063e33]/8 dark:divide-white/10">
                {filteredCourses.slice(0, 5).map((course, idx) => (
                  <article
                    key={course.id}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 transition-colors first:pt-2 last:pb-1"
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      {/* Numbering Indicator */}
                      <span className="hidden sm:grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#063e33]/15 dark:border-white/15 text-[10px] font-semibold text-[#49644f] dark:text-emerald-400 mt-1">
                        0{idx + 1}
                      </span>

                      {/* Course Thumbnail */}
                      <div className="relative h-18 w-24 shrink-0 overflow-hidden rounded-xl border border-[#063e33]/10 dark:border-white/10 bg-[#faf9f3] dark:bg-white/5">
                        {course.thumbnail ? (
                          <img
                            src={course.thumbnail}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[#063e33] dark:text-white">
                            <BookOpen size={20} strokeWidth={1.5} />
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#63815c] dark:text-emerald-400">
                            {course.category || 'General'}
                          </span>
                          {course.level && (
                            <span className="text-[10px] text-[#66736b] dark:text-slate-400">· {course.level}</span>
                          )}
                        </div>

                        <h3 className="mt-0.5 truncate text-[14px] font-bold text-[#063e33] dark:text-white group-hover:text-[#63815c] dark:group-hover:text-emerald-300 transition-colors">
                          <Link to={`/course/${course.id}`}>{course.title}</Link>
                        </h3>

                        <p className="text-[11px] text-[#66736b] dark:text-slate-400">
                          {course.instructor?.name || 'Instructor'}
                        </p>

                        {/* Progress Bar */}
                        <div className="mt-2.5 flex items-center gap-2.5 max-w-xs">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#063e33]/8 dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#063e33] to-[#63815c] dark:from-emerald-400 dark:to-teal-300 transition-all duration-500"
                              style={{ width: `${course.progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold tabular-nums text-[#063e33] dark:text-white">
                            {course.progress}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Resume / Details Action */}
                    <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-center">
                      <Link
                        to={
                          course.lastLessonId
                            ? `/course/${course.id}/lesson/${course.lastLessonId}`
                            : `/course/${course.id}`
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#063e33]/15 dark:border-white/15 bg-[#faf9f3] dark:bg-white/10 px-4 py-2 text-[11px] font-bold text-[#063e33] dark:text-white transition-all duration-200 hover:bg-[#e0f36b] dark:hover:bg-[#e0f36b] hover:text-[#063e33] dark:hover:text-[#063e33]"
                      >
                        <Play size={12} fill="currentColor" />
                        <span>{course.progress > 0 ? 'Continue' : 'Start'}</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#063e33]/15 dark:border-white/15 bg-[#faf9f3] dark:bg-white/5 p-8 text-center">
                <BookOpen className="h-8 w-8 text-[#063e33]/60 dark:text-white/60" strokeWidth={1.4} />
                <p className="mt-3 text-[14px] font-bold text-[#063e33] dark:text-white">
                  No courses found in this tab
                </p>
                <p className="mt-1 text-[12px] text-[#66736b] dark:text-slate-400">
                  {activeFilter === 'completed'
                    ? "You haven't completed any courses yet. Keep moving forward!"
                    : 'Explore our catalog to start learning.'}
                </p>
                <Link
                  to="/browse"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#063e33] dark:bg-[#0a4d3f] px-5 py-2.5 text-[11px] font-bold text-white hover:bg-[#063e33]/90"
                >
                  <span>Explore courses</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            )}

            {/* Bottom Link to Full Library */}
            <div className="mt-5 pt-4 border-t border-[#063e33]/8 dark:border-white/10 flex items-center justify-between text-[12px]">
              <span className="text-[#66736b] dark:text-slate-400">
                Showing {Math.min(5, filteredCourses.length)} of {filteredCourses.length} items
              </span>
              <Link
                to="/my-courses"
                className="inline-flex items-center gap-1.5 font-bold text-[#063e33] dark:text-emerald-400 hover:text-[#63815c] dark:hover:text-emerald-300 transition-colors"
              >
                <span>Go to full library</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* Section: Explore by Learning Stage (Roadmap from landing page) */}
          <div className={`${editorialCard} p-6 sm:p-7 shadow-[0_4px_24px_rgba(6,62,51,0.04)]`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#49644f] dark:text-emerald-400">
                  One Journey · So Many Possibilities
                </span>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#063e33] dark:text-white">
                  Learning pathways
                </h2>
              </div>
              <Link
                to="/academic"
                className="text-[12px] font-bold text-[#063e33] dark:text-emerald-400 hover:text-[#63815c] dark:hover:text-emerald-300 flex items-center gap-1"
              >
                <span>All tracks</span>
                <ArrowRight size={13} />
              </Link>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {learningStages.map((stage) => (
                <Link
                  key={stage.num}
                  to={stage.link}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#063e33]/10 dark:border-white/10 bg-[#faf9f3] dark:bg-[#0b141a] p-5 transition-all duration-300 hover:bg-white dark:hover:bg-[#182730] hover:border-[#063e33]/25 dark:hover:border-white/20 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-widest text-[#063e33]/40 dark:text-slate-500">
                      {stage.num}
                    </span>
                    <div className="h-10 w-10 overflow-hidden rounded-xl bg-white dark:bg-white/10 p-1 shadow-xs border border-[#063e33]/8 dark:border-white/10">
                      <img
                        src={stage.image}
                        alt=""
                        className="h-full w-full object-contain group-hover:scale-110 transition-transform duration-300"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#63815c] dark:text-emerald-400">
                        {stage.arabic}
                      </span>
                      <ArrowUpRight
                        size={14}
                        className="text-[#66736b] dark:text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#063e33] dark:group-hover:text-white"
                      />
                    </div>
                    <h3 className="mt-1 text-[13px] font-bold text-[#063e33] dark:text-white">
                      {stage.title}
                    </h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#66736b] dark:text-slate-400 line-clamp-2">
                      {stage.desc}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Weekly Rhythm, AI Tutor Launcher, Exam Simulator */}
        <div className="space-y-6">
          {/* Card 1: Weekly Cadence & Chart */}
          <div className={`${editorialCard} p-6 shadow-[0_4px_24px_rgba(6,62,51,0.04)]`}>
            <WeeklyChart data={weeklyChartData} />
          </div>

          {/* Card 2: Nudra AI Study Companion Launcher */}
          <div className="relative overflow-hidden rounded-[22px] bg-[#063e33] p-6 text-white border border-transparent dark:border-white/10 shadow-lg">
            {/* Glow */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#e0f36b]/20 blur-2xl" />

            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[9px] font-bold tracking-[2px] uppercase text-[#e0f36b]">
                  <Sparkles size={11} /> AI Tutor · رفيقك الذكي
                </span>
                <span className="text-[10px] text-white/50">24/7 Available</span>
              </div>

              <h3 className="mt-3 text-lg font-bold tracking-tight text-white">
                Stuck on a tricky concept?
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-white/75">
                Ask in Arabic or English to break down complex lessons, practice formulas, or summarize questions.
              </p>

              {/* Quick Prompt Chips */}
              <div className="mt-4 space-y-2">
                {[
                  'اشرح لي هذا الدرس بأسلوب مبسط',
                  'Summarize my active lesson chapter',
                  'Generate a 5-question practice quiz',
                ].map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => handleLaunchAiPrompt(promptText)}
                    className="w-full text-left rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-medium text-white/90 transition-all hover:bg-white/15 hover:border-[#e0f36b]/60 flex items-center justify-between group cursor-pointer"
                  >
                    <span className="truncate">{promptText}</span>
                    <ArrowRight size={12} className="shrink-0 text-white/50 group-hover:text-[#e0f36b] group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-white/15 flex items-center justify-between">
                <span className="text-[11px] text-white/60">Trained on your curriculum</span>
                <Link
                  to="/ai-tutor"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#e0f36b] px-4 py-1.5 text-[11px] font-bold text-[#063e33] transition hover:bg-white"
                >
                  <span>Open Tutor</span>
                  <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>
          </div>

          {/* Card 3: Academic Exam Simulator & Community Quick Portal */}
          <div className={`${editorialCard} p-6 space-y-4 shadow-[0_4px_24px_rgba(6,62,51,0.04)]`}>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#49644f] dark:text-emerald-400">
                Practice & Discussions
              </span>
              <h3 className="mt-0.5 text-base font-bold text-[#063e33] dark:text-white">
                Sharpen your skills
              </h3>
            </div>

            <div className="space-y-2.5">
              <Link
                to="/exam-simulator"
                className="group flex items-center justify-between rounded-xl border border-[#063e33]/8 dark:border-white/10 bg-[#faf9f3] dark:bg-[#0b141a] p-3.5 transition-colors hover:bg-white dark:hover:bg-[#182730]"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#063e33]/8 dark:bg-white/10 text-[#063e33] dark:text-white">
                    <GraduationCap size={18} strokeWidth={1.8} />
                  </span>
                  <div>
                    <h4 className="text-[13px] font-bold text-[#063e33] dark:text-white">Exam Simulator</h4>
                    <p className="text-[11px] text-[#66736b] dark:text-slate-400">Thanaweya & subject past papers</p>
                  </div>
                </div>
                <ArrowUpRight size={15} className="text-[#66736b] dark:text-slate-400 group-hover:text-[#063e33] dark:group-hover:text-white transition-colors" />
              </Link>

              <Link
                to="/community"
                className="group flex items-center justify-between rounded-xl border border-[#063e33]/8 dark:border-white/10 bg-[#faf9f3] dark:bg-[#0b141a] p-3.5 transition-colors hover:bg-white dark:hover:bg-[#182730]"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8edda] dark:bg-emerald-950/60 text-[#063e33] dark:text-emerald-300">
                    <Users size={18} strokeWidth={1.8} />
                  </span>
                  <div>
                    <h4 className="text-[13px] font-bold text-[#063e33] dark:text-white">Student Community</h4>
                    <p className="text-[11px] text-[#66736b] dark:text-slate-400">Ask questions, study together</p>
                  </div>
                </div>
                <ArrowUpRight size={15} className="text-[#66736b] dark:text-slate-400 group-hover:text-[#063e33] dark:group-hover:text-white transition-colors" />
              </Link>

              <Link
                to="/learning-path"
                className="group flex items-center justify-between rounded-xl border border-[#063e33]/8 dark:border-white/10 bg-[#faf9f3] dark:bg-[#0b141a] p-3.5 transition-colors hover:bg-white dark:hover:bg-[#182730]"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e0f36b]/30 dark:bg-[#e0f36b]/20 text-[#063e33] dark:text-[#e0f36b]">
                    <TrendingUp size={18} strokeWidth={1.8} />
                  </span>
                  <div>
                    <h4 className="text-[13px] font-bold text-[#063e33] dark:text-white">Custom Learning Path</h4>
                    <p className="text-[11px] text-[#66736b] dark:text-slate-400">Track your personal milestones</p>
                  </div>
                </div>
                <ArrowUpRight size={15} className="text-[#66736b] dark:text-slate-400 group-hover:text-[#063e33] dark:group-hover:text-white transition-colors" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
