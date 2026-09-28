import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download } from 'lucide-react';
import { usePastExams } from '../hooks/usePastExams';

const CORE_SUBJECTS = [
  'الرياضيات',
  'اللغة العربية',
  'اللغة الإنجليزية',
  'الفيزياء',
  'الكيمياء',
  'الأحياء',
  'التاريخ',
  'الجغرافيا',
];

const GRADES = [
  { value: 'all', label: 'الكل' },
  { value: 'year1', label: 'سنة أولى' },
  { value: 'year2', label: 'سنة ثانية' },
  { value: 'year3', label: 'سنة ثالثة' },
];

const SESSIONS = [
  { value: 'all', label: 'الكل' },
  { value: 'first', label: 'الدور الأول' },
  { value: 'second', label: 'الدور الثاني' },
];

export const SanaweyaExamsPage: React.FC = () => {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('all');
  const [grade, setGrade] = useState('all');
  const [year, setYear] = useState('all');
  const [session, setSession] = useState('all');

  const { exams, isLoading, error } = usePastExams({ subject, grade, year, session });

  const years = useMemo(() => {
    const unique = Array.from(new Set(exams.map((e) => e.year))).sort((a, b) => b - a);
    return [{ value: 'all', label: 'الكل' }, ...unique.map((y) => ({ value: String(y), label: String(y) }))];
  }, [exams]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
          بنك الامتحانات السابقة
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">حمّل وافتح امتحانات الثانوية العامة السابقة مع أوراق الإجابة</p>
      </div>

      <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-2">المادة</label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#2D6A4F]"
          >
            <option value="all">الكل</option>
            {CORE_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-2">الصف</label>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#2D6A4F]"
          >
            {GRADES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-2">السنة</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#2D6A4F]"
          >
            {years.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-2">الدور</label>
          <select
            value={session}
            onChange={(e) => setSession(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#2D6A4F]"
          >
            {SESSIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl p-12 bg-white border border-gray-100 text-center shadow-sm">
          <h3 className="font-bold text-[#2D6A4F] text-base">تعذر تحميل الامتحانات</h3>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 space-y-3 animate-pulse">
              <div className="h-4 w-1/2 bg-gray-200 rounded" />
              <div className="h-3 w-1/3 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : exams.length === 0 ? (
        <div className="rounded-2xl p-12 bg-white border border-gray-100 text-center shadow-sm">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-bold text-gray-900 text-base">لا توجد امتحانات</h3>
          <p className="text-xs text-gray-500 mt-1">جرّب تغيير الفلاتر.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {exams.map((exam) => (
            <div key={exam.id} className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-bold text-base text-[#1B1B1B]">{exam.title}</h3>
              <div className="flex flex-wrap gap-2">
                <span className="text-[11px] font-bold bg-[#B7E4C7]/40 text-[#2D6A4F] px-2.5 py-1 rounded-full">
                  {exam.subject}
                </span>
                <span className="text-[11px] font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                  {exam.year}
                </span>
                <span className="text-[11px] font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                  {exam.session === 'first' ? 'الدور الأول' : 'الدور الثاني'}
                </span>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => navigate(`/sanaweya/exams/${exam.id}`)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold transition-colors"
                >
                  فتح الامتحان
                </button>
                {exam.answerKeyUrl && (
                  <a
                    href={exam.answerKeyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    ورقة الإجابة
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
