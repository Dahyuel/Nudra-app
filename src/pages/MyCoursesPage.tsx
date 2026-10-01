import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Play, CheckCircle2, Clock, Award, Star, ArrowUpRight } from 'lucide-react';
import { useMyEnrollments } from '../hooks/useMyEnrollments';
import { PageErrorBanner } from '../components/PageErrorBanner';

const EMPTY_MESSAGES = {
  all: "You haven't enrolled in any courses yet.",
  'in-progress': 'No courses in progress. Everything you started is finished.',
  completed: "You haven't completed a course yet. Keep going!",
} as const;

export const MyCoursesPage: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'in-progress' | 'completed'>('all');
  const { enrollments, isLoading, error } = useMyEnrollments();

  const enrolledCourses = enrollments.filter((c) => {
    if (filter === 'in-progress') return c.progress < 100;
    if (filter === 'completed') return c.progress === 100;
    return true;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <PageErrorBanner errors={[error]} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
            My Courses
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Track your ongoing progress, resume modules, and download your certifications
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-gray-100 shadow-2xs self-start">
          {(['all', 'in-progress', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                filter === tab
                  ? 'bg-[#2D6A4F] text-white shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Courses List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading &&
          [0, 1].map((i) => (
            <div key={i} className="h-64 rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse" />
          ))}

        {!isLoading && !error && enrolledCourses.length === 0 && (
          <div className="rounded-2xl p-8 bg-white border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
            <BookOpen className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-600">{EMPTY_MESSAGES[filter]}</p>
          </div>
        )}

        {!isLoading && enrolledCourses.map((course) => (
          <div
            key={course.id}
            className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all group"
          >
            <div>
              <div className="flex items-start gap-4 mb-4">
                <Link
                  to={`/course/${course.id}`}
                  className="w-24 h-24 rounded-2xl overflow-hidden shadow-2xs group-hover:scale-102 transition-transform shrink-0 block"
                >
                  <img
                    src={course.thumbnail ?? undefined}
                    alt={course.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-bold text-[#2D6A4F] bg-[#B7E4C7]/30 px-2 py-0.5 rounded-md">
                      {course.category}
                    </span>
                    <span className="text-[11px] text-gray-400 font-semibold">
                      {course.level}
                    </span>
                  </div>
                  <Link
                    to={`/course/${course.id}`}
                    className="font-bold text-base text-[#1B1B1B] hover:text-[#2D6A4F] transition-colors leading-snug line-clamp-2 block"
                  >
                    {course.title}
                  </Link>
                  <p className="text-xs text-gray-500 mt-1">
                    Instructor: {course.instructor.name}
                  </p>
                </div>
              </div>

              {/* Current active lesson */}
              <div className="bg-[#F8FAF9] p-3 rounded-xl mb-4 border border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Active Lesson
                </p>
                <p className="text-xs font-bold text-gray-800 truncate mt-0.5">
                  {course.lastLessonId ? 'Resume where you left off' : 'Start your first lesson'}
                </p>
              </div>
            </div>

            <div>
              {/* Progress Slider */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                  <span className="text-gray-600">Course Completion</span>
                  <span className="text-[#2D6A4F]">{course.progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-[#2D6A4F] h-full rounded-full transition-all duration-500"
                    style={{ width: `${course.progress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {course.duration}
                  </span>
                  <span>{course.lessonsCount} lessons</span>
                </div>

                <Link
                  to={
                    course.lastLessonId
                      ? `/course/${course.id}/lesson/${course.lastLessonId}`
                      : `/course/${course.id}`
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold shadow-2xs transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume</span>
                </Link>
              </div>
            </div>
          </div>
        ))}

        {/* Suggestion to enroll more courses */}
        <div className="rounded-2xl p-6 bg-gradient-to-br from-emerald-50 to-[#F8FAF9] border-2 border-dashed border-[#B7E4C7] flex flex-col items-center justify-center text-center p-8">
          <div className="w-12 h-12 rounded-full bg-white shadow-2xs flex items-center justify-center text-[#2D6A4F] mb-3">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-[#1B1B1B]">Expand Your Knowledge</h3>
          <p className="text-xs text-[#6B7280] max-w-xs mt-1 mb-4">
            Discover new certifications in Arabic NLP, Generative AI, or Advanced UI Systems.
          </p>
          <Link
            to="/browse"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#22523d] transition-colors"
          >
            <span>Browse Full Catalog</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
