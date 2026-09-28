import React, { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  Star,
  Users,
  Clock,
  Filter,
  Check,
  X,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  SlidersHorizontal
} from 'lucide-react';
import { useCourses } from '../hooks/useCourses';
import { useMyEnrollments } from '../hooks/useMyEnrollments';
import { useSanaweyaCourses } from '../hooks/useSanaweyaCourses';
import { useAuth } from '../context/AuthContext';

export const CatalogPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';

  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedPrice, setSelectedPrice] = useState<'all' | 'free' | 'paid'>('all');
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [selectedLevel, setSelectedLevel] = useState<string>('All');
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const { user } = useAuth();

  const { courses, isLoading, error } = useCourses({
    search: searchQuery,
    category: selectedCategory,
    level: selectedLevel,
    price: selectedPrice,
  });

  const { enrollments } = useMyEnrollments();
  const enrolledIds = enrollments.map((e) => e.id);
  const { courses: sanaweyaCourses } = useSanaweyaCourses({ limit: 4 });
  const hasSanaweya = sanaweyaCourses.length > 0;

  const categories = [
    'All',
    'Computer Science',
    'AI & Data',
    'UI/UX Design',
    'Business',
    'Languages',
  ];

  const levels = ['All', 'Beginner', 'Intermediate', 'Advanced'];

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesRating = selectedRating === 0 || course.rating >= selectedRating;
      return matchesRating;
    });
  }, [courses, selectedRating]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedPrice('all');
    setSelectedRating(0);
    setSelectedLevel('All');
    setSearchParams({});
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
            Browse Courses
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Discover verified masterclasses and practical bootcamps led by industry leaders
          </p>
        </div>

        <button
          onClick={() => setShowMobileFilter(true)}
          className="lg:hidden inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-800 shadow-2xs self-start"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#2D6A4F]" />
          <span>Filters</span>
        </button>
      </div>

      {hasSanaweya && (
        <div className="rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-[#2D6A4F] to-[#52B788] text-white shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold mb-2">هل أنت طالب ثانوية عامة؟</h2>
            <p className="text-sm text-white/90">تصفح مقررات خاصة بمناهج وزارة التربية والتعليم</p>
          </div>
          <Link
            to="/sanaweya/courses"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-[#2D6A4F] text-sm font-bold shadow-sm hover:bg-white/90 transition-colors self-start lg:self-auto shrink-0"
          >
            تصفح مقررات الثانوية
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Main Grid with Filter Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Filter Sidebar (Desktop) */}
        <aside className="hidden lg:block lg:col-span-3 sticky top-24 space-y-6">
          <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 font-bold text-gray-900 text-base">
                <Filter className="w-4 h-4 text-[#2D6A4F]" />
                <span>Filters</span>
              </div>
              <button
                onClick={resetFilters}
                className="text-xs font-semibold text-gray-400 hover:text-[#2D6A4F] transition-colors"
              >
                Reset All
              </button>
            </div>

            {/* Subject / Category Filter */}
            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">
                Subject
              </label>
              <div className="space-y-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                      selectedCategory === cat
                        ? 'bg-[#2D6A4F] text-white'
                        : 'text-gray-600 hover:bg-[#F8FAF9]'
                    }`}
                  >
                    <span>{cat}</span>
                    {selectedCategory === cat && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Filter */}
            <div className="pt-4 border-t border-gray-100">
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">
                Price
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-[#F8FAF9] p-1.5 rounded-xl border border-gray-100">
                {(['all', 'free', 'paid'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedPrice(p)}
                    className={`py-1.5 text-xs font-bold capitalize rounded-lg transition-all ${
                      selectedPrice === p
                        ? 'bg-white text-[#2D6A4F] shadow-2xs'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Rating Filter */}
            <div className="pt-4 border-t border-gray-100">
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">
                Minimum Rating
              </label>
              <div className="space-y-1.5">
                {[
                  { label: 'All Ratings', value: 0 },
                  { label: '4.8 & Above', value: 4.8 },
                  { label: '4.5 & Above', value: 4.5 },
                  { label: '4.0 & Above', value: 4.0 },
                ].map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setSelectedRating(item.value)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                      selectedRating === item.value
                        ? 'bg-emerald-50 text-[#2D6A4F] font-bold border border-emerald-200'
                        : 'text-gray-600 hover:bg-[#F8FAF9]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Star
                        className={`w-3.5 h-3.5 ${
                          item.value > 0 ? 'fill-amber-400 text-amber-400' : 'text-gray-400'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                    {selectedRating === item.value && (
                      <Check className="w-3.5 h-3.5 text-[#2D6A4F]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Level Filter */}
            <div className="pt-4 border-t border-gray-100">
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">
                Experience Level
              </label>
              <div className="space-y-1.5">
                {levels.map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setSelectedLevel(lvl)}
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                      selectedLevel === lvl
                        ? 'text-[#2D6A4F] font-bold'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <span>{lvl}</span>
                    {selectedLevel === lvl && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Course Cards Grid */}
        <div className="lg:col-span-9 space-y-6">
          {/* Active filter chips & results count */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Showing</span>
              <strong className="text-gray-900 font-bold">{filteredCourses.length}</strong>
              <span>curated courses</span>
            </div>

            <div className="flex items-center gap-2">
              {selectedCategory !== 'All' && (
                <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-[#2D6A4F] px-2.5 py-1 rounded-full font-semibold">
                  {selectedCategory}
                  <button onClick={() => setSelectedCategory('All')}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedPrice !== 'all' && (
                <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-[#2D6A4F] px-2.5 py-1 rounded-full font-semibold capitalize">
                  {selectedPrice}
                  <button onClick={() => setSelectedPrice('all')}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedRating > 0 && (
                <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-[#2D6A4F] px-2.5 py-1 rounded-full font-semibold">
                  ★ {selectedRating}+
                  <button onClick={() => setSelectedRating(0)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl p-12 bg-white border border-gray-100 text-center shadow-sm">
              <h3 className="font-bold text-[#2D6A4F] text-base">Failed to load courses</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                Something went wrong while fetching the catalog. Please try again.
              </p>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden animate-pulse"
                >
                  <div className="aspect-video w-full bg-gray-200" />
                  <div className="p-6 space-y-3">
                    <div className="h-3 w-1/3 bg-gray-200 rounded" />
                    <div className="h-4 w-5/6 bg-gray-200 rounded" />
                    <div className="h-4 w-2/3 bg-gray-200 rounded" />
                    <div className="h-7 w-7 bg-gray-200 rounded-full mt-3" />
                  </div>
                  <div className="p-6 pt-3 border-t border-gray-100">
                    <div className="h-5 w-20 bg-gray-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="rounded-2xl p-12 bg-white border border-gray-100 text-center shadow-sm">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 text-base">No courses found</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                Try loosening your filters or search keywords to explore more of our learning catalog.
              </p>
              <button
                onClick={resetFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#22523d] transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredCourses.map((course) => {
                const isEnrolled = enrolledIds.includes(course.id);

                return (
                  <div
                    key={course.id}
                    className="rounded-2xl bg-white border border-gray-100 shadow-sm flex flex-col justify-between overflow-hidden hover:shadow-md transition-all group"
                  >
                    <Link
                      to={`/course/${course.id}`}
                      className="block cursor-pointer flex-1"
                    >
                      {/* Thumbnail with category pill */}
                      <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                        <img
                          src={course.thumbnail ?? undefined}
                          alt={course.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute top-3 left-3 flex items-center gap-1.5">
                          <span className="text-[11px] font-bold bg-white/90 backdrop-blur-xs text-[#2D6A4F] px-2.5 py-1 rounded-full shadow-2xs">
                            {course.category}
                          </span>
                        </div>
                        <div className="absolute bottom-3 right-3">
                          <span className="text-[11px] font-semibold bg-gray-900/80 backdrop-blur-xs text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {course.duration}
                          </span>
                        </div>
                      </div>

                      {/* Content padding: p-6 */}
                      <div className="p-6 pb-2">
                        {/* Rating stars & student count */}
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-2.5">
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                            <span className="font-bold text-gray-900">{course.rating}</span>
                            <span className="text-gray-400">({course.ratingCount})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-gray-400" />
                            <span>{course.studentsCount.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Title */}
                        <h3 className="font-bold text-base text-[#1B1B1B] leading-snug line-clamp-2 mb-2 group-hover:text-[#2D6A4F] transition-colors">
                          {course.title}
                        </h3>

                        {/* Instructor */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                          <img
                            src={course.instructor.avatar ?? undefined}
                            alt={course.instructor.name}
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded-full object-cover"
                          />
                          <div className="text-xs truncate">
                            <span className="font-semibold text-gray-800">{course.instructor.name}</span>
                          </div>
                        </div>
                      </div>
                    </Link>

                    {/* Bottom footer: Price & Enroll CTA */}
                    <div className="p-6 pt-3 flex items-center justify-between border-t border-gray-100 mt-2">
                      <div>
                        {course.price === 0 ? (
                          <span className="text-base font-extrabold text-[#2D6A4F]">Free</span>
                        ) : (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-black text-[#1B1B1B]">
                              ${course.price}
                            </span>
                            {course.originalPrice && (
                              <span className="text-xs text-gray-400 line-through">
                                ${course.originalPrice}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {isEnrolled ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2D6A4F] bg-[#B7E4C7]/40 px-3 py-2 rounded-xl">
                          <Check className="w-3.5 h-3.5" />
                          <span>Enrolled</span>
                        </span>
                      ) : (
                        <Link
                          to={`/course/${course.id}`}
                          className="px-4 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold shadow-sm transition-all hover:shadow"
                        >
                          Enroll Now
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {hasSanaweya && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-[#1B1B1B]">مقررات الثانوية العامة</h2>
            <Link to="/sanaweya/courses" className="text-xs font-bold text-[#2D6A4F] hover:underline">
              عرض الكل
            </Link>
          </div>
          <div className="flex gap-5 overflow-x-auto pb-2">
            {sanaweyaCourses.map((course) => (
              <Link
                key={course.id}
                to={`/course/${course.id}`}
                className="min-w-[280px] max-w-[300px] rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all"
              >
                <div className="aspect-video w-full overflow-hidden bg-gray-100">
                  <img src={course.thumbnail ?? undefined} alt={course.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-5 space-y-2">
                  {(course as any).sanaweyaSubject && (
                    <span className="inline-block text-[11px] font-bold bg-[#B7E4C7]/40 text-[#2D6A4F] px-2 py-0.5 rounded-full">
                      {(course as any).sanaweyaSubject}
                    </span>
                  )}
                  <h3 className="font-bold text-sm text-[#1B1B1B] line-clamp-2">{course.title}</h3>
                  <p className="text-sm font-black text-[#1B1B1B]">{course.price} ج.م</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Filter Drawer */}
      {showMobileFilter && (
        <div className="fixed inset-0 z-50 flex justify-end lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setShowMobileFilter(false)}
          />
          <div className="relative w-full max-w-xs bg-white h-full p-6 overflow-y-auto space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-base">Filter Courses</h3>
              <button
                onClick={() => setShowMobileFilter(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Categories */}
            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                Subject
              </label>
              <div className="space-y-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between ${
                      selectedCategory === cat ? 'bg-[#2D6A4F] text-white' : 'text-gray-600'
                    }`}
                  >
                    <span>{cat}</span>
                    {selectedCategory === cat && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile Price */}
            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                Price
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-[#F8FAF9] p-1.5 rounded-xl border border-gray-100">
                {(['all', 'free', 'paid'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedPrice(p)}
                    className={`py-1.5 text-xs font-bold capitalize rounded-lg ${
                      selectedPrice === p ? 'bg-white text-[#2D6A4F] shadow-2xs' : 'text-gray-500'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowMobileFilter(false)}
              className="w-full py-2.5 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold shadow-sm"
            >
              Apply Filters ({filteredCourses.length} courses)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
