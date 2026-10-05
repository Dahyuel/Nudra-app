import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Star,
  Users,
  Clock,
  Calendar,
  CheckCircle2,
  Play,
  Lock,
  ChevronDown,
  ChevronUp,
  Share2,
  Bookmark,
  Award,
  BookOpen,
  MessageSquare,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Video
} from 'lucide-react';
import { useCourse } from '../hooks/useCourse';
import { CourseReviewForm } from '../components/CourseReviewForm';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

export const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { course, isLoading, error } = useCourse(id);

  const [activeTab, setActiveTab] = useState<'overview' | 'curriculum' | 'community' | 'reviews'>('overview');
  const [openSections, setOpenSections] = useState<{ [secId: string]: boolean }>({});
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [showCopyFallback, setShowCopyFallback] = useState(false);
  const [highlightLessonId, setHighlightLessonId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const lessonParam = searchParams.get('lesson');
    if (!lessonParam || !course) return;
    const currentCourse = course;
    setActiveTab('curriculum');
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const section of currentCourse.curriculum ?? []) {
        if (section.lessons.some((l) => l.id === lessonParam)) {
          next[section.id] = true;
        }
      }
      return next;
    });
    setHighlightLessonId(lessonParam);
    const t = setTimeout(() => setHighlightLessonId(null), 3000);
    return () => clearTimeout(t);
  }, [searchParams, course]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Link copied!');
    } catch {
      setShowCopyFallback(true);
    }
  };

  const toggleSection = (secId: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [secId]: !prev[secId],
    }));
  };

  const handleEnroll = async () => {
    if (!course) return;
    setEnrolling(true);
    try {
      await api.post(`/api/courses/${course.id}/enroll`);
      navigate(`/course/${course.id}`);
      window.location.reload();
    } catch (err: any) {
      setEnrollError(err?.response?.data?.message || 'Enrollment failed. Please try again.');
    } finally {
      setEnrolling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-200">
        <section className="rounded-2xl p-6 sm:p-8 bg-white border border-gray-100 shadow-sm animate-pulse space-y-4">
          <div className="h-3 w-40 bg-gray-200 rounded" />
          <div className="h-8 w-3/4 bg-gray-200 rounded" />
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-2/3 bg-gray-200 rounded" />
          <div className="h-10 w-56 bg-gray-200 rounded-full" />
        </section>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-4">
            <div className="h-12 w-full bg-gray-200 rounded-2xl animate-pulse" />
            <div className="h-64 w-full bg-gray-200 rounded-2xl animate-pulse" />
          </div>
          <div className="lg:col-span-4">
            <div className="h-96 w-full bg-gray-200 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="rounded-2xl p-12 bg-white border border-gray-100 text-center shadow-sm" dir="rtl">
        <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h3 className="font-bold text-[#1B1B1B] text-lg">المقرر غير موجود</h3>
        <p className="text-xs text-gray-500 mt-1">
          المقرر الذي تبحث عنه غير موجود أو لم يعد متاحاً.
        </p>
        <Link
          to="/browse"
          className="mt-4 inline-block px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#22523d] transition-colors"
        >
          تصفح المقررات
        </Link>
      </div>
    );
  }

  const isEnrolled = course.is_enrolled;
  const firstLessonId =
    course.last_lesson_id ||
    course.curriculum?.[0]?.lessons?.[0]?.id;

  const ratingBreakdown: { [stars: number]: number } = course.ratingBreakdown || {};

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold shadow-lg animate-in fade-in">
          {toast}
        </div>
      )}
      {showCopyFallback && (
        <div className="fixed bottom-6 right-6 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2 w-72">
          <p className="text-[11px] font-bold text-gray-500">Copy this link:</p>
          <input
            readOnly
            value={window.location.href}
            onFocus={(e) => e.target.select()}
            className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg bg-[#F8FAF9]"
          />
          <button
            onClick={() => setShowCopyFallback(false)}
            className="w-full text-[11px] font-bold text-gray-500 hover:text-gray-700"
          >
            Close
          </button>
        </div>
      )}

      {/* 1. Hero Banner */}
      <section className="rounded-2xl p-6 sm:p-8 bg-white border border-gray-100 shadow-sm relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#B7E4C7]/20 via-[#52B788]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl space-y-4">
          {/* Breadcrumbs & Category */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
            <Link to="/browse" className="hover:text-[#2D6A4F] transition-colors">
              Courses
            </Link>
            <span>/</span>
            <span className="text-[#2D6A4F] bg-[#B7E4C7]/40 px-2.5 py-0.5 rounded-full font-bold">
              {course.category}
            </span>
            <span>•</span>
            <span className="text-gray-400">{course.level} Level</span>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-4xl font-black text-[#1B1B1B] tracking-tight leading-tight">
            {course.title}
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed max-w-3xl">
            {course.subtitle || course.description}
          </p>

          {/* Metadata Row: Instructor, Rating, Students, Last Updated */}
          <div className="flex flex-wrap items-center gap-y-3 gap-x-6 pt-2 text-xs text-gray-600">
            {/* Instructor */}
            <div className="flex items-center gap-2">
              <img
                src={course.instructor.avatar ?? undefined}
                alt={course.instructor.name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover border border-emerald-200 shadow-2xs"
              />
              <div>
                <span className="text-gray-400 block text-[10px]">Instructor</span>
                <span className="font-bold text-gray-900">{course.instructor.name}</span>
              </div>
            </div>

            {/* Rating Stars */}
            <div className="flex items-center gap-1.5 bg-[#F8FAF9] px-3 py-1.5 rounded-xl border border-gray-100">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="font-black text-[#1B1B1B] text-sm">{course.rating}</span>
              <span className="text-gray-400">({course.ratingCount.toLocaleString()} ratings)</span>
            </div>

            {/* Students Count */}
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-gray-400" />
              <span>
                <strong className="text-gray-900 font-bold">
                  {course.studentsCount.toLocaleString()}
                </strong>{' '}
                students enrolled
              </span>
            </div>

            {/* Last Updated */}
            <div className="flex items-center gap-1.5 text-gray-500">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>Last updated: {new Date(course.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Two-Column Layout: Left (70%) Main Content, Right (30%) Sticky Enrollment Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (70% ~ 8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tab Navigation Pill Bar */}
          <div className="flex items-center gap-2 p-1.5 bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'curriculum', label: `Curriculum (${course.curriculum?.reduce((acc, s) => acc + s.lessons.length, 0) || course.lessonsCount})` },
              { id: 'community', label: 'Community' },
              { id: 'reviews', label: `Reviews (${course.ratingCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#2D6A4F] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-[#F8FAF9]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* What You Will Learn Card */}
              <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
                <h3 className="font-bold text-base text-[#1B1B1B] flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#2D6A4F]" />
                  <span>What You'll Learn in this Masterclass</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                  {([
                    'Master production-grade modern design tokens and architecture',
                    'Implement robust type-safe state flows with zero runtime leaks',
                    'Integrate real-world APIs with automated rollback mechanisms',
                    'Design responsive, accessible layouts following Donezo standards',
                  ]).map((point, index) => (
                    <div key={index} className="flex items-start gap-2.5 text-xs text-gray-700 leading-relaxed">
                      <div className="w-4 h-4 rounded-full bg-emerald-100 text-[#2D6A4F] flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Course Description */}
              <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-3">
                <h3 className="font-bold text-base text-[#1B1B1B]">Course Details & Blueprint</h3>
                <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                  {course.description}
                </p>
                <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                  Every section includes downloadable boilerplate repositories, interactive quizzes via the Nudra AI Tutor, and peer code discussions. By completing the final capstone, you will graduate with a verified LinkedIn-ready credential.
                </p>
              </div>

              {/* Instructor Bio */}
              <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
                <h3 className="font-bold text-base text-[#1B1B1B]">About the Instructor</h3>
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <img
                    src={course.instructor.avatar ?? undefined}
                    alt={course.instructor.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl object-cover border border-gray-100 shadow-xs"
                  />
                  <div className="space-y-1.5 flex-1">
                    <h4 className="font-bold text-base text-[#1B1B1B]">
                      {course.instructor.name}
                    </h4>
                    <p className="text-xs font-semibold text-[#2D6A4F]">
                      Course Instructor
                    </p>
                    <p className="text-xs text-[#6B7280] leading-relaxed pt-1">
                      Senior educator and engineering mentor dedicated to empowering developers through bilingual pedagogy and real-world system designs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CURRICULUM (Accordion Sections with Video Lessons) */}
          {activeTab === 'curriculum' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="font-bold text-base text-[#1B1B1B]">Course Syllabus</h3>
                  <p className="text-xs text-[#6B7280]">
                    {course.curriculum?.length || 4} sections • {course.lessonsCount} video lessons • {course.duration} total length
                  </p>
                </div>
                <button
                  onClick={() => {
                    const allOpen = Object.values(openSections).every(Boolean);
                    const newStates: any = {};
                    (course.curriculum || []).forEach((s) => {
                      newStates[s.id] = !allOpen;
                    });
                    setOpenSections(newStates);
                  }}
                  className="text-xs font-bold text-[#2D6A4F] hover:underline"
                >
                  Expand / Collapse All
                </button>
              </div>

              {/* Curriculum Accordion */}
              <div className="space-y-3">
                {(course.curriculum || []).map((section, idx) => {
                  const isOpen = !!openSections[section.id];
                  return (
                    <div
                      key={section.id}
                      className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden transition-all"
                    >
                      {/* Accordion Section Header */}
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full p-5 flex items-center justify-between text-left hover:bg-[#F8FAF9] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-xl bg-emerald-50 text-[#2D6A4F] font-black text-xs flex items-center justify-center border border-emerald-100">
                            {idx + 1}
                          </span>
                          <div>
                            <h4 className="font-bold text-sm sm:text-base text-[#1B1B1B]">
                              {section.title}
                            </h4>
                            <span className="text-[11px] text-[#6B7280]">
                              {section.lessons.length} lessons
                            </span>
                          </div>
                        </div>

                        <div className="text-gray-400 p-1">
                          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </button>

                      {/* Video Lessons List */}
                      {isOpen && (
                        <div className="divide-y divide-gray-50 border-t border-gray-100 bg-[#F8FAF9]/40">
                          {section.lessons.map((lesson) => (
                            <div
                              key={lesson.id}
                              onClick={() => {
                                if (!lesson.isLocked) {
                                  navigate(`/course/${course.id}/lesson/${lesson.id}`);
                                } else {
                                  showToast('Enroll in this course to unlock this advanced module!');
                                }
                              }}
                              className={`p-4 px-6 flex items-center justify-between transition-colors cursor-pointer group ${
                                lesson.isLocked
                                  ? 'opacity-65 hover:bg-gray-100/50'
                                  : 'hover:bg-white hover:shadow-2xs'
                              } ${
                                highlightLessonId === lesson.id
                                  ? 'ring-2 ring-amber-400 ring-inset bg-amber-50/40'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                {lesson.isLocked ? (
                                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center shrink-0">
                                    <Lock className="w-3.5 h-3.5" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-emerald-100 text-[#2D6A4F] flex items-center justify-center shrink-0 group-hover:bg-[#2D6A4F] group-hover:text-white transition-colors">
                                    <Play className="w-3 h-3 fill-current ml-0.5" />
                                  </div>
                                )}

                                <div className="truncate">
                                  <p className="text-xs sm:text-sm font-semibold text-gray-900 group-hover:text-[#2D6A4F] transition-colors truncate">
                                    {lesson.title}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 ml-3">
                                <span className="text-xs text-gray-400 font-mono">
                                  {lesson.duration}
                                </span>
                                {!lesson.isLocked && (
                                  <span className="text-[11px] font-bold text-[#2D6A4F] opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline-block">
                                    Watch →
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: COMMUNITY PREVIEW & DIRECT LINK */}
          {activeTab === 'community' && (
            <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-6 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-base text-[#1B1B1B]">
                    Course Discussion Board
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Connect with peers enrolled in {course.title}, ask questions anonymously, or reply to threads.
                  </p>
                </div>
                <Link
                  to={`/course/${course.id}/community`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] transition-colors shadow-2xs self-start"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Open Full Community</span>
                </Link>
              </div>

              {/* Quick teaser cards */}
              <div className="p-4 rounded-xl bg-[#F8FAF9] border border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-2xs border border-gray-100 flex items-center justify-center text-[#2D6A4F]">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-gray-900">
                      Instructor Active Hours
                    </h4>
                    <p className="text-xs text-gray-500">
                      {course.instructor.name} answers questions daily. Pinned resources available.
                    </p>
                  </div>
                </div>
                <Link
                  to={`/course/${course.id}/community`}
                  className="text-xs font-bold text-[#2D6A4F] hover:underline"
                >
                  Join Board →
                </Link>
              </div>
            </div>
          )}

          {/* TAB 4: REVIEWS (Average Rating Bar Chart + 3 Review Cards) */}
          {activeTab === 'reviews' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Rating Stats Card */}
              <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-6">
                <h3 className="font-bold text-base text-[#1B1B1B]">Student Feedback & Ratings</h3>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                  {/* Left Big Score */}
                  <div className="sm:col-span-4 text-center sm:text-left flex flex-col items-center sm:items-start justify-center">
                    <span className="text-5xl sm:text-6xl font-black text-[#1B1B1B] tracking-tight">
                      {course.rating}
                    </span>
                    <div className="flex items-center gap-1 my-2">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${
                            s <= Math.round(course.rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs font-semibold text-gray-500">
                      Course Rating • {course.ratingCount.toLocaleString()} Reviews
                    </p>
                  </div>

                  {/* Right Rating Bar Chart (5 to 1 Stars) */}
                  <div className="sm:col-span-8 space-y-2">
                    {[5, 4, 3, 2, 1].map((stars) => {
                      // The API sends counts per star; show each as a share of all reviews.
                      const pct = course.ratingCount
                        ? Math.round(((ratingBreakdown[stars] || 0) / course.ratingCount) * 100)
                        : 0;
                      return (
                        <div key={stars} className="flex items-center gap-3 text-xs">
                          <span className="w-12 font-bold text-gray-700 flex items-center gap-1">
                            <span>{stars}</span>
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-[#2D6A4F] h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-gray-400 font-semibold font-mono">
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {isEnrolled && <CourseReviewForm courseId={course.id} existing={course.my_review ?? null} />}

              {/* Review Cards */}
              <div className="space-y-4">
                {(course.reviews || []).length === 0 && (
                  <p className="rounded-2xl p-8 bg-white border border-gray-100 text-center text-sm text-gray-500">
                    No reviews yet.{isEnrolled ? ' Be the first to rate this course.' : ''}
                  </p>
                )}
                {(course.reviews || []).map((review) => (
                  <div
                    key={review.id}
                    className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {review.avatar ? (
                          <img
                            src={review.avatar}
                            alt={review.author}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-gray-100"
                          />
                        ) : (
                          <span className="w-10 h-10 rounded-full bg-[#2D6A4F] text-white flex items-center justify-center text-xs font-bold">
                            {review.author
                              .split(' ')
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()}
                          </span>
                        )}
                        <div>
                          <h4 className="font-bold text-sm text-[#1B1B1B]">{review.author}</h4>
                          <span className="text-[11px] text-gray-400">
                            {new Date(review.date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < Math.floor(review.rating)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {review.comment && (
                      <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">"{review.comment}"</p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-[11px] text-gray-400">
                      <span>Verified Student</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (30% ~ 4 cols): Sticky Enrollment Card */}
        <aside className="lg:col-span-4 sticky top-24 space-y-6">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden">
            {/* Thumbnail with Video Play Overlay */}
              <div className={`relative aspect-video w-full bg-gray-900 group overflow-hidden ${course.deliveryMode === 'offline' ? '' : 'cursor-pointer'}`}>
              <img
                src={course.thumbnail ?? undefined}
                alt={course.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90"
              />
              {course.deliveryMode !== 'offline' && <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white/90 text-[#2D6A4F] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
              </div>}
              <span className="absolute bottom-3 left-3 text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded backdrop-blur-xs">
                {course.deliveryMode === 'offline' ? 'In person' : 'Preview Course Trailer'}
              </span>
            </div>

            {/* Price & Action Buttons */}
            <div className="p-6 space-y-6">
              {course.deliveryMode === 'offline' ? <div className="space-y-2"><span className="text-2xl font-black text-[#2D6A4F]">Offline · booking only</span><p className="text-sm text-gray-600">{course.location || 'Location details available from the organization'}{course.scheduleText ? ` · ${course.scheduleText}` : ''}</p></div> : <div className="flex items-baseline justify-between">
                <div>
                  {course.price === 0 ? (
                    <span className="text-3xl font-black text-[#2D6A4F]">Free</span>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-[#1B1B1B]">
                        {course.price} EGP
                      </span>
                      {course.originalPrice && (
                        <span className="text-sm text-gray-400 line-through">
                          {course.originalPrice} EGP
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                  Full Lifetime Access
                </span>
              </div>}

              {/* Action Button */}
              {course.deliveryMode === 'offline' ? (course.bookingUrl ? <a href={course.bookingUrl} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold">Book this course <ArrowRight className="w-4 h-4" /></a> : <p className="rounded-xl bg-gray-50 p-3 text-center text-sm text-gray-600">Contact the organization to book this course.</p>) : isEnrolled ? (
                <div className="space-y-2">
                  <Link
                    to={`/course/${course.id}/lesson/${course.curriculum?.[0]?.lessons?.[0]?.id || 'les-1'}`}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-sm font-bold shadow-sm transition-all"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Continue to Video Lesson</span>
                  </Link>
                  <p className="text-center text-[11px] text-[#2D6A4F] font-bold">
                    ✓ You are enrolled in this course
                  </p>
                </div>
              ) : course.price === 0 ? (
                <button
                  onClick={handleEnroll}
                  disabled={enrolling}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  <span>{enrolling ? 'Enrolling...' : 'Enroll for Free'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={async () => {
                    if (!user) return navigate('/login');
                    setEnrolling(true);
                    setEnrollError(null);
                    try {
                      const { data } = await api.post('/api/payments/checkout', { courseId: course.id });
                      if (/^https?:\/\//.test(data.redirectUrl)) window.location.href = data.redirectUrl;
                      else navigate(data.redirectUrl);
                    } catch (err: any) {
                      setEnrollError(err?.response?.data?.message || 'Could not start checkout.');
                    } finally {
                      setEnrolling(false);
                    }
                  }}
                  disabled={enrolling}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-sm font-bold shadow-md transition-all disabled:opacity-50"
                >
                  <span>{enrolling ? 'Starting checkout...' : `Buy for ${course.price} EGP`}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              {enrollError && (
                <p className="text-xs text-red-600 font-semibold text-center">{enrollError}</p>
              )}

              {/* What's Included Feature List */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  This course includes:
                </h4>
                <ul className="space-y-2 text-xs text-gray-600">
                  <li className="flex items-center gap-2.5">
                    <Video className="w-4 h-4 text-[#2D6A4F]" />
                    <span>{course.duration} on-demand video</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <BookOpen className="w-4 h-4 text-[#2D6A4F]" />
                    <span>{course.lessonsCount} modular lessons & starter code</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-[#2D6A4F]" />
                    <span>Interactive 24/7 Nudra AI Tutor</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Award className="w-4 h-4 text-[#2D6A4F]" />
                    <span>Certificate of completion</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#2D6A4F]" />
                    <span>30-Day Money-Back Guarantee</span>
                  </li>
                </ul>
              </div>

              {/* Share and Bookmark buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>
                <button
                  onClick={() => {
                    setIsWishlisted((prev) => !prev);
                    showToast(isWishlisted ? 'Removed from wishlist' : 'Added to wishlist');
                  }}
                  className="p-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-[#F8FAF9] transition-colors"
                  title="Bookmark course"
                >
                  <Bookmark className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
