import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  GraduationCap,
  Briefcase,
  BookOpen,
  PlayCircle,
  TrendingUp,
  Wallet,
  ClipboardCheck,
  MessageSquare,
  Award,
  Clock,
  CheckCircle2,
  XCircle,
  LogOut,
  Search,
  ExternalLink,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

// ---------- Types (mirror /api/admin responses) ----------

interface Overview {
  users: { students: number; instructors: number; pendingApplications: number; admins: number; newLast30Days: number };
  courses: { total: number; published: number; drafts: number; lessons: number; lessonsWithVideo: number };
  enrollments: { total: number; completed: number; completionRate: number; avgProgress: number; enrollmentValue: number };
  activity: { quizAttempts: number; avgQuizScore: number; communityPosts: number; communityReplies: number; certificates: number };
  monthly: { month: string; enrollments: number; newUsers: number }[];
}

interface CourseStat {
  id: string;
  title: string;
  category: string;
  isPublished: boolean;
  instructorName: string;
  price: number;
  lessons: number;
  lessonsWithVideo: number;
  enrollments: number;
  completed: number;
  avgProgress: number;
  enrollmentValue: number;
  avgRating: number | null;
  reviews: number;
  quizAttempts: number;
  avgQuizScore: number | null;
}

type ApplicationStatus = 'pending' | 'approved' | 'rejected';

interface Application {
  userId: string;
  name: string;
  email: string;
  subjects: string;
  experienceYears: number;
  bio: string;
  portfolioUrl: string | null;
  status: ApplicationStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

type Tab = 'overview' | 'courses' | 'applications';

// ---------- Helpers ----------

const money = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} EGP`;
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
};
const errorMessage = (err: unknown, fallback: string) =>
  (err as any)?.response?.data?.message || fallback;

const card = 'rounded-2xl bg-white border border-gray-100 shadow-sm';

const ErrorBox: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className={`${card} p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 border-red-100`}>
    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
    <p className="text-sm text-red-600 font-semibold flex-1">{message}</p>
    <button
      onClick={onRetry}
      className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9]"
    >
      Try again
    </button>
  </div>
);

const Tile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ElementType;
  tone?: 'default' | 'primary' | 'warn';
  onClick?: () => void;
}> = ({ label, value, hint, icon: Icon, tone = 'default', onClick }) => {
  const toneClass =
    tone === 'primary'
      ? 'bg-gradient-to-br from-[#2D6A4F] to-[#1E4D38] text-white border-transparent'
      : tone === 'warn'
        ? 'bg-amber-50 border-amber-200'
        : 'bg-white border-gray-100';
  const Wrapper: React.ElementType = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`rounded-2xl border shadow-sm p-5 text-left w-full ${toneClass} ${
        onClick ? 'hover:shadow-md transition-shadow cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold uppercase tracking-wider ${tone === 'primary' ? 'text-emerald-100' : 'text-gray-500'}`}>
          {label}
        </span>
        <Icon className={`w-4 h-4 ${tone === 'primary' ? 'text-emerald-200' : tone === 'warn' ? 'text-amber-600' : 'text-[#2D6A4F]'}`} />
      </div>
      <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${tone === 'primary' ? '' : 'text-[#1B1B1B]'}`}>
        {value}
      </div>
      {hint && (
        <div className={`text-xs mt-1 ${tone === 'primary' ? 'text-emerald-100/90' : 'text-gray-500'}`}>{hint}</div>
      )}
    </Wrapper>
  );
};

// ---------- Overview ----------

const OverviewTab: React.FC<{ onOpenApplications: () => void }> = ({ onOpenApplications }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => (await api.get('/api/admin/stats/overview')).data as Overview,
  });

  if (error) return <ErrorBox message={errorMessage(error, 'Could not load platform statistics.')} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-white border border-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  const { users, courses, enrollments, activity } = data;
  const chartData = data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Students" value={users.students.toLocaleString()} hint={`+${users.newLast30Days} new users in 30 days`} icon={GraduationCap} tone="primary" />
        <Tile label="Instructors" value={users.instructors.toLocaleString()} hint={`${users.admins} admin${users.admins === 1 ? '' : 's'}`} icon={Briefcase} />
        <Tile
          label="Pending applications"
          value={users.pendingApplications}
          hint={users.pendingApplications ? 'Review now →' : 'All caught up'}
          icon={Clock}
          tone={users.pendingApplications ? 'warn' : 'default'}
          onClick={onOpenApplications}
        />
        <Tile label="Courses" value={courses.total} hint={`${courses.published} published · ${courses.drafts} draft`} icon={BookOpen} />
        <Tile label="Lessons" value={courses.lessons} hint={`${courses.lessonsWithVideo} with video`} icon={PlayCircle} />
        <Tile label="Enrollments" value={enrollments.total.toLocaleString()} hint={`${enrollments.completed} completed (${enrollments.completionRate}%)`} icon={Users} />
        <Tile label="Avg progress" value={`${enrollments.avgProgress}%`} hint="Across all enrollments" icon={TrendingUp} />
        <Tile label="Enrollment value" value={money(enrollments.enrollmentValue)} hint="List price × enrollments (no payments yet)" icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${card} p-6 lg:col-span-2`}>
          <h3 className="font-bold text-base text-[#1B1B1B]">Growth (last 6 months)</h3>
          <p className="text-xs text-gray-500 mb-4">New enrollments and new sign-ups per month</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="enrollments" name="Enrollments" fill="#2D6A4F" radius={[6, 6, 0, 0]} />
                <Bar dataKey="newUsers" name="New users" fill="#95D5B2" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`${card} p-6 space-y-4`}>
          <h3 className="font-bold text-base text-[#1B1B1B]">Learning activity</h3>
          {[
            { icon: ClipboardCheck, label: 'Quiz attempts', value: activity.quizAttempts, hint: `avg score ${activity.avgQuizScore}%` },
            { icon: MessageSquare, label: 'Community posts', value: activity.communityPosts, hint: `${activity.communityReplies} replies` },
            { icon: Award, label: 'Certificates issued', value: activity.certificates, hint: 'Completed courses' },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#B7E4C7]/40 text-[#2D6A4F] flex items-center justify-center shrink-0">
                <row.icon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#1B1B1B]">{row.value.toLocaleString()}</p>
                <p className="text-xs text-gray-500">
                  {row.label} · {row.hint}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------- Courses ----------

type SortKey = 'enrollments' | 'avgProgress' | 'enrollmentValue' | 'title';

const CoursesTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('enrollments');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-course-stats'],
    queryFn: async () => ((await api.get('/api/admin/stats/courses')).data.courses ?? []) as CourseStat[],
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (data ?? []).filter(
      (c) => !q || c.title.toLowerCase().includes(q) || c.instructorName.toLowerCase().includes(q)
    );
    return [...filtered].sort((a, b) =>
      sortKey === 'title' ? a.title.localeCompare(b.title) : (b[sortKey] as number) - (a[sortKey] as number)
    );
  }, [data, query, sortKey]);

  if (error) return <ErrorBox message={errorMessage(error, 'Could not load course statistics.')} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search course or instructor"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#2D6A4F]"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold focus:outline-none focus:border-[#2D6A4F]"
          >
            <option value="enrollments">Enrollments</option>
            <option value="avgProgress">Avg progress</option>
            <option value="enrollmentValue">Enrollment value</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[880px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 bg-[#F8FAF9]">
              <th className="px-4 py-3 font-bold">Course</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold text-right">Lessons</th>
              <th className="px-4 py-3 font-bold text-right">Enrolled</th>
              <th className="px-4 py-3 font-bold">Avg progress</th>
              <th className="px-4 py-3 font-bold text-right">Completed</th>
              <th className="px-4 py-3 font-bold text-right">Value</th>
              <th className="px-4 py-3 font-bold text-right">Rating</th>
              <th className="px-4 py-3 font-bold text-right">Quiz avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={9} className="px-4 py-4">
                    <div className="h-4 rounded bg-gray-100 animate-pulse" />
                  </td>
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                  {query ? 'No courses match your search.' : 'No courses yet.'}
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-[#F8FAF9]/60">
                <td className="px-4 py-3">
                  <Link to={`/course/${c.id}`} className="font-bold text-[#1B1B1B] hover:text-[#2D6A4F] line-clamp-1">
                    {c.title}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {c.instructorName} · {c.category} · {c.price ? money(c.price) : 'Free'}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      c.isPublished ? 'bg-emerald-50 text-[#2D6A4F]' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {c.isPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.lessons}
                  <span className="block text-[11px] text-gray-400">{c.lessonsWithVideo} video</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold">{c.enrollments}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-[#52B788]" style={{ width: `${Math.min(100, c.avgProgress)}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-gray-600">{c.enrollments ? `${c.avgProgress}%` : '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.completed}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(c.enrollmentValue)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.avgRating === null ? <span className="text-gray-400">—</span> : `★ ${c.avgRating}`}
                  {c.reviews > 0 && <span className="block text-[11px] text-gray-400">{c.reviews} reviews</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.avgQuizScore === null ? <span className="text-gray-400">—</span> : `${c.avgQuizScore}%`}
                  {c.quizAttempts > 0 && <span className="block text-[11px] text-gray-400">{c.quizAttempts} attempts</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">
        "Value" is list price × enrollments. There is no payment system yet, so it is not collected revenue.
      </p>
    </div>
  );
};

// ---------- Applications ----------

const ApplicationCard: React.FC<{ app: Application }> = ({ app }) => {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const review = useMutation({
    mutationFn: async (decision: 'approve' | 'reject') => {
      await api.post(
        `/api/admin/instructor-applications/${app.userId}/${decision}`,
        decision === 'reject' ? { note: note.trim() || undefined } : {}
      );
    },
    onSuccess: () => {
      setRejecting(false);
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['admin-applications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
    onError: (err) => setActionError(errorMessage(err, 'Action failed. Please try again.')),
  });

  const statusBadge = {
    pending: 'bg-amber-50 text-amber-700',
    approved: 'bg-emerald-50 text-[#2D6A4F]',
    rejected: 'bg-red-50 text-red-600',
  }[app.status];

  return (
    <div className={`${card} p-5 space-y-4`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h3 className="font-bold text-[#1B1B1B]">{app.name}</h3>
          <p className="text-xs text-gray-500 break-all">{app.email}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-bold px-2.5 py-0.5 rounded-full capitalize ${statusBadge}`}>{app.status}</span>
          <span className="text-gray-400">Applied {new Date(app.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="sm:col-span-2">
          <p className="font-bold text-gray-700 mb-0.5">Subjects</p>
          <p className="text-gray-600">{app.subjects}</p>
        </div>
        <div>
          <p className="font-bold text-gray-700 mb-0.5">Experience</p>
          <p className="text-gray-600">
            {app.experienceYears} year{app.experienceYears === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="text-xs">
        <p className="font-bold text-gray-700 mb-0.5">About</p>
        <p className="text-gray-600 whitespace-pre-line leading-relaxed">{app.bio}</p>
      </div>

      {app.portfolioUrl && (
        <a
          href={app.portfolioUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs font-bold text-[#2D6A4F] hover:underline break-all"
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          {app.portfolioUrl}
        </a>
      )}

      {app.status !== 'pending' && app.reviewNote && (
        <p className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3">
          <span className="font-bold">Review note:</span> {app.reviewNote}
        </p>
      )}

      {app.status === 'pending' && (
        <div className="pt-3 border-t border-gray-100 space-y-3">
          {rejecting && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Optional note to the applicant (they will see it)"
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-red-300"
            />
          )}
          {actionError && <p className="text-xs font-semibold text-red-600">{actionError}</p>}
          <div className="flex flex-wrap gap-2">
            {!rejecting ? (
              <>
                <button
                  onClick={() => {
                    setActionError(null);
                    review.mutate('approve');
                  }}
                  disabled={review.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {review.isPending ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={() => {
                    setActionError(null);
                    setRejecting(true);
                  }}
                  disabled={review.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold disabled:opacity-60"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setActionError(null);
                    review.mutate('reject');
                  }}
                  disabled={review.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-60"
                >
                  <XCircle className="w-4 h-4" />
                  {review.isPending ? 'Rejecting...' : 'Confirm rejection'}
                </button>
                <button
                  onClick={() => setRejecting(false)}
                  disabled={review.isPending}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-[#F8FAF9] text-xs font-bold"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ApplicationsTab: React.FC = () => {
  const [status, setStatus] = useState<ApplicationStatus | 'all'>('pending');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-applications', status],
    queryFn: async () =>
      ((await api.get('/api/admin/instructor-applications', { params: { status } })).data.applications ??
        []) as Application[],
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize border transition-colors ${
              status === s ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-gray-600 border-gray-200 hover:bg-[#F8FAF9]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorBox message={errorMessage(error, 'Could not load applications.')} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-white border border-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className={`${card} p-10 text-center`}>
          <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {status === 'pending' ? 'No applications waiting for review.' : `No ${status === 'all' ? '' : status + ' '}applications.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {(data ?? []).map((app) => (
            <ApplicationCard key={app.userId} app={app} />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------- Page ----------

export const AdminDashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab = tabParam === 'courses' || tabParam === 'applications' ? tabParam : 'overview';
  const setTab = (t: Tab) => setSearchParams(t === 'overview' ? {} : { tab: t }, { replace: true });

  // Shares the overview cache, so the pending badge costs no extra request.
  const { data: overview } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => (await api.get('/api/admin/stats/overview')).data as Overview,
  });
  const pending = overview?.users.pendingApplications ?? 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'courses', label: 'Courses' },
    { id: 'applications', label: 'Instructor applications' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAF9]">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/admin" className="flex items-center gap-2.5 shrink-0">
            <img src="/favicon.png" alt="Nudra" className="h-9 w-9 object-contain" />
            <div className="leading-tight">
              <p className="font-black text-[#1B1B1B] text-sm">Nudra Admin</p>
              <p className="text-[11px] text-gray-500">Platform console</p>
            </div>
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden sm:block text-xs text-gray-500 truncate">{user?.email}</span>
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9]"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? 'border-[#2D6A4F] text-[#2D6A4F]' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
              {t.id === 'applications' && pending > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
                  {pending}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {tab === 'overview' && <OverviewTab onOpenApplications={() => setTab('applications')} />}
        {tab === 'courses' && <CoursesTab />}
        {tab === 'applications' && <ApplicationsTab />}
      </main>
    </div>
  );
};
