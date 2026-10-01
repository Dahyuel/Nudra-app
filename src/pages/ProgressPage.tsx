import React, { useState } from 'react';
import {
  Award,
  Flame,
  CheckCircle2,
  Lock,
  Download,
  ExternalLink,
  Sparkles,
  BookOpen,
  Calendar,
  Clock,
  TrendingUp,
  FileText,
  X
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { PageErrorBanner } from '../components/PageErrorBanner';
import { WeakTopicsCard } from '../components/WeakTopicsCard';
import { useProgressStats } from '../hooks/useProgressStats';
import { useCertificates } from '../hooks/useCertificates';
import { withErrorBoundary } from '../components/withErrorBoundary';

const BADGE_ICONS: Record<string, any> = {
  BookOpen,
  Flame,
  Award,
  Sparkles,
  CheckCircle2,
  Trophy: Award,
};

const ProgressPageInner: React.FC = () => {
  const { user } = useAuth();
  const { stats, isLoading, error: statsError } = useProgressStats();
  const { certificates, isLoading: certsLoading, error: certsError } = useCertificates();
  const [selectedCert, setSelectedCert] = useState<any | null>(null);

  const weeklyHoursData = stats?.weeklyHours ?? [];
  const subjectBreakdown = stats?.subjectBreakdown ?? [];
  const badges = stats?.badges ?? [];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <PageErrorBanner errors={[statsError, certsError]} />
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
            Learning Progress & Analytics
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Weekly study velocity, subject breakdowns, badge achievements, and certified diplomas
          </p>
        </div>

        {isLoading ? (
          <div className="self-start sm:self-auto h-9 w-40 bg-gray-200/70 rounded-xl animate-pulse" />
        ) : (
        <div className="flex items-center gap-2 self-start sm:self-auto bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-2xs text-xs font-bold text-gray-700">
          <Calendar className="w-4 h-4 text-[#2D6A4F]" />
          <span>Active Streak: {stats?.streak ?? 0} Days 🔥</span>
        </div>
        )}
      </div>

      {/* 1. Analytics Row: Weekly Study Hours Bar Chart + Subject Breakdown Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Study Hours Bar Chart */}
        <div className="lg:col-span-7 rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-base text-[#1B1B1B]">
                Weekly Study Velocity (Hours)
              </h3>
              <p className="text-xs text-[#6B7280]">
                Daily focus time logged across video lectures and AI Tutor drills
              </p>
            </div>
            <span className="text-xs font-bold text-[#2D6A4F] bg-emerald-50 px-2.5 py-1 rounded-lg">
              Total: {stats?.totalHoursThisWeek ?? 0} hrs
            </span>
          </div>

          <div className="h-64 w-full pt-4">
            {isLoading ? (
              <div className="h-full flex items-end justify-around gap-3 px-4 pb-6">
                {[40, 65, 85, 55, 95, 35, 70].map((h, i) => (
                  <div key={i} className="w-8 bg-gray-200/70 rounded-t-lg animate-pulse" style={{ height: `${h}%` }} />
                ))}
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyHoursData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  unit="h"
                />
                <Tooltip
                  formatter={(val: any) => [`${val} hours`, 'Study Time']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                />
                <Bar dataKey="hours" radius={[8, 8, 0, 0]} fill="#2D6A4F">
                  {weeklyHoursData.map((entry, index) => (
                    <Cell
                      key={`bar-${index}`}
                      fill={entry.hours >= 5 ? '#2D6A4F' : '#52B788'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Subject Breakdown Donut / Pie Chart */}
        <div className="lg:col-span-5 rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-base text-[#1B1B1B]">Subject Focus Distribution</h3>
              <p className="text-xs text-[#6B7280]">Percentage of study time by curriculum topic</p>
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {subjectBreakdown.length === 0 ? (
              <p className="text-sm text-gray-400 text-center px-6">
                Enroll in courses to see your subject breakdown
              </p>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={subjectBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {subjectBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [`${val}% of study time`, 'Time Spent']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            )}
          </div>

          {/* Legend chips */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100 text-xs">
            {subjectBreakdown.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-gray-700 font-semibold">{item.name}</span>
                <span className="font-bold text-gray-900 ml-auto">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI weak-topic analysis from the student's quiz results */}
      <WeakTopicsCard />

      {/* 2. Achievements Section: Badge Grid (with locked badges grayed out) */}
      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-base text-[#1B1B1B] flex items-center gap-2">
              <Award className="w-5 h-5 text-[#2D6A4F]" />
              <span>Earned Achievements & Mastery Badges</span>
            </h3>
            <p className="text-xs text-[#6B7280]">
              Unlock badges as you complete quizzes, maintain study streaks, and assist classmates
            </p>
          </div>
          <span className="text-xs font-bold text-[#2D6A4F] bg-emerald-50 px-2.5 py-1 rounded-full">
            {stats?.unlockedBadgeCount ?? 0} / {stats?.totalBadgeCount ?? 6} Unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge) => {
            const Icon = BADGE_ICONS[badge.icon] ?? BookOpen;

            return (
              <div
                key={badge.key}
                className={`p-5 rounded-2xl border transition-all flex items-start gap-4 ${
                  badge.isUnlocked
                    ? 'bg-white border-gray-200/80 shadow-2xs hover:shadow-sm'
                    : 'bg-gray-50/70 border-dashed border-gray-300 opacity-60 grayscale'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${badge.isUnlocked ? badge.badgeColorClass : 'bg-gray-100 text-gray-400 border-gray-200'}`}
                >
                  {badge.isUnlocked ? (
                    <Icon className="w-6 h-6" />
                  ) : (
                    <Lock className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-bold text-sm text-gray-900 truncate">{badge.title}</h4>
                    {badge.isUnlocked ? (
                      <CheckCircle2 className="w-4 h-4 text-[#2D6A4F] shrink-0" />
                    ) : (
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Locked
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-snug">{badge.subtitle}</p>
                  <span className="inline-block text-[11px] font-semibold text-gray-400 mt-2">
                    {badge.isUnlocked && badge.unlockedAt
                      ? new Date(badge.unlockedAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
                      : badge.progressText ?? 'Locked'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Certificates Earned Section */}
      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-base text-[#1B1B1B] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#2D6A4F]" />
              <span>Accredited Course Certificates</span>
            </h3>
            <p className="text-xs text-[#6B7280]">
              Official verifiable diplomas issued upon 100% curriculum and quiz completion
            </p>
          </div>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full">
            {certificates?.length ?? 0} Verified Credentials
          </span>
        </div>

        {certificates.length === 0 ? (
          <div className="rounded-2xl bg-[#F8FAF9] border border-gray-200/80 p-10 flex flex-col items-center justify-center text-center">
            <FileText className="w-10 h-10 text-gray-300 mb-3" />
            <h4 className="font-bold text-sm text-gray-900">No certificates yet</h4>
            <p className="text-xs text-gray-500 mt-1">Complete a course 100% to earn your certificate</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="p-5 rounded-2xl bg-[#F8FAF9] border border-gray-200/80 shadow-2xs hover:shadow-sm transition-all space-y-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs mb-2">
                  <span className="font-mono font-bold text-gray-400">{cert.certCode}</span>
                  <span className="font-bold text-[#2D6A4F] bg-emerald-50 px-2 py-0.5 rounded-md">
                    Completed
                  </span>
                </div>

                <h4 className="font-bold text-base text-gray-900 leading-snug">{cert.courseTitle}</h4>

                <div className="mt-3 space-y-1 text-xs text-gray-500">
                  <p>Instructor: {cert.instructorName}</p>
                  <p>
                    Completed: {new Date(cert.issuedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} • {cert.courseDurationText}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedCert(cert)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#2D6A4F]" />
                  <span>View Certificate</span>
                </button>
                <a
                  href={`/api/stats/certificates/${cert.certCode}/pdf`}
                  download={`nudra-certificate-${cert.certCode}.pdf`}
                  className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] transition-colors shadow-2xs"
                  title="Download PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </a>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* Modal for viewing certificate */}
      {selectedCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl p-8 border-4 border-[#2D6A4F] shadow-2xl space-y-6 text-center">
            <button
              onClick={() => setSelectedCert(null)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Certificate Header */}
            <div className="space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-[#2D6A4F] text-white flex items-center justify-center text-xl font-black mx-auto mb-2 shadow-sm">
                إ
              </div>
              <h2 className="text-xl font-bold uppercase tracking-widest text-[#2D6A4F]">
                Nudra Academy of Sciences & Tech
              </h2>
              <p className="text-xs uppercase tracking-widest text-gray-400">
                Certificate of Academic Excellence
              </p>
            </div>

            <div className="py-2">
              <p className="text-xs text-gray-500">This credential certifies that</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">
                {selectedCert.studentName ?? user?.name}
              </h3>
              <p className="text-xs text-gray-600 max-w-md mx-auto mt-2">
                has successfully fulfilled all rigorous lecture requirements, live coding capstones,
                and comprehensive examinations for:
              </p>
              <p className="text-base font-extrabold text-[#2D6A4F] mt-2">
                {selectedCert.courseTitle}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100 text-xs">
              <div>
                <span className="block text-gray-400 uppercase tracking-wider text-[10px]">
                  Issued
                </span>
                <span className="font-bold text-gray-900">
                  {new Date(selectedCert.issuedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div>
                <span className="block text-gray-400 uppercase tracking-wider text-[10px]">
                  Instructor
                </span>
                <span className="font-bold text-gray-900">{selectedCert.instructorName}</span>
              </div>
              <div>
                <span className="block text-gray-400 uppercase tracking-wider text-[10px]">
                  Verification ID
                </span>
                <span className="font-mono font-bold text-gray-900">{selectedCert.certCode}</span>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={`/api/stats/certificates/${selectedCert.certCode}/pdf`}
                download={`nudra-certificate-${selectedCert.certCode}.pdf`}
                className="px-6 py-2.5 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] inline-flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Download Print-Ready PDF</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ProgressPage = withErrorBoundary(ProgressPageInner);
