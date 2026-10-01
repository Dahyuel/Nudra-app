import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { PageErrorBanner } from '../../components/PageErrorBanner';

interface InstructorStudent {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentAvatar: string | null;
  courseId: string;
  courseTitle: string;
  progress: number;
  enrolledAt: string;
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

export const InstructorStudentsPage: React.FC = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const { data: students = [], isLoading, error } = useQuery({
    queryKey: ['instructor-students', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/instructor/students');
      return data.students as InstructorStudent[];
    },
    enabled: !!user && user.role === 'instructor',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        s.studentEmail.toLowerCase().includes(q)
    );
  }, [students, search]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <PageErrorBanner errors={[error]} />
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
          Students
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Everyone enrolled across your courses
        </p>
      </div>

      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="pb-3 px-2">Student Name</th>
                <th className="pb-3 px-3">Email</th>
                <th className="pb-3 px-3">Enrolled Course</th>
                <th className="pb-3 px-3">Progress</th>
                <th className="pb-3 px-3">Enrolled Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-2"><div className="h-4 w-36 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-40 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-48 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                  </tr>
                ))}
              {!isLoading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 italic">
                    {students.length === 0 ? 'No students enrolled yet.' : 'No students match your search.'}
                  </td>
                </tr>
              )}
              {!isLoading &&
                filtered.map((s, idx) => (
                  <tr key={`${s.studentId}-${s.courseId}-${idx}`} className="hover:bg-[#F8FAF9] transition-colors">
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-3">
                        {s.studentAvatar ? (
                          <img
                            src={s.studentAvatar}
                            alt={s.studentName}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-full object-cover border border-gray-100"
                          />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-[#2D6A4F] text-white flex items-center justify-center text-[10px] font-bold">
                            {getInitials(s.studentName)}
                          </span>
                        )}
                        <span className="font-bold text-gray-900">{s.studentName}</span>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-gray-600">{s.studentEmail}</td>
                    <td className="py-4 px-3 text-gray-700 font-semibold max-w-xs truncate">
                      {s.courseTitle}
                    </td>
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-[#2D6A4F] h-full rounded-full"
                            style={{ width: `${s.progress}%` }}
                          />
                        </div>
                        <span className="font-bold text-gray-700">{s.progress}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-gray-500">
                      {new Date(s.enrolledAt).toLocaleDateString()}
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
