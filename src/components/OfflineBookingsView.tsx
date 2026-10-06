import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, CreditCard, MapPin, Ticket, Users, Wallet, XCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

type OfflineCourse = {
  id: string;
  title: string;
  titleAr: string | null;
  description: string;
  thumbnail: string | null;
  category: string;
  level: string;
  price: number;
  location: string | null;
  scheduleText: string | null;
  instructor: { name: string; avatar: string | null };
};

type Session = {
  id: string;
  courseId: string;
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: number;
  status: string;
  seatsAvailable: number;
};

type PaymentMethod = 'online' | 'offline';
type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'waived';

type Booking = {
  id: string;
  status: 'confirmed' | 'waitlisted';
  waitlistPosition: number | null;
  bookedAt: string;
  startsAt: string;
  endsAt: string;
  location: string;
  courseId: string;
  courseTitle: string;
  coursePrice: number | string | null;
  sessionId: string;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
};

const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  paid: 'bg-emerald-50 text-emerald-800',
  refunded: 'bg-gray-100 text-gray-700',
  waived: 'bg-gray-100 text-gray-700',
};
const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Payment pending',
  paid: 'Paid',
  refunded: 'Refunded',
  waived: 'Waived',
};

const cardClass = 'rounded-2xl p-6 bg-white border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all group';
const emptyClass = 'rounded-2xl p-8 bg-white border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center';
const primaryButton = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#24583f] text-white text-xs font-bold shadow-2xs transition-all disabled:cursor-not-allowed disabled:opacity-50';

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function getErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || fallback;
}

const CourseThumb: React.FC<{ courseId: string; title: string; thumbnail: string | null | undefined }> = ({ courseId, title, thumbnail }) => (
  <Link
    to={`/course/${courseId}`}
    className="w-24 h-24 rounded-2xl overflow-hidden shadow-2xs group-hover:scale-102 transition-transform shrink-0 block"
  >
    {thumbnail ? (
      <img src={thumbnail} alt={title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
    ) : (
      <span className="w-full h-full bg-[#B7E4C7]/30 text-[#2D6A4F] flex items-center justify-center">
        <CalendarDays className="w-8 h-8" />
      </span>
    )}
  </Link>
);

const CourseHeading: React.FC<{ courseId: string; title: string; course: OfflineCourse | undefined }> = ({ courseId, title, course }) => (
  <div className="flex-1 min-w-0">
    {course && (
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-bold text-[#2D6A4F] bg-[#B7E4C7]/30 px-2 py-0.5 rounded-md">
          {course.category}
        </span>
        <span className="text-[11px] text-gray-400 font-semibold">{course.level}</span>
      </div>
    )}
    <Link
      to={`/course/${courseId}`}
      className="font-bold text-base text-[#1B1B1B] hover:text-[#2D6A4F] transition-colors leading-snug line-clamp-2 block"
    >
      {title}
    </Link>
    {course && <p className="text-xs text-gray-500 mt-1">Instructor: {course.instructor.name}</p>}
  </div>
);

const SkeletonCards: React.FC = () => (
  <>
    {[0, 1].map((i) => (
      <div key={i} className="h-64 rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse" />
    ))}
  </>
);

type PendingBooking = { session: Session; course: OfflineCourse };

type PendingLeave = { courseId: string; courseTitle: string; upcomingSessions: number };

type PendingCancelBooking = { sessionId: string; courseTitle: string; startsAt: string; waitlisted: boolean };

type OfflineEnrollment = {
  id: string;
  enrolledAt: string;
  status: 'active' | 'cancelled';
  courseId: string;
  courseTitle: string;
  coursePrice: number | string | null;
  courseLocation: string | null;
  scheduleText: string | null;
  thumbnail: string | null;
  category: string | null;
  instructorName: string;
  upcomingSessions: number;
  nextSessionAt: string | null;
};

const OfflineBookingsView: React.FC = () => {
  const { user } = useAuth();
  const client = useQueryClient();
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingBooking | null>(null);
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null);
  const [pendingCancel, setPendingCancel] = useState<PendingCancelBooking | null>(null);
  const realmKey = user?.organizationContext?.id ?? 'global';

  const coursesQuery = useQuery({
    queryKey: ['offline-booking-courses', realmKey],
    queryFn: async () => {
      const { data } = await api.get<{ courses: OfflineCourse[] }>('/api/courses', { params: { limit: 100 } });
      return data.courses.filter((course: any) => course.deliveryMode === 'offline');
    },
  });

  const bookingsQuery = useQuery({
    queryKey: ['my-offline-bookings', realmKey],
    queryFn: async () => (await api.get<{ bookings: Booking[] }>('/api/bookings/mine')).data.bookings,
  });

  const enrollmentsQuery = useQuery({
    queryKey: ['my-offline-enrollments', realmKey],
    queryFn: async () => (await api.get<{ enrollments: OfflineEnrollment[] }>('/api/bookings/mine/enrollments')).data.enrollments,
  });

  const sessionsQuery = useQuery({
    queryKey: ['offline-course-sessions', realmKey, expandedCourse],
    queryFn: async () => (await api.get<{ sessions: Session[] }>('/api/bookings/sessions', { params: { courseId: expandedCourse } })).data.sessions,
    enabled: Boolean(expandedCourse),
  });

  const invalidateBookings = () => Promise.all([
    client.invalidateQueries({ queryKey: ['my-offline-bookings', realmKey] }),
    client.invalidateQueries({ queryKey: ['my-offline-enrollments', realmKey] }),
    client.invalidateQueries({ queryKey: ['offline-course-sessions', realmKey] }),
  ]);

  const leaveEnrollment = useMutation({
    mutationFn: async (courseId: string) => (await api.delete(`/api/courses/${courseId}/enroll`)).data,
    onSuccess: async () => {
      setError('');
      setNotice('You left this course. Any upcoming sessions you had are cancelled.');
      setPendingLeave(null);
      await invalidateBookings();
    },
    onError: (mutationError) => { setNotice(''); setError(getErrorMessage(mutationError, 'Could not leave this course. Please try again.')); },
  });

  const bookingMutation = useMutation({
    mutationFn: async ({ sessionId, paymentMethod }: { sessionId: string; paymentMethod: PaymentMethod }) =>
      (await api.post(`/api/bookings/sessions/${sessionId}/book`, { paymentMethod })).data,
    onSuccess: async (result) => {
      setError('');
      const booking = result.booking;
      const paidOnline = booking?.paymentMethod === 'online' && booking?.paymentStatus === 'paid';
      if (booking?.status === 'waitlisted') {
        setNotice('You’re on the waitlist. Your position is shown in My bookings.');
      } else if (paidOnline) {
        setNotice('Your seat is confirmed and payment is recorded.');
      } else {
        setNotice('Your seat is confirmed. Please pay at the venue — the instructor will mark you as paid.');
      }
      setPending(null);
      await invalidateBookings();
    },
    onError: (mutationError) => { setNotice(''); setError(getErrorMessage(mutationError, 'Could not book this session. Please try again.')); },
  });

  const cancelMutation = useMutation({
    mutationFn: async (sessionId: string) => (await api.delete(`/api/bookings/sessions/${sessionId}/book`)).data,
    onSuccess: async () => {
      setError('');
      setNotice('Booking cancelled. If a seat opened, the next learner on the waitlist may have been promoted.');
      setPendingCancel(null);
      await invalidateBookings();
    },
    onError: (mutationError) => { setNotice(''); setError(getErrorMessage(mutationError, 'Could not cancel this booking. Please try again.')); },
  });

  const courses = coursesQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];
  const enrollments = enrollmentsQuery.data ?? [];
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const bookedSessionIds = useMemo(() => new Set(bookings.map((booking) => booking.sessionId)), [bookings]);
  const enrolledCourseIds = useMemo(() => new Set(enrollments.map((enrollment) => enrollment.courseId)), [enrollments]);

  const clearMessages = () => { setError(''); setNotice(''); };

  return (
    <div className="space-y-8">
      {(error || notice) && (
        <div
          className={`rounded-2xl border shadow-sm flex items-start gap-3 p-4 ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
          role={error ? 'alert' : 'status'}
        >
          {error ? <XCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
          <p className="text-sm leading-6">{error || notice}</p>
          <button className="ml-auto text-xs font-bold underline" onClick={clearMessages}>Dismiss</button>
        </div>
      )}

      <section className="space-y-4" aria-label="My enrolled courses">
        <h2 className="text-lg font-extrabold text-[#1B1B1B] tracking-tight">My enrolled courses</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {enrollmentsQuery.isLoading && <SkeletonCards />}

          {enrollmentsQuery.error && (
            <div className={emptyClass} role="alert">
              <XCircle className="w-8 h-8 text-red-300 mb-2" />
              <p className="text-sm font-semibold text-red-700">{getErrorMessage(enrollmentsQuery.error, 'Your enrolled courses could not be loaded.')}</p>
            </div>
          )}

          {!enrollmentsQuery.isLoading && !enrollmentsQuery.error && enrollments.length === 0 && (
            <div className={emptyClass}>
              <Ticket className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-sm font-bold text-gray-600">You're not enrolled in any offline course yet</p>
              <p className="text-xs text-gray-500 mt-1">Enroll from a course page to be rostered on every weekly session automatically. Or pick a single session below.</p>
            </div>
          )}

          {!enrollmentsQuery.isLoading && enrollments.map((enrollment) => {
            const leaving = leaveEnrollment.isPending && leaveEnrollment.variables === enrollment.courseId;
            const price = Number(enrollment.coursePrice ?? 0);
            return (
              <article key={enrollment.id} className={cardClass}>
                <div>
                  <div className="flex items-start gap-4 mb-4">
                    <CourseThumb courseId={enrollment.courseId} title={enrollment.courseTitle} thumbnail={enrollment.thumbnail} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {enrollment.category && <span className="text-[11px] font-bold text-[#2D6A4F] bg-[#B7E4C7]/30 px-2 py-0.5 rounded-md">{enrollment.category}</span>}
                        <span className="text-[11px] text-gray-400 font-semibold">Semester enrollment</span>
                      </div>
                      <Link to={`/course/${enrollment.courseId}`} className="font-bold text-base text-[#1B1B1B] hover:text-[#2D6A4F] transition-colors leading-snug line-clamp-2 block">
                        {enrollment.courseTitle}
                      </Link>
                      <p className="text-xs text-gray-500 mt-1">Instructor: {enrollment.instructorName}</p>
                    </div>
                  </div>

                  <div className="bg-[#F8FAF9] p-3 rounded-xl mb-4 border border-gray-100 space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Next session</p>
                    <p className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                      <CalendarDays className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" />
                      {enrollment.nextSessionAt ? formatDate(enrollment.nextSessionAt) : 'No upcoming session scheduled yet'}
                    </p>
                    {enrollment.courseLocation && (
                      <p className="flex items-center gap-1.5 text-xs text-gray-500">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{enrollment.courseLocation}</span>
                      </p>
                    )}
                    <p className="text-[11px] text-gray-500">
                      {enrollment.upcomingSessions} upcoming {enrollment.upcomingSessions === 1 ? 'session' : 'sessions'} on your roster
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                  <span className="text-xs font-bold text-gray-700">{price > 0 ? `${price.toLocaleString()} EGP` : 'Free'}</span>
                  <button
                    disabled={leaving}
                    onClick={() => {
                      clearMessages();
                      setPendingLeave({
                        courseId: enrollment.courseId,
                        courseTitle: enrollment.courseTitle,
                        upcomingSessions: enrollment.upcomingSessions,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {leaving ? 'Leaving…' : 'Leave this course'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-4" aria-label="My drop-in bookings">
        <h2 className="text-lg font-extrabold text-[#1B1B1B] tracking-tight">My drop-in bookings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {bookingsQuery.isLoading && <SkeletonCards />}

          {bookingsQuery.error && (
            <div className={emptyClass} role="alert">
              <XCircle className="w-8 h-8 text-red-300 mb-2" />
              <p className="text-sm font-semibold text-red-700">{getErrorMessage(bookingsQuery.error, 'Your bookings could not be loaded.')}</p>
              <button className={`${primaryButton} mt-4`} onClick={() => void bookingsQuery.refetch()}>Try again</button>
            </div>
          )}

          {!bookingsQuery.isLoading && !bookingsQuery.error && bookings.length === 0 && (
            <div className={emptyClass}>
              <CalendarDays className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-sm font-bold text-gray-600">No drop-in bookings yet</p>
              <p className="text-xs text-gray-500 mt-1">Enroll in a course above for the whole semester, or pick a single session below.</p>
            </div>
          )}

          {!bookingsQuery.isLoading && bookings.map((booking) => {
            const course = courseById.get(booking.courseId);
            const waitlisted = booking.status === 'waitlisted';
            const cancelling = cancelMutation.isPending && cancelMutation.variables === booking.sessionId;
            return (
              <article key={booking.id} className={cardClass}>
                <div>
                  <div className="flex items-start gap-4 mb-4">
                    <CourseThumb courseId={booking.courseId} title={booking.courseTitle} thumbnail={course?.thumbnail} />
                    <CourseHeading courseId={booking.courseId} title={booking.courseTitle} course={course} />
                  </div>

                  <div className="bg-[#F8FAF9] p-3 rounded-xl mb-4 border border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Session details</p>
                    <p className="flex items-center gap-1.5 text-xs font-bold text-gray-800 mt-0.5">
                      <CalendarDays className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" />
                      {formatDate(booking.startsAt)}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{booking.location}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-gray-50">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${waitlisted ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                      {waitlisted ? `Waitlist${booking.waitlistPosition ? ` · #${booking.waitlistPosition}` : ''}` : 'Seat confirmed'}
                    </span>
                    {booking.paymentStatus && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${PAYMENT_STATUS_STYLE[booking.paymentStatus]}`}>
                        {booking.paymentMethod === 'online' ? <CreditCard className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
                        {PAYMENT_STATUS_LABEL[booking.paymentStatus]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700">
                      {Number(booking.coursePrice ?? 0) > 0 ? `${Number(booking.coursePrice).toLocaleString()} EGP` : 'Free'}
                    </span>
                    <button
                      disabled={cancelling}
                      onClick={() => {
                        clearMessages();
                        setPendingCancel({
                          sessionId: booking.sessionId,
                          courseTitle: booking.courseTitle,
                          startsAt: booking.startsAt,
                          waitlisted,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold transition-all disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {cancelling ? 'Cancelling…' : waitlisted ? 'Leave waitlist' : 'Cancel booking'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-4" aria-label="Find a session">
        <h2 className="text-lg font-extrabold text-[#1B1B1B] tracking-tight">Find a session</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {coursesQuery.isLoading && <SkeletonCards />}

          {coursesQuery.error && (
            <div className={emptyClass} role="alert">
              <XCircle className="w-8 h-8 text-red-300 mb-2" />
              <p className="text-sm font-bold text-gray-900">Courses could not be loaded</p>
              <p className="text-xs text-gray-500 mt-1">{getErrorMessage(coursesQuery.error, 'Check your connection and try again.')}</p>
              <button className={`${primaryButton} mt-4`} onClick={() => void coursesQuery.refetch()}>Try again</button>
            </div>
          )}

          {!coursesQuery.isLoading && !coursesQuery.error && courses.length === 0 && (
            <div className={emptyClass}>
              <CalendarDays className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-sm font-bold text-gray-600">No offline courses available yet</p>
              <p className="text-xs text-gray-500 mt-1">Published in-person courses will appear here when they have upcoming sessions.</p>
            </div>
          )}

          {!coursesQuery.isLoading && courses.map((course) => {
            const expanded = expandedCourse === course.id;
            const sessions = expanded ? sessionsQuery.data ?? [] : [];
            const paid = course.price > 0;
            const alreadyEnrolled = enrolledCourseIds.has(course.id);
            return (
              <article key={course.id} className={cardClass}>
                <div>
                  <div className="flex items-start gap-4 mb-4">
                    <CourseThumb courseId={course.id} title={course.title} thumbnail={course.thumbnail} />
                    <CourseHeading courseId={course.id} title={course.title} course={course} />
                  </div>

                  {(course.location || course.scheduleText) && (
                    <div className="bg-[#F8FAF9] p-3 rounded-xl mb-4 border border-gray-100">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Schedule</p>
                      {course.scheduleText && <p className="text-xs font-bold text-gray-800 truncate mt-0.5">{course.scheduleText}</p>}
                      {course.location && (
                        <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{course.location}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                    <span className="text-xs font-bold text-gray-800">
                      {paid ? `${course.price.toLocaleString()} EGP` : 'Free'}
                    </span>
                    <button
                      aria-expanded={expanded}
                      onClick={() => { clearMessages(); setExpandedCourse(expanded ? null : course.id); }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#2D6A4F] text-[#2D6A4F] hover:bg-emerald-50 text-xs font-bold transition-all"
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      {expanded ? 'Hide sessions' : 'View sessions'}
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-4 space-y-3">
                      {sessionsQuery.isLoading ? (
                        <p className="text-xs text-gray-500">Loading upcoming sessions…</p>
                      ) : sessionsQuery.error ? (
                        <p className="text-xs text-red-700">{getErrorMessage(sessionsQuery.error, 'Sessions could not be loaded.')}</p>
                      ) : sessions.length === 0 ? (
                        <p className="text-xs text-gray-500">No upcoming sessions are scheduled for this course.</p>
                      ) : sessions.map((session) => {
                        const seats = Number(session.seatsAvailable);
                        const alreadyBooked = bookedSessionIds.has(session.id);
                        const bookingBusy = bookingMutation.isPending && bookingMutation.variables?.sessionId === session.id;
                        return (
                          <div key={session.id} className="bg-[#F8FAF9] p-3 rounded-xl border border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                                <CalendarDays className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" />
                                {formatDate(session.startsAt)}
                              </p>
                              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                                <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-gray-400" />{session.location}</span>
                                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5 text-gray-400" />{seats > 0 ? `${seats} ${seats === 1 ? 'seat' : 'seats'} available` : 'Full · waitlist open'}</span>
                              </p>
                            </div>
                            {alreadyEnrolled ? (
                              <span className="inline-flex items-center gap-1 self-start sm:self-auto rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5" />Enrolled this semester
                              </span>
                            ) : alreadyBooked ? (
                              <span className="inline-flex items-center gap-1 self-start sm:self-auto rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5" />Already booked
                              </span>
                            ) : (
                              <button
                                disabled={bookingBusy}
                                className={`${primaryButton} self-start sm:self-auto shrink-0`}
                                onClick={() => { clearMessages(); setPending({ session, course }); }}
                              >
                                <Ticket className="w-3.5 h-3.5" />
                                {bookingBusy ? 'Booking…' : seats > 0 ? 'Reserve a seat' : 'Join waitlist'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {pending && (
        <PaymentMethodModal
          pending={pending}
          busy={bookingMutation.isPending}
          onCancel={() => setPending(null)}
          onConfirm={(paymentMethod) => bookingMutation.mutate({ sessionId: pending.session.id, paymentMethod })}
        />
      )}

      {pendingLeave && (
        <LeaveCourseModal
          pending={pendingLeave}
          busy={leaveEnrollment.isPending}
          onCancel={() => setPendingLeave(null)}
          onConfirm={() => leaveEnrollment.mutate(pendingLeave.courseId)}
        />
      )}

      {pendingCancel && (
        <CancelBookingModal
          pending={pendingCancel}
          busy={cancelMutation.isPending}
          onCancel={() => setPendingCancel(null)}
          onConfirm={() => cancelMutation.mutate(pendingCancel.sessionId)}
        />
      )}
    </div>
  );
};

const CancelBookingModal: React.FC<{
  pending: PendingCancelBooking;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ pending, busy, onCancel, onConfirm }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Cancel booking">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-full bg-red-50 p-2 text-red-700"><XCircle className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-extrabold text-[#1B1B1B]">
            {pending.waitlisted ? 'Leave the waitlist?' : 'Cancel this booking?'}
          </h3>
          <p className="mt-1 text-sm text-gray-600 leading-relaxed">
            {pending.waitlisted ? 'Leaving the waitlist for' : 'Cancelling your seat in'}{' '}
            <span className="font-bold text-gray-900">{pending.courseTitle}</span>.
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-[#F8FAF9] border border-gray-100 p-3 text-xs text-gray-700 space-y-1">
        <p className="flex items-center gap-1.5 font-bold text-gray-800">
          <CalendarDays className="w-3.5 h-3.5 text-[#2D6A4F]" />{formatDate(pending.startsAt)}
        </p>
        <p className="text-xs text-gray-500 leading-relaxed">
          {pending.waitlisted
            ? 'Your waitlist position will be released and reassigned to the next learner in line.'
            : 'Your seat will be released; if anyone is on the waitlist they will be promoted automatically.'}
        </p>
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Keep my booking</button>
        <button type="button" onClick={onConfirm} disabled={busy} className="rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
          {busy ? 'Cancelling…' : pending.waitlisted ? 'Yes, leave the waitlist' : 'Yes, cancel booking'}
        </button>
      </div>
    </div>
  </div>
);

const LeaveCourseModal: React.FC<{
  pending: PendingLeave;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ pending, busy, onCancel, onConfirm }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Leave this course">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-full bg-red-50 p-2 text-red-700"><XCircle className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-extrabold text-[#1B1B1B]">Leave this course?</h3>
          <p className="mt-1 text-sm text-gray-600 leading-relaxed">
            You're about to leave <span className="font-bold text-gray-900">{pending.courseTitle}</span>.
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-red-50/70 border border-red-100 p-3 text-xs text-red-900 leading-relaxed">
        {pending.upcomingSessions > 0 ? (
          <>Your <strong>{pending.upcomingSessions} upcoming {pending.upcomingSessions === 1 ? 'session' : 'sessions'}</strong> on this roster will be cancelled, and any seats you free up will be offered to the waitlist.</>
        ) : (
          <>You have no upcoming sessions on this course. Leaving will mark your enrollment as cancelled.</>
        )}
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Keep my enrollment</button>
        <button type="button" onClick={onConfirm} disabled={busy} className="rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
          {busy ? 'Leaving…' : 'Yes, leave the course'}
        </button>
      </div>
    </div>
  </div>
);

const PaymentMethodModal: React.FC<{
  pending: PendingBooking;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (method: PaymentMethod) => void;
}> = ({ pending, busy, onCancel, onConfirm }) => {
  const { session, course } = pending;
  const paid = course.price > 0;
  const [method, setMethod] = useState<PaymentMethod>(paid ? 'offline' : 'offline');
  const priceLabel = paid ? `${course.price.toLocaleString()} EGP` : 'Free';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Choose payment method">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-extrabold text-[#1B1B1B]">Confirm your booking</h3>
        <p className="mt-1 text-xs text-gray-500">{course.title}</p>
        <div className="mt-4 rounded-xl bg-[#F8FAF9] p-3 border border-gray-100 text-xs text-gray-700 space-y-1">
          <p className="flex items-center gap-1.5 font-bold text-gray-800">
            <CalendarDays className="w-3.5 h-3.5 text-[#2D6A4F]" />{formatDate(session.startsAt)}
          </p>
          <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" /><span className="truncate">{session.location}</span></p>
          <p className="font-bold text-gray-800">Price: {priceLabel}</p>
        </div>

        {paid ? (
          <fieldset className="mt-5 space-y-2">
            <legend className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">How do you want to pay?</legend>
            {([
              { value: 'online', title: 'Pay online now', desc: 'Marked paid immediately. (Online gateway is a stub for now.)', icon: CreditCard },
              { value: 'offline', title: 'Pay at the venue', desc: 'The instructor will mark you as paid when you pay in person.', icon: Wallet },
            ] as const).map((opt) => {
              const Icon = opt.icon;
              const active = method === opt.value;
              return (
                <label key={opt.value} className={`flex gap-3 rounded-xl border p-3 cursor-pointer transition-all ${active ? 'border-[#2D6A4F] bg-emerald-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="payment-method" className="mt-1 accent-[#2D6A4F]" checked={active} onChange={() => setMethod(opt.value)} />
                  <div className="flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900"><Icon className="w-4 h-4" />{opt.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              );
            })}
          </fieldset>
        ) : (
          <p className="mt-5 text-xs text-gray-500">This session is free. Confirming will reserve your seat.</p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => onConfirm(method)} disabled={busy} className="rounded-xl bg-[#2D6A4F] hover:bg-[#24583f] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            {busy ? 'Booking…' : paid ? (method === 'online' ? `Pay ${priceLabel} and book` : 'Reserve and pay at venue') : 'Confirm booking'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfflineBookingsView;
