import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Star, Edit3, Eye } from 'lucide-react';
import { useInstructorCourses } from '../../hooks/useInstructorCourses';

export const InstructorCoursesPage: React.FC = () => {
  const { courses, isLoading } = useInstructorCourses();
  const navigate = useNavigate();

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
            My Courses
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Manage your published and draft masterclasses
          </p>
        </div>

        <Link
          to="/instructor/upload"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Course</span>
        </Link>
      </div>

      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="pb-3 px-2">Course Title</th>
                <th className="pb-3 px-3">Students</th>
                <th className="pb-3 px-3">Rating</th>
                <th className="pb-3 px-3">Revenue (EGP)</th>
                <th className="pb-3 px-3">Status</th>
                <th className="pb-3 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-2"><div className="h-4 w-48 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-10 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-5 w-16 bg-gray-200 rounded-full" /></td>
                    <td className="py-4 px-2"><div className="h-7 w-24 bg-gray-200 rounded-xl ml-auto" /></td>
                  </tr>
                ))}
              {!isLoading && courses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 italic">
                    No courses yet. Create your first course to get started.
                  </td>
                </tr>
              )}
              {!isLoading && courses.map((course) => (
                <tr key={course.id} className="hover:bg-[#F8FAF9] transition-colors">
                  <td className="py-4 px-2 font-bold text-gray-900 max-w-xs truncate">
                    {course.title}
                    <span className="block text-[10px] text-gray-400 font-normal">
                      Updated {new Date(course.updatedAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="py-4 px-3 font-semibold text-gray-700">
                    {course.enrollmentCount.toLocaleString()} students
                  </td>
                  <td className="py-4 px-3">
                    {course.rating > 0 ? (
                      <span className="flex items-center gap-1 font-bold text-gray-900">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{course.rating}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">No ratings yet</span>
                    )}
                  </td>
                  <td className="py-4 px-3 font-black text-gray-900">
                    {course.revenue.toLocaleString()} EGP
                  </td>
                  <td className="py-4 px-3">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                        course.isPublished
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {course.isPublished ? 'published' : 'draft'}
                    </span>
                  </td>
                  <td className="py-4 px-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/instructor/upload?edit=${course.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => navigate(`/course/${course.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9] transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    </div>
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
