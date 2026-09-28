import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCap,
  BookOpen,
  Calculator,
  Languages,
  Atom,
  FlaskConical,
  Leaf,
  Scroll,
  Globe2,
  FileText,
  ArrowLeft,
  Pencil,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatCard } from '../components/StatCard';
import { useSanaweyaProfile } from '../hooks/useSanaweyaProfile';
import { useSanaweyaDashboard } from '../hooks/useSanaweyaDashboard';

const GRADE_OPTIONS = [
  { value: 'year1', label: 'First Year' },
  { value: 'year2', label: 'Second Year' },
  { value: 'year3', label: 'Third Year' },
];

const GRADE_LABELS: Record<string, string> = {
  year1: 'First Year Secondary',
  year2: 'Second Year Secondary',
  year3: 'Third Year Secondary',
};

const SUBJECT_ICONS: Record<string, React.ElementType> = {
  'الرياضيات': Calculator,
  'اللغة العربية': BookOpen,
  'اللغة الإنجليزية': Languages,
  'الفيزياء': Atom,
  'الكيمياء': FlaskConical,
  'الأحياء': Leaf,
  'التاريخ': Scroll,
  'الجغرافيا': Globe2,
};

const SUBJECT_LABELS: Record<string, string> = {
  'الرياضيات': 'Mathematics',
  'اللغة العربية': 'Arabic Language',
  'اللغة الإنجليزية': 'English Language',
  'الفيزياء': 'Physics',
  'الكيمياء': 'Chemistry',
  'الأحياء': 'Biology',
  'التاريخ': 'History',
  'الجغرافيا': 'Geography',
};

interface SanaweyaProfile {
  id: string;
  grade: string;
  track: string | null;
  schoolName: string | null;
  governorate: string | null;
}

interface DashboardCourse {
  id: string;
  title: string;
  thumbnail: string | null;
  category: string;
  price: number;
  progress: number;
  instructor: { name: string; avatar: string | null };
}

interface Community {
  id: string;
  subject: string;
  grade: string;
  postCount: number;
}

interface RecentExam {
  attemptId: string;
  exam: { id: string; title: string; subject: string; year: number; session: string; answerKeyUrl: string | null };
}

export const SanaweyaPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSavingGrade, setIsSavingGrade] = useState(false);

  const { profile: profileData, isLoading: profileLoading } = useSanaweyaProfile();

  const { dashboard, isLoading: dashboardLoading } = useSanaweyaDashboard() as {
    dashboard: {
      profile: SanaweyaProfile | null;
      enrolledSanaweyaCourses: DashboardCourse[];
      recentExams: RecentExam[];
      subjectCommunities: Community[];
      upcomingExamCount: number;
    } | null;
    isLoading: boolean;
  };

  const profile = dashboard?.profile ?? profileData ?? null;
  const enrolledCourses = dashboard?.enrolledSanaweyaCourses ?? [];
  const communities = dashboard?.subjectCommunities ?? [];
  const recentExams = dashboard?.recentExams ?? [];
  const upcomingExamCount = dashboard?.upcomingExamCount ?? 0;

  const avgProgress = enrolledCourses.length
    ? Math.round(enrolledCourses.reduce((acc, c) => acc + (c.progress | 0), 0) / enrolledCourses.length)
    : 0;

  const handleSetGrade = async (grade: string) => {
    setIsSavingGrade(true);
    try {
      await api.post('/api/sanaweya/profile', { grade });
      await queryClient.invalidateQueries({ queryKey: ['sanaweya-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['sanaweya-dashboard'] });
    } finally {
      setIsSavingGrade(false);
    }
  };

  const isLoading = profileLoading ? true : dashboardLoading;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-[#2D6A4F]" />
            General Secondary
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            An integrated platform for secondary school students — courses, exams, and study communities
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm animate-pulse h-24" />
      ) : !profile ? (
        <div className="rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-[#2D6A4F] to-[#52B788] text-white shadow-sm">
          <h2 className="text-xl sm:text-2xl font-extrabold mb-2">Customize your learning experience</h2>
          <p className="text-sm text-white/90 mb-6">Choose your grade so we can show you the right content</p>
          <div className="flex flex-wrap gap-3">
            {GRADE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                disabled={isSavingGrade}
                onClick={() => handleSetGrade(opt.value)}
                className="px-5 py-2.5 rounded-xl bg-white text-[#2D6A4F] text-sm font-bold shadow-sm hover:bg-white/90 transition-colors disabled:opacity-60"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#B7E4C7]/40 text-[#2D6A4F] text-sm font-bold">
            <GraduationCap className="w-4 h-4" />
            {GRADE_LABELS[profile.grade] ?? profile.grade}
          </span>
          <button
            onClick={() => {
              queryClient.setQueryData(['sanaweya-profile'], null);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#2D6A4F] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Enrolled Courses" value={enrolledCourses.length} isPrimary icon={BookOpen} />
        <StatCard title="Past Exams" value={upcomingExamCount} icon={FileText} />
        <StatCard title="Active Communities" value={communities.length} icon={GraduationCap} />
        <StatCard title="Total Progress" value={`${avgProgress}%`} icon={Calculator} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-[#1B1B1B]">My Courses</h2>
          <Link to="/sanaweya/courses" className="text-xs font-bold text-[#2D6A4F] hover:underline flex items-center gap-1">
            Browse more
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
        {enrolledCourses.length === 0 ? (
          <div className="rounded-2xl p-8 bg-white border border-gray-100 text-center shadow-sm">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">You have not enrolled in any course yet</p>
            <Link
              to="/sanaweya/courses"
              className="inline-flex px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold shadow-sm transition-all"
            >
              Browse secondary courses
            </Link>
          </div>
        ) : (
          <div className="flex gap-5 overflow-x-auto pb-2">
            {enrolledCourses.map((course) => (
              <Link
                key={course.id}
                to={`/course/${course.id}`}
                className="min-w-[260px] max-w-[280px] rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all"
              >
                <div className="aspect-video w-full overflow-hidden bg-gray-100">
                  <img src={course.thumbnail ?? undefined} alt={course.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-4 space-y-2">
                  <h3 className="font-bold text-sm text-[#1B1B1B] line-clamp-2">{course.title}</h3>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-[#52B788]" style={{ width: `${course.progress}%` }} />
                  </div>
                  <p className="text-[11px] text-gray-500">{course.progress}% complete</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-extrabold text-[#1B1B1B] mb-4">Subject Communities</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {communities.map((community) => {
            const Icon = SUBJECT_ICONS[community.subject] ?? BookOpen;
            return (
              <button
                key={community.id}
                onClick={() =>
                  navigate(`/community?subject=${encodeURIComponent(community.subject)}&grade=${community.grade}`)
                }
                className="rounded-2xl p-5 bg-[#F0FFF4] border border-[#B7E4C7] text-right hover:shadow-md transition-all"
              >
                <Icon className="w-7 h-7 text-[#2D6A4F] mb-3" />
                <p className="font-bold text-sm text-[#1B1B1B] mb-1">{SUBJECT_LABELS[community.subject] ?? community.subject}</p>
                <p className="text-[11px] text-[#2D6A4F] font-semibold">{community.postCount} discussions</p>
              </button>
            );
          })}
          {communities.length === 0 && (
            <div className="col-span-full rounded-2xl p-8 bg-white border border-gray-100 text-center text-sm text-gray-500">
              Choose your grade to view subject communities
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-[#1B1B1B]">Past Exams Bank</h2>
          <Link to="/sanaweya/exams" className="text-xs font-bold text-[#2D6A4F] hover:underline flex items-center gap-1">
            View all
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recentExams.map((item) => (
            <div key={item.attemptId} className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-[#1B1B1B]">{item.exam.title}</h3>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] font-bold bg-[#B7E4C7]/40 text-[#2D6A4F] px-2 py-0.5 rounded-full">
                  {SUBJECT_LABELS[item.exam.subject] ?? item.exam.subject}
                </span>
                <span className="text-[11px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {item.exam.year}
                </span>
                <span className="text-[11px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {item.exam.session === 'first' ? 'First Session' : 'Second Session'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/sanaweya/exams/${item.exam.id}`)}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold transition-colors"
                >
                  Open Exam
                </button>
                <button
                  disabled={!item.exam.answerKeyUrl}
                  className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold disabled:opacity-50"
                >
                  Answer Key
                </button>
              </div>
            </div>
          ))}
          {recentExams.length === 0 && (
            <div className="col-span-full rounded-2xl p-8 bg-white border border-gray-100 text-center text-sm text-gray-500">
              You have not opened any exam yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
