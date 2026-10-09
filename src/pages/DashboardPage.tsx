import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Compass,
  Flame,
  GraduationCap,
  Play,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageErrorBanner } from '../components/PageErrorBanner';
import { WeeklyChart } from '../components/WeeklyChart';
import { useMyEnrollments } from '../hooks/useMyEnrollments';
import { useProgressStats } from '../hooks/useProgressStats';

const card = 'rounded-3xl border border-[#E8EEEA] bg-white shadow-[0_8px_30px_rgba(20,55,37,0.04)]';

const DashboardStat: React.FC<{ icon: React.ElementType; label: string; value: string | number; note: string; tint: string }> = ({ icon: Icon, label, value, note, tint }) => (
  <div className={`${card} p-5 sm:p-6`}>
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-sm font-medium text-[#557262]">{label}</p><p className="mt-3 text-3xl font-bold tracking-tight text-[#19372A]">{value}</p></div>
      <span className={`grid h-11 w-11 place-items-center rounded-2xl ${tint}`}><Icon size={20} /></span>
    </div>
    <p className="mt-3 text-xs text-[#557262]">{note}</p>
  </div>
);

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { enrollments, isLoading, error: enrollmentsError } = useMyEnrollments();
  const { stats, error: statsError } = useProgressStats();
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'Learner';
  const inProgress = enrollments.filter((enrollment) => enrollment.progress < 100);
  const continueCourse = inProgress[0];
  const completedCount = enrollments.filter((enrollment) => enrollment.progress >= 100).length;
  const weeklyHours = stats?.weeklyHours ?? [];
  const hoursThisWeek = Math.round((stats?.totalHoursThisWeek ?? weeklyHours.reduce((sum, item) => sum + item.hours, 0)) * 10) / 10;
  const weeklyChartData = weeklyHours.map((item, index) => ({ ...item, active: index === weeklyHours.length - 1 }));
  const averageProgress = enrollments.length
    ? Math.round(enrollments.reduce((sum, enrollment) => sum + enrollment.progress, 0) / enrollments.length)
    : 0;
  const featuredImage = continueCourse?.thumbnail || '/images/learning-banner.webp';
  const featuredStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(90deg, rgba(19, 55, 39, 0.96) 0%, rgba(19, 55, 39, 0.88) 46%, rgba(19, 55, 39, 0.38) 100%), url("${featuredImage}")`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
  };

  return (
    <div className="student-dashboard mx-auto max-w-[1440px] space-y-8 pb-10 text-[#19372A] sm:space-y-10">
      <PageErrorBanner errors={[enrollmentsError, statsError]} />

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#2D6A4F]">Your learning space</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Welcome back, {firstName}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#557262]">A little progress every day adds up. Pick up where you left off or find something new to learn.</p>
        </div>
        <Link to="/browse" className="inline-flex w-fit items-center gap-2 rounded-2xl bg-[#2D6A4F] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#24583F]">
          <Compass size={17} /> Explore courses <ArrowRight size={16} />
        </Link>
      </header>

      <section className="relative isolate overflow-hidden rounded-[2rem] bg-[#173D2C] p-6 text-white shadow-[0_20px_55px_rgba(23,61,44,0.18)] sm:p-9 lg:min-h-[300px] lg:p-10" style={featuredStyle} aria-label="Continue learning">
        <div className="flex h-full items-center justify-between gap-6 lg:gap-10">
          <div className="max-w-2xl py-2 lg:max-w-[62%] lg:py-4">
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{continueCourse ? 'Ready to continue?' : 'Your next chapter starts here.'}</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/85">
              {continueCourse ? `Continue ${continueCourse.title} and keep your learning momentum going.` : 'Choose a course that interests you and build a learning routine that works for you.'}
            </p>
            {continueCourse ? (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link to={continueCourse.lastLessonId ? `/course/${continueCourse.id}/lesson/${continueCourse.lastLessonId}` : `/course/${continueCourse.id}`} className="inline-flex items-center gap-2 rounded-xl bg-[#B7E4C7] px-4 py-3 text-sm font-bold text-[#173D2C] transition hover:bg-white">
                  <Play size={16} fill="currentColor" /> Continue learning
                </Link>
              </div>
            ) : (
              <Link to="/browse" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#B7E4C7] px-4 py-3 text-sm font-bold text-[#173D2C] transition hover:bg-white">
                Find your first course <ArrowRight size={16} />
              </Link>
            )}
          </div>
          {continueCourse && <div className="hidden shrink-0 flex-col items-center gap-3 text-center sm:flex lg:mr-3">
            <div
              role="progressbar"
              aria-label={`Progress in ${continueCourse.title}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={continueCourse.progress}
              aria-valuetext={`${continueCourse.progress}% complete`}
              className="relative grid h-32 w-32 place-items-center rounded-full p-[9px] shadow-[0_12px_35px_rgba(0,0,0,0.18)]"
              style={{ background: `conic-gradient(#B7E4C7 ${continueCourse.progress}%, rgba(255,255,255,0.2) 0)` }}
            >
              <div className="grid h-full w-full place-items-center rounded-full border border-white/15 bg-[#173D2C]/90 backdrop-blur-sm">
                <div><p className="text-3xl font-bold tracking-tight">{continueCourse.progress}%</p><p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">completed</p></div>
              </div>
            </div>
            <span className="text-xs font-medium text-white/75">Course progress</span>
          </div>}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Learning summary">
        {isLoading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className={`${card} h-32 animate-pulse bg-white`} />) : <>
          <DashboardStat icon={BookOpen} label="My courses" value={enrollments.length} note="Courses in your library" tint="bg-[#E8F5EC] text-[#2D6A4F]" />
          <DashboardStat icon={CheckCircle2} label="Completed" value={completedCount} note="Keep building on what you know" tint="bg-[#F0F5E8] text-[#63823E]" />
          <DashboardStat icon={Clock3} label="Study time" value={`${hoursThisWeek}h`} note="This week" tint="bg-[#EAF2F5] text-[#45717D]" />
          <DashboardStat icon={Flame} label="Learning streak" value={`${stats?.streak ?? 0} days`} note="One session at a time" tint="bg-[#FFF3DF] text-[#C27B21]" />
        </>}
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <div className={`${card} self-start p-5 sm:p-7`}>
          <div className="flex items-end justify-between gap-4">
            <div><p className="text-sm font-semibold text-[#2D6A4F]">Pick up where you left off</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Continue learning</h2></div>
            <Link to="/my-courses" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-[#2D6A4F] hover:underline">All courses <ArrowRight size={15} /></Link>
          </div>
          {isLoading ? <div className="mt-6 h-36 animate-pulse rounded-2xl bg-[#F3F6F4]" /> : inProgress.length ? (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {inProgress.slice(0, 4).map((course) => <article key={course.id} className="group flex min-w-0 gap-4 rounded-2xl border border-[#E8EEEA] p-3 transition hover:border-[#B7E4C7] hover:bg-[#FBFDFB]">
                {course.thumbnail ? <img src={course.thumbnail} alt="" loading="lazy" className="h-24 w-24 shrink-0 rounded-xl object-cover" /> : <div className="grid h-24 w-24 shrink-0 place-items-center rounded-xl bg-[#E8F5EC] text-[#2D6A4F]"><BookOpen size={28} /></div>}
                <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
                  <div><p className="truncate text-xs font-bold uppercase tracking-wide text-[#557262]">{course.category || 'Course'}</p><h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-[#19372A]">{course.title}</h3><p className="mt-1 truncate text-xs text-[#557262]">{course.instructor.name}</p></div>
                  <div className="mt-3 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E8EEEA]"><div className="h-full rounded-full bg-[#2D6A4F]" style={{ width: `${course.progress}%` }} /></div><span className="text-[11px] font-semibold text-[#557262]">{course.progress}%</span></div>
                </div>
                <Link aria-label={`Continue ${course.title}`} to={course.lastLessonId ? `/course/${course.id}/lesson/${course.lastLessonId}` : `/course/${course.id}`} className="my-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#E8F5EC] text-[#2D6A4F] transition group-hover:bg-[#2D6A4F] group-hover:text-white"><Play size={15} fill="currentColor" /></Link>
              </article>)}
            </div>
          ) : <div className="mt-6 rounded-2xl bg-[#F5F8F6] px-5 py-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-[#557262]" /><h3 className="mt-3 font-semibold">Your course list is ready when you are</h3><p className="mt-1 text-sm text-[#557262]">Explore the catalog and add your first course.</p><Link to="/browse" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white">Browse courses <ArrowRight size={15} /></Link></div>}
        </div>

        <div className={`${card} flex flex-col p-5 sm:p-7`}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#2D6A4F]">A steady rhythm</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Your progress</h2></div><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#E8F5EC] text-[#2D6A4F]"><TrendingUp size={19} /></span></div>
          <div className="mt-7 flex items-center gap-5">
            <div role="progressbar" aria-label="Average course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={averageProgress} aria-valuetext={`${averageProgress}% average progress`} className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#2D6A4F ${averageProgress}%, #E8EEEA 0)` }}><div className="grid h-[5.25rem] w-[5.25rem] place-items-center rounded-full bg-white text-center"><span className="text-xl font-bold">{averageProgress}%</span></div></div>
            <div><p className="font-semibold">Average course progress</p><p className="mt-1 text-sm leading-5 text-[#557262]">Your learning adds up with every lesson you complete.</p><Link to="/progress" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#2D6A4F]">View progress <ArrowRight size={14} /></Link></div>
          </div>
          <div className="mt-7"><WeeklyChart data={weeklyChartData} /></div>
        </div>
      </section>

      <section aria-label="Quick links" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/academic" className={`${card} group flex min-h-[76px] cursor-pointer items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-[#B7E4C7]`}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#E8F5EC] text-[#2D6A4F]"><GraduationCap size={22} /></span><span className="min-w-0 flex-1"><span className="block font-bold">Academic tracks</span><span className="mt-1 block text-sm text-[#557262]">School and university learning</span></span><ArrowRight className="shrink-0 text-[#557262] transition group-hover:translate-x-1 group-hover:text-[#2D6A4F]" size={17} /></Link>
        <Link to="/ai-tutor" className={`${card} group flex min-h-[76px] cursor-pointer items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-[#B7E4C7]`}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#F2EEFA] text-[#7654A6]"><Sparkles size={20} /></span><span className="min-w-0 flex-1"><span className="block font-bold">Ask your AI tutor</span><span className="mt-1 block text-sm text-[#557262]">Get help while you study</span></span><ArrowRight className="shrink-0 text-[#557262] transition group-hover:translate-x-1 group-hover:text-[#2D6A4F]" size={17} /></Link>
        <Link to="/learning-path" className={`${card} group flex min-h-[76px] cursor-pointer items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-[#B7E4C7]`}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFF3DF] text-[#B97922]"><TrendingUp size={20} /></span><span className="min-w-0 flex-1"><span className="block font-bold">Learning Path</span><span className="mt-1 block text-sm text-[#557262]">Plan what you want to learn</span></span><ArrowRight className="shrink-0 text-[#557262] transition group-hover:translate-x-1 group-hover:text-[#2D6A4F]" size={17} /></Link>
        <Link to="/browse" className={`${card} group flex min-h-[76px] cursor-pointer items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-[#B7E4C7]`}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#EAF2F5] text-[#45717D]"><Compass size={20} /></span><span className="min-w-0 flex-1"><span className="block font-bold">Explore courses</span><span className="mt-1 block text-sm text-[#557262]">Find your next course</span></span><ArrowRight className="shrink-0 text-[#557262] transition group-hover:translate-x-1 group-hover:text-[#2D6A4F]" size={17} /></Link>
      </section>

    </div>
  );
};
