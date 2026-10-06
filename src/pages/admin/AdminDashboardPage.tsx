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
  enrollments: { total: number; completed: number; completionRate: number; avgProgress: number; revenue: number; paidOrders: number };
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
  revenue: number;
  paidOrders: number;
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

type Tab = 'overview' | 'courses' | 'catalog' | 'applications' | 'account';

type CatalogTrack = 'general' | 'school' | 'university';
type CatalogKind =
  | 'general_field' | 'specialization' | 'curriculum' | 'stage' | 'qualification'
  | 'grade' | 'subject' | 'syllabus_version' | 'university' | 'faculty' | 'program' | 'module';

interface CatalogItem {
  id: string;
  track: CatalogTrack;
  kind: CatalogKind;
  parentId: string | null;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  displayOrder: number;
  isVisible: boolean;
  provenance: string;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
}

interface CatalogCourse {
  id: string;
  title: string;
  titleAr: string | null;
  category: string;
  level: string;
  isPublished: boolean;
  sanaweyaGrade: string | null;
  sanaweyaSubject: string | null;
}

const catalogKinds: Record<CatalogTrack, { kind: CatalogKind; label: string; parent: CatalogKind | null }[]> = {
  general: [
    { kind: 'general_field', label: 'Field', parent: null },
    { kind: 'specialization', label: 'Specialization', parent: 'general_field' },
  ],
  school: [
    { kind: 'curriculum', label: 'Curriculum', parent: null },
    { kind: 'stage', label: 'Stage', parent: 'curriculum' },
    { kind: 'qualification', label: 'Qualification', parent: 'stage' },
    { kind: 'grade', label: 'Grade', parent: 'qualification' },
    { kind: 'subject', label: 'Subject', parent: 'grade' },
    { kind: 'syllabus_version', label: 'Syllabus version', parent: 'subject' },
  ],
  university: [
    { kind: 'university', label: 'University', parent: null },
    { kind: 'faculty', label: 'Faculty', parent: 'university' },
    { kind: 'program', label: 'Program', parent: 'faculty' },
    { kind: 'module', label: 'Module', parent: 'program' },
  ],
};

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
        <Tile label="Revenue" value={money(enrollments.revenue)} hint={`${enrollments.paidOrders} paid order${enrollments.paidOrders === 1 ? '' : 's'}`} icon={Wallet} />
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

type SortKey = 'enrollments' | 'avgProgress' | 'revenue' | 'title';

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
            <option value="revenue">Revenue</option>
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
              <th className="px-4 py-3 font-bold text-right">Revenue</th>
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
                <td className="px-4 py-3 text-right tabular-nums">{money(c.revenue)}</td>
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
        "Revenue" is the total of paid orders. While payments run in test mode, it includes test and demo
        payments, not real money.
      </p>
    </div>
  );
};

// ---------- Academic catalog ----------

const CatalogTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [track, setTrack] = useState<CatalogTrack>('general');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLeafId, setSelectedLeafId] = useState('');
  const [courseItemIds, setCourseItemIds] = useState<string[]>([]);
  const [courseMessage, setCourseMessage] = useState('');
  const [form, setForm] = useState({
    track: 'general' as CatalogTrack, kind: 'general_field' as CatalogKind, parentId: '', slug: '',
    nameEn: '', nameAr: '', description: '', displayOrder: '0', isVisible: true, provenance: 'admin', metadata: '{}',
  });
  const itemsQuery = useQuery({
    queryKey: ['admin-catalog-items'],
    queryFn: async () => ((await api.get('/api/admin/catalog/items')).data.items ?? []) as CatalogItem[],
  });
  const coursesQuery = useQuery({
    queryKey: ['admin-catalog-courses'],
    queryFn: async () => ((await api.get('/api/admin/catalog/courses')).data.courses ?? []) as CatalogCourse[],
  });
  const allItems = (itemsQuery.data ?? []).filter((item) => !item.archivedAt);
  const items = allItems.filter((item) => item.track === track);
  const treeOptions = useMemo(() => {
    const byParent = new Map<string | null, CatalogItem[]>();
    for (const item of items) byParent.set(item.parentId, [...(byParent.get(item.parentId) ?? []), item]);
    const ordered: { item: CatalogItem; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const item of (byParent.get(parentId) ?? []).sort((a, b) => a.displayOrder - b.displayOrder || a.nameEn.localeCompare(b.nameEn))) {
        ordered.push({ item, depth });
        walk(item.id, depth + 1);
      }
    };
    walk(null, 0);
    return ordered;
  }, [items]);
  const selectedCourse = (coursesQuery.data ?? []).find((course) => course.id === selectedCourseId);
  const associationQuery = useQuery({
    queryKey: ['admin-course-catalog-items', selectedCourseId],
    enabled: Boolean(selectedCourseId),
    queryFn: async () => (await api.get(`/api/admin/catalog/courses/${selectedCourseId}`)).data as { courseId: string; catalogItemIds: string[] },
  });
  React.useEffect(() => {
    setCourseItemIds(associationQuery.data?.catalogItemIds ?? []);
    setSelectedLeafId('');
  }, [associationQuery.data]);

  const resetForm = (nextTrack: CatalogTrack = track, item?: CatalogItem) => {
    const kind = item?.kind ?? catalogKinds[nextTrack][0].kind;
    setEditing(item ?? null);
    setForm({
      track: item?.track ?? nextTrack, kind, parentId: item?.parentId ?? '', slug: item?.slug ?? '',
      nameEn: item?.nameEn ?? '', nameAr: item?.nameAr ?? '', description: item?.description ?? '',
      displayOrder: String(item?.displayOrder ?? 0), isVisible: item?.isVisible ?? true,
      provenance: item?.provenance ?? 'admin', metadata: JSON.stringify(item?.metadata ?? {}, null, 2),
    });
    setFormError('');
    setFormOpen(true);
  };
  const refreshItems = () => queryClient.invalidateQueries({ queryKey: ['admin-catalog-items'] });
  const saveItem = useMutation({
    mutationFn: async () => {
      let metadata: Record<string, unknown>;
      try {
        metadata = JSON.parse(form.metadata || '{}');
        if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') throw new Error();
      } catch {
        throw new Error('Metadata must be a valid JSON object.');
      }
      const selectedKind = catalogKinds[form.track].find((entry) => entry.kind === form.kind);
      if (!selectedKind) throw new Error('Choose a valid kind for this track.');
      if (selectedKind.parent && !form.parentId) throw new Error('Choose a parent for this item.');
      if (!selectedKind.parent && form.parentId) throw new Error('Root items cannot have a parent.');
      const payload = {
        track: form.track, kind: form.kind, parentId: form.parentId || null, slug: form.slug.trim(),
        nameEn: form.nameEn.trim(), nameAr: form.nameAr.trim() || null,
        description: form.description.trim() || null, displayOrder: Number(form.displayOrder),
        isVisible: form.isVisible, provenance: form.provenance.trim() || 'admin', metadata,
      };
      if (!payload.slug || !payload.nameEn || !Number.isInteger(payload.displayOrder) || payload.displayOrder < 0) {
        throw new Error('Enter a slug, English name, and a non-negative whole-number display order.');
      }
      if (editing) return (await api.patch(`/api/admin/catalog/items/${editing.id}`, payload)).data.item as CatalogItem;
      return (await api.post('/api/admin/catalog/items', payload)).data.item as CatalogItem;
    },
    onSuccess: () => {
      setFormOpen(false);
      setNotice(editing ? 'Catalog item updated.' : 'Catalog item created.');
      refreshItems();
    },
    onError: (error) => setFormError(errorMessage(error, (error as Error).message || 'Could not save catalog item.')),
  });
  const archiveItem = useMutation({
    mutationFn: async (item: CatalogItem) => (await api.delete(`/api/admin/catalog/items/${item.id}`)).data as { archived: number },
    onSuccess: (result) => {
      setNotice(`Archived ${result.archived} catalog item${result.archived === 1 ? '' : 's'}, including descendants.`);
      refreshItems();
    },
    onError: (error) => setNotice(errorMessage(error, 'Could not archive catalog item.')),
  });
  const importCatalog = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try { parsed = JSON.parse(importText); } catch { throw new Error('Enter valid JSON.'); }
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { items?: unknown }).items)) {
        throw new Error('Import JSON must have an items array.');
      }
      return (await api.post('/api/admin/catalog/import', parsed)).data as { imported: number };
    },
    onSuccess: (result) => {
      setNotice(`Imported ${result.imported} catalog item${result.imported === 1 ? '' : 's'}.`);
      setShowImport(false);
      refreshItems();
    },
    onError: (error) => setNotice(errorMessage(error, (error as Error).message || 'Could not import catalog.')),
  });
  const saveCourseClassification = useMutation({
    mutationFn: async () => (await api.put(`/api/admin/catalog/courses/${selectedCourseId}`, { catalogItemIds: courseItemIds })).data as { catalogItemIds: string[] },
    onSuccess: (result) => {
      setCourseItemIds(result.catalogItemIds);
      setCourseMessage('Course classification saved.');
      queryClient.invalidateQueries({ queryKey: ['admin-course-catalog-items', selectedCourseId] });
    },
    onError: (error) => setCourseMessage(errorMessage(error, 'Could not save course classification.')),
  });
  const leafPath = useMemo(() => {
    const path: CatalogItem[] = [];
    let cursor = items.find((item) => item.id === selectedLeafId);
    while (cursor) {
      path.unshift(cursor);
      cursor = cursor.parentId ? allItems.find((item) => item.id === cursor?.parentId) : undefined;
    }
    return path;
  }, [allItems, items, selectedLeafId]);
  const kindEntry = catalogKinds[form.track].find((entry) => entry.kind === form.kind);
  const parentOptions = items.filter((item) => item.track === form.track && item.kind === kindEntry?.parent && item.id !== editing?.id);

  return (
    <div className="space-y-6">
      <div className={`${card} p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4`}>
        <div>
          <h2 className="font-bold text-lg text-[#1B1B1B]">Academic catalog</h2>
          <p className="text-sm text-gray-500 mt-1">Manage general courses, school tracks, university hierarchies, and global course classifications.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowImport((value) => !value)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">Import JSON</button>
          <button onClick={() => resetForm()} className="px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold hover:bg-[#23533e]">Add catalog item</button>
        </div>
      </div>
      {notice && <p role="status" className="text-sm font-semibold text-[#2D6A4F]">{notice}</p>}

      {showImport && <div className={`${card} p-5 space-y-3`}>
        <div><h3 className="font-bold text-[#1B1B1B]">Batch import</h3><p className="text-xs text-gray-500 mt-1">Provide <code>{'{ "items": [...] }'}</code>. List parents before children, or use parentSlug. Up to 1,000 items.</p></div>
        <textarea rows={8} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={'{\n  "items": [\n    {"track":"university","kind":"university","slug":"example","nameEn":"Example University"}\n  ]\n}'} className="w-full font-mono text-xs p-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#2D6A4F]" />
        <div className="flex items-center gap-3"><button disabled={importCatalog.isPending} onClick={() => importCatalog.mutate()} className="px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold disabled:opacity-60">{importCatalog.isPending ? 'Importing…' : 'Import items'}</button><button onClick={() => setShowImport(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold">Cancel</button></div>
      </div>}

      {formOpen && <form onSubmit={(event) => { event.preventDefault(); setFormError(''); saveItem.mutate(); }} className={`${card} p-5 space-y-4`}>
        <div className="flex items-center justify-between"><h3 className="font-bold text-[#1B1B1B]">{editing ? 'Edit catalog item' : 'New catalog item'}</h3><button type="button" onClick={() => setFormOpen(false)} className="text-sm text-gray-500">Close</button></div>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-xs font-bold text-gray-600">Track<select disabled={Boolean(editing)} value={form.track} onChange={(event) => { const next = event.target.value as CatalogTrack; setForm((old) => ({ ...old, track: next, kind: catalogKinds[next][0].kind, parentId: '' })); }} className="mt-1 w-full px-3 py-2.5 border rounded-xl bg-white disabled:bg-gray-50"><option value="general">General</option><option value="school">School</option><option value="university">University</option></select></label>
          <label className="text-xs font-bold text-gray-600">Kind<select disabled={Boolean(editing)} value={form.kind} onChange={(event) => setForm((old) => ({ ...old, kind: event.target.value as CatalogKind, parentId: '' }))} className="mt-1 w-full px-3 py-2.5 border rounded-xl bg-white disabled:bg-gray-50">{catalogKinds[form.track].map((entry) => <option key={entry.kind} value={entry.kind}>{entry.label}</option>)}</select></label>
          <label className="text-xs font-bold text-gray-600">Parent{kindEntry?.parent ? ` (${kindEntry.parent.replaceAll('_', ' ')})` : ' (root)'}<select disabled={!kindEntry?.parent} required={Boolean(kindEntry?.parent)} value={form.parentId} onChange={(event) => setForm((old) => ({ ...old, parentId: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border rounded-xl bg-white disabled:bg-gray-50"><option value="">{kindEntry?.parent ? 'Choose parent' : 'No parent'}</option>{parentOptions.map((item) => <option key={item.id} value={item.id}>{item.nameEn}</option>)}</select></label>
          <label className="text-xs font-bold text-gray-600">Slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={160} value={form.slug} onChange={(event) => setForm((old) => ({ ...old, slug: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border rounded-xl" /></label>
          <label className="text-xs font-bold text-gray-600">English name<input required maxLength={255} value={form.nameEn} onChange={(event) => setForm((old) => ({ ...old, nameEn: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border rounded-xl" /></label>
          <label className="text-xs font-bold text-gray-600">Arabic name<input maxLength={255} value={form.nameAr} onChange={(event) => setForm((old) => ({ ...old, nameAr: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border rounded-xl" /></label>
          <label className="text-xs font-bold text-gray-600">Display order<input type="number" min={0} max={100000} step={1} value={form.displayOrder} onChange={(event) => setForm((old) => ({ ...old, displayOrder: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border rounded-xl" /></label>
          <label className="text-xs font-bold text-gray-600">Provenance<input maxLength={80} value={form.provenance} onChange={(event) => setForm((old) => ({ ...old, provenance: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border rounded-xl" /></label>
        </div>
        <label className="block text-xs font-bold text-gray-600">Description<textarea rows={3} maxLength={10000} value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border rounded-xl" /></label>
        <label className="block text-xs font-bold text-gray-600">Metadata (JSON object)<textarea rows={3} value={form.metadata} onChange={(event) => setForm((old) => ({ ...old, metadata: event.target.value }))} className="mt-1 w-full font-mono text-xs px-3 py-2.5 border rounded-xl" /></label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isVisible} onChange={(event) => setForm((old) => ({ ...old, isVisible: event.target.checked }))} />Visible to learners</label>
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <button disabled={saveItem.isPending} className="px-5 py-2.5 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold disabled:opacity-60">{saveItem.isPending ? 'Saving…' : 'Save item'}</button>
      </form>}

      <section className={`${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-[#1B1B1B]">Catalog structure</h3><p className="text-xs text-gray-500">Archived nodes are hidden from the active hierarchy.</p></div><select value={track} onChange={(event) => setTrack(event.target.value as CatalogTrack)} className="px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm"><option value="general">General</option><option value="school">School</option><option value="university">University</option></select></div>
        {itemsQuery.error ? <ErrorBox message={errorMessage(itemsQuery.error, 'Could not load catalog items.')} onRetry={() => itemsQuery.refetch()} /> : itemsQuery.isLoading ? <p className="text-sm text-gray-500">Loading catalog…</p> : treeOptions.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">No items in this track yet.</p> : <div className="divide-y divide-gray-100">{treeOptions.map(({ item, depth }) => <div key={item.id} className="py-3 flex items-center gap-3" style={{ paddingLeft: `${Math.min(depth, 6) * 20}px` }}><div className="min-w-0 flex-1"><p className="font-semibold text-sm text-gray-800">{item.nameEn}{item.nameAr ? <span className="text-gray-400 font-normal"> · {item.nameAr}</span> : null}</p><p className="text-[11px] text-gray-500">{item.kind.replaceAll('_', ' ')} · {item.slug}{item.isVisible ? '' : ' · hidden'}</p></div><button onClick={() => resetForm(track, item)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold">Edit</button><button onClick={() => { if (window.confirm(`Archive “${item.nameEn}” and all its descendants?`)) archiveItem.mutate(item); }} disabled={archiveItem.isPending} className="px-3 py-1.5 rounded-lg border border-red-100 text-red-600 text-xs font-bold">Archive</button></div>)}</div>}
      </section>

      <section className={`${card} p-5 space-y-4`}>
        <div><h3 className="font-bold text-[#1B1B1B]">Classify a global course</h3><p className="text-xs text-gray-500 mt-1">Choose one path through a single catalog track, then select the path levels to associate with the course.</p></div>
        {coursesQuery.error ? <ErrorBox message={errorMessage(coursesQuery.error, 'Could not load courses.')} onRetry={() => coursesQuery.refetch()} /> : <div className="grid md:grid-cols-2 gap-3">
          <label className="text-xs font-bold text-gray-600">Global course<select value={selectedCourseId} onChange={(event) => { setSelectedCourseId(event.target.value); setCourseMessage(''); }} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white"><option value="">Select course</option>{(coursesQuery.data ?? []).map((course) => <option key={course.id} value={course.id}>{course.title}{course.isPublished ? '' : ' · Draft'}</option>)}</select></label>
          <label className="text-xs font-bold text-gray-600">Catalog leaf<select value={selectedLeafId} onChange={(event) => { setSelectedLeafId(event.target.value); setCourseItemIds([]); setCourseMessage(''); }} disabled={!selectedCourseId || associationQuery.isLoading} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white disabled:bg-gray-50"><option value="">Choose a node</option>{treeOptions.map(({ item, depth }) => <option key={item.id} value={item.id}>{'— '.repeat(depth)}{item.nameEn} ({item.kind.replaceAll('_', ' ')})</option>)}</select></label>
        </div>}
        {selectedCourse && associationQuery.isError && <ErrorBox message={errorMessage(associationQuery.error, 'Could not load existing course classifications.')} onRetry={() => associationQuery.refetch()} />}
        {selectedCourse && selectedLeafId && <div className="space-y-2"><p className="text-xs font-bold text-gray-600">Select classification levels along this path:</p><div className="flex flex-wrap gap-2">{leafPath.map((item) => <label key={item.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs"><input type="checkbox" checked={courseItemIds.includes(item.id)} onChange={(event) => setCourseItemIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />{item.nameEn}</label>)}</div><div className="flex items-center gap-3"><button disabled={saveCourseClassification.isPending || associationQuery.isLoading} onClick={() => saveCourseClassification.mutate()} className="px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold disabled:opacity-60">{saveCourseClassification.isPending ? 'Saving…' : 'Save classification'}</button>{courseMessage && <p role="status" className="text-xs text-gray-600">{courseMessage}</p>}</div></div>}
      </section>
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

// ---------- Account ----------

const AccountTab: React.FC = () => {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const change = useMutation({
    mutationFn: async () =>
      (await api.put('/api/auth/password', { currentPassword, newPassword })).data as { message: string },
    onSuccess: (data) => {
      setMessage({ type: 'ok', text: data.message });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err) => setMessage({ type: 'err', text: errorMessage(err, 'Could not change password.') }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'err', text: 'The new passwords do not match.' });
      return;
    }
    setMessage(null);
    change.mutate();
  };

  const input =
    'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#2D6A4F]';

  return (
    <div className="max-w-lg space-y-4">
      <div className={`${card} p-6`}>
        <h3 className="font-bold text-base text-[#1B1B1B]">Admin account</h3>
        <p className="text-sm text-gray-600 mt-1">{user?.name}</p>
        <p className="text-xs text-gray-500 break-all">{user?.email}</p>
      </div>

      <form onSubmit={submit} className={`${card} p-6 space-y-4`}>
        <div>
          <h3 className="font-bold text-base text-[#1B1B1B]">Change password</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            At least 8 characters with upper and lower case letters and a number. All your other sessions are
            signed out.
          </p>
        </div>
        <label className="block text-xs font-bold text-gray-700">
          Current password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={`${input} mt-1.5`}
          />
        </label>
        <label className="block text-xs font-bold text-gray-700">
          New password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={`${input} mt-1.5`}
          />
        </label>
        <label className="block text-xs font-bold text-gray-700">
          Confirm new password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`${input} mt-1.5`}
          />
        </label>
        {message && (
          <p className={`text-xs font-semibold ${message.type === 'ok' ? 'text-[#2D6A4F]' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={change.isPending}
          className="px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-sm font-bold disabled:opacity-60"
        >
          {change.isPending ? 'Saving...' : 'Update password'}
        </button>
      </form>
    </div>
  );
};

// ---------- Page ----------

export const AdminDashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab =
    tabParam === 'courses' || tabParam === 'catalog' || tabParam === 'applications' || tabParam === 'account' ? tabParam : 'overview';
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
    { id: 'catalog', label: 'Academic catalog' },
    { id: 'applications', label: 'Instructor applications' },
    { id: 'account', label: 'Account' },
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
          <Link to="/admin/organizations" className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 border-transparent whitespace-nowrap text-gray-500 hover:text-gray-800">Organizations</Link>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {tab === 'overview' && <OverviewTab onOpenApplications={() => setTab('applications')} />}
        {tab === 'courses' && <CoursesTab />}
        {tab === 'catalog' && <CatalogTab />}
        {tab === 'applications' && <ApplicationsTab />}
        {tab === 'account' && <AccountTab />}
      </main>
    </div>
  );
};
