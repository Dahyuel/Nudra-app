import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Filter, Check, BookOpen, Star, Users, Clock, GraduationCap } from 'lucide-react';
import api from '../lib/api';
import { useSanaweyaCourses } from '../hooks/useSanaweyaCourses';

const CORE_SUBJECTS = [
  'Mathematics',
  'Arabic Language',
  'English Language',
  'Physics',
  'Chemistry',
  'Biology',
  'History',
  'Geography',
];

const GRADE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'year1', label: 'First Year' },
  { value: 'year2', label: 'Second Year' },
  { value: 'year3', label: 'Third Year' },
];

const GRADE_LABELS: Record<string, string> = {
  year1: 'First Year Secondary',
  year2: 'Second Year Secondary',
  year3: 'Third Year Secondary',
};

export const SanaweyaCoursesPage: React.FC = () => {
  const [grade, setGrade] = useState('all');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [price, setPrice] = useState<'all' | 'free' | 'paid'>('all');
  const [ministryAligned, setMinistryAligned] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['sanaweya-profile'],
    queryFn: async () => {
      const { data } = await api.get('/api/sanaweya/profile');
      return data.profile as { grade: string } | null;
    },
  });

  const { courses, isLoading, error } = useSanaweyaCourses({
    grade,
    subject: selectedSubjects.length === 1 ? selectedSubjects[0] : undefined,
    price,
    ministryAligned,
  });

  const filteredCourses = selectedSubjects.length > 1
    ? courses.filter((c) => selectedSubjects.includes((c as any).sanaweyaSubject ?? ''))
    : courses;

  const toggleSubject = (subject: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]
    );
  };

  const resetFilters = () => {
    setGrade('all');
    setSelectedSubjects([]);
    setPrice('all');
    setMinistryAligned(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight flex items-center gap-3">
            Secondary School Courses
            {profile?.grade && (
              <span className="text-xs font-bold bg-[#B7E4C7]/40 text-[#2D6A4F] px-3 py-1 rounded-full">
                {GRADE_LABELS[profile.grade] ?? profile.grade}
              </span>
            )}
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Courses aligned with the Ministry of Education curriculum
          </p>
        </div>
        <Link
          to="/sanaweya"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-800 shadow-2xs self-start"
        >
          <GraduationCap className="w-4 h-4 text-[#2D6A4F]" />
          <span>Secondary Hub</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <aside className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 font-bold text-gray-900 text-base">
                <Filter className="w-4 h-4 text-[#2D6A4F]" />
                <span>Filters</span>
              </div>
              <button onClick={resetFilters} className="text-xs font-semibold text-gray-400 hover:text-[#2D6A4F]">
                Reset
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">Grade</label>
              <div className="space-y-1.5">
                {GRADE_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGrade(g.value)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                      grade === g.value ? 'bg-[#2D6A4F] text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span>{g.label}</span>
                    {grade === g.value && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">Subjects</label>
              <div className="space-y-1.5">
                {CORE_SUBJECTS.map((subject) => (
                  <button
                    key={subject}
                    onClick={() => toggleSubject(subject)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                      selectedSubjects.includes(subject) ? 'text-[#2D6A4F] font-bold' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <span>{subject}</span>
                    {selectedSubjects.includes(subject) && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">Price</label>
              <div className="grid grid-cols-3 gap-1.5 bg-[#F8FAF9] p-1.5 rounded-xl border border-gray-100">
                {([['all', 'All'], ['free', 'Free'], ['paid', 'Paid']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setPrice(value)}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      price === value ? 'bg-white text-[#2D6A4F] shadow-2xs' : 'text-gray-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setMinistryAligned((v) => !v)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                ministryAligned ? 'border-[#2D6A4F] bg-[#F0FFF4]' : 'border-gray-100'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                  ministryAligned ? 'bg-[#2D6A4F] border-[#2D6A4F]' : 'border-gray-300'
                }`}
              >
                {ministryAligned && <Check className="w-3.5 h-3.5 text-white" />}
              </span>
              <span className="text-xs font-semibold text-gray-700">Ministry of Education curriculum only</span>
            </button>
          </div>
        </aside>

        <div className="lg:col-span-9 space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <strong className="text-gray-900 font-bold">{filteredCourses.length}</strong>
              <span>courses available</span>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl p-12 bg-white border border-gray-100 text-center shadow-sm">
              <h3 className="font-bold text-[#2D6A4F] text-base">Could not load courses</h3>
              <p className="text-xs text-gray-500 mt-1">An error occurred while fetching data. Please try again.</p>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden animate-pulse">
                  <div className="aspect-video w-full bg-gray-200" />
                  <div className="p-6 space-y-3">
                    <div className="h-3 w-1/3 bg-gray-200 rounded" />
                    <div className="h-4 w-5/6 bg-gray-200 rounded" />
                    <div className="h-4 w-2/3 bg-gray-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="rounded-2xl p-12 bg-white border border-gray-100 text-center shadow-sm">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 text-base">No courses found</h3>
              <p className="text-xs text-gray-500 mt-1">Try changing the filters to see more results.</p>
              <button
                onClick={resetFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#22523d] transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredCourses.map((course) => (
                <Link
                  key={course.id}
                  to={`/course/${course.id}`}
                  className="rounded-2xl bg-white border border-gray-100 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-all group"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                    <img
                      src={course.thumbnail ?? undefined}
                      alt={course.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {(course as any).sanaweyaSubject && (
                      <span className="absolute top-3 left-3 text-[11px] font-bold bg-white/90 text-[#2D6A4F] px-2.5 py-1 rounded-full">
                        {(course as any).sanaweyaSubject}
                      </span>
                    )}
                  </div>
                  <div className="p-6 flex-1">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2.5">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span className="font-bold text-gray-900">{course.rating}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <span>{course.studentsCount}</span>
                      </div>
                    </div>
                    <h3 className="font-bold text-base text-[#1B1B1B] leading-snug line-clamp-2 group-hover:text-[#2D6A4F] transition-colors">
                      {course.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                      <img src={course.instructor.avatar ?? undefined} alt={course.instructor.name} className="w-7 h-7 rounded-full object-cover" />
                      <span className="text-xs font-semibold text-gray-800">{course.instructor.name}</span>
                    </div>
                  </div>
                  <div className="p-6 pt-3 flex items-center justify-between border-t border-gray-100">
                    {course.price === 0 ? (
                      <span className="text-base font-extrabold text-[#2D6A4F]">Free</span>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-black text-[#1B1B1B]">EGP {course.price}</span>
                        {course.originalPrice && (
                          <span className="text-xs text-gray-400 line-through">EGP {course.originalPrice}</span>
                        )}
                      </div>
                    )}
                    <span className="text-xs font-bold text-[#2D6A4F] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {course.duration}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
