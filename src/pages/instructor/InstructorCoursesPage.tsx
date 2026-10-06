import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Edit3, Eye, EyeOff, Globe, Trash2, AlertTriangle } from 'lucide-react';
import { useInstructorCourses } from '../../hooks/useInstructorCourses';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { OfflineCourseSessionManager } from './OfflineCourseSessionManager';

type CourseRow = ReturnType<typeof useInstructorCourses>['courses'][number];

export const InstructorCoursesPage: React.FC = () => {
  const { courses, isLoading, error } = useInstructorCourses();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CourseRow | null>(null);
  const orgQuery = user?.organizationContext ? `?org=${encodeURIComponent(user.organizationContext.slug)}` : '';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });

  const togglePublished = async (course: CourseRow) => {
    setBusyId(course.id);
    setActionError(null);
    try {
      await api.post(`/api/instructor/courses/${course.id}/${course.isPublished ? 'unpublish' : 'publish'}`);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Could not update the course.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteCourse = async (course: CourseRow) => {
    setBusyId(course.id);
    setActionError(null);
    try {
      await api.delete(`/api/instructor/courses/${course.id}`);
      setConfirmDelete(null);
      await refresh();
    } catch (err: any) {
      setConfirmDelete(null);
      setActionError(err?.response?.data?.message || 'Could not delete the course.');
    } finally {
      setBusyId(null);
    }
  };

  const statusOf = (course: CourseRow) =>
    course.approvalStatus === 'pending'
      ? { label: 'waiting for organization approval', className: 'bg-blue-100 text-blue-800' }
      : course.approvalStatus === 'rejected'
        ? { label: 'rejected by organization', className: 'bg-red-100 text-red-800' }
        : course.isPublished
      ? { label: 'published', className: 'bg-emerald-100 text-emerald-800' }
      : course.enrollmentCount > 0
        ? { label: 'unpublished', className: 'bg-gray-100 text-gray-700' }
        : { label: 'draft', className: 'bg-amber-100 text-amber-800' };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">My Courses</h1>
          <p className="text-sm text-[#6B7280] mt-1">Manage your published and draft masterclasses</p>
        </div>

        <Link
          to={`/instructor/upload${orgQuery}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Course</span>
        </Link>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-bold underline">
            Dismiss
          </button>
        </div>
      )}

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
              {!isLoading && error && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-red-600 font-semibold">
                    Could not load your courses.{' '}
                    <button onClick={refresh} className="underline">
                      Try again
                    </button>
                  </td>
                </tr>
              )}
              {!isLoading && !error && courses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 italic">
                    No courses yet. Create your first course to get started.
                  </td>
                </tr>
              )}
              {!isLoading &&
                courses.map((course) => {
                  const status = statusOf(course);
                  const busy = busyId === course.id;
                  return (
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
                      <td className="py-4 px-3 font-black text-gray-900">{course.revenue.toLocaleString()} EGP</td>
                      <td className="py-4 px-3">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-4 px-2">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {course.approvalStatus === 'approved' && <button
                            onClick={() => navigate(`/instructor/upload${orgQuery ? `${orgQuery}&` : '?'}edit=${encodeURIComponent(course.id)}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>}
                          <button
                            onClick={() => navigate(`/course/${course.id}${orgQuery}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9] transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                          {course.approvalStatus === 'approved' && <button
                            onClick={() => togglePublished(course)}
                            disabled={busy}
                            title={
                              course.isPublished
                                ? 'Hide from the catalog. Enrolled students keep access.'
                                : 'Show this course in the catalog'
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9] transition-colors disabled:opacity-50"
                          >
                            {course.isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                            <span>{course.isPublished ? 'Unpublish' : 'Publish'}</span>
                          </button>}
                          <button
                            onClick={() => setConfirmDelete(course)}
                            disabled={busy || course.enrollmentCount > 0}
                            title={
                              course.enrollmentCount > 0
                                ? "Courses with enrolled students can't be deleted. Unpublish it instead."
                                : 'Delete this course permanently'
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {courses.some((course) => course.deliveryMode === 'offline' && course.approvalStatus === 'approved') && <section className="space-y-4" aria-label="Offline course schedule management">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">Offline course sessions</h2>
          <p className="mt-1 text-sm text-gray-500">Schedule bookable dates for your approved offline courses, including courses in your organization.</p>
        </div>
        {courses.filter((course) => course.deliveryMode === 'offline' && course.approvalStatus === 'approved').map((course) => (
          <OfflineCourseSessionManager key={course.id} course={course} />
        ))}
      </section>}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => busyId || setConfirmDelete(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-course-title"
            className="relative w-full max-w-md rounded-2xl bg-white border border-gray-100 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 id="delete-course-title" className="font-bold text-base text-[#1B1B1B]">
                  Delete "{confirmDelete.title}"?
                </h2>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  This permanently removes the course, its lessons, videos, quizzes and community posts. It can't be
                  undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={!!busyId}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9]"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteCourse(confirmDelete)}
                disabled={!!busyId}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-60"
              >
                {busyId ? 'Deleting...' : 'Delete course'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
