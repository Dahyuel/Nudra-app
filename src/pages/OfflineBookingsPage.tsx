import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Clock3, MapPin, RefreshCw, Ticket, Users, XCircle } from 'lucide-react';
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
  sessionId: string;
};

const panel = 'rounded-2xl border border-gray-100 bg-white shadow-sm';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#2D6A4F] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#24583f] disabled:cursor-not-allowed disabled:opacity-50';

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function getErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || fallback;
}

export const OfflineBookingsPage: React.FC = () => {
  const { user } = useAuth();
  const client = useQueryClient();
  const [activeTab, setActiveTab] = useState<'sessions' | 'bookings'>('sessions');
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
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

  const sessionsQuery = useQuery({
    queryKey: ['offline-course-sessions', realmKey, expandedCourse],
    queryFn: async () => (await api.get<{ sessions: Session[] }>('/api/bookings/sessions', { params: { courseId: expandedCourse } })).data.sessions,
    enabled: Boolean(expandedCourse),
  });

  const bookingMutation = useMutation({
    mutationFn: async (sessionId: string) => (await api.post(`/api/bookings/sessions/${sessionId}/book`)).data,
    onSuccess: async (result) => {
      setError('');
      setNotice(result.booking?.status === 'waitlisted' ? 'You’re on the waitlist. Your position is shown in My bookings.' : 'Your seat is confirmed.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['my-offline-bookings', realmKey] }),
        client.invalidateQueries({ queryKey: ['offline-course-sessions', realmKey] }),
      ]);
    },
    onError: (mutationError) => { setNotice(''); setError(getErrorMessage(mutationError, 'Could not book this session. Please try again.')); },
  });

  const cancelMutation = useMutation({
    mutationFn: async (sessionId: string) => (await api.delete(`/api/bookings/sessions/${sessionId}/book`)).data,
    onSuccess: async () => {
      setError('');
      setNotice('Booking cancelled. If a seat opened, the next learner on the waitlist may have been promoted.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['my-offline-bookings', realmKey] }),
        client.invalidateQueries({ queryKey: ['offline-course-sessions', realmKey] }),
      ]);
    },
    onError: (mutationError) => { setNotice(''); setError(getErrorMessage(mutationError, 'Could not cancel this booking. Please try again.')); },
  });

  const courses = coursesQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];
  const bookedSessionIds = useMemo(() => new Set(bookings.map((booking) => booking.sessionId)), [bookings]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in duration-200">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#2D6A4F]">In-person learning</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#1B1B1B]">Offline course bookings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">Choose a scheduled session, reserve an available seat, or join its waitlist when it’s full.</p>
        </div>
        <div className="flex gap-2 rounded-xl border border-gray-100 bg-white p-1 shadow-sm" role="tablist" aria-label="Booking sections">
          <button role="tab" aria-selected={activeTab === 'sessions'} onClick={() => setActiveTab('sessions')} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeTab === 'sessions' ? 'bg-[#2D6A4F] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Find sessions</button>
          <button role="tab" aria-selected={activeTab === 'bookings'} onClick={() => setActiveTab('bookings')} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeTab === 'bookings' ? 'bg-[#2D6A4F] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>My bookings <span className="ml-1 rounded-full bg-black/5 px-1.5 py-0.5 text-xs">{bookings.length}</span></button>
        </div>
      </header>

      {(error || notice) && <div className={`${panel} flex items-start gap-3 p-4 ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`} role={error ? 'alert' : 'status'}>
        {error ? <XCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
        <p className="text-sm leading-6">{error || notice}</p>
        <button className="ml-auto text-xs font-bold underline" onClick={() => { setError(''); setNotice(''); }}>Dismiss</button>
      </div>}

      {activeTab === 'sessions' ? (
        <section className="space-y-4" aria-label="Available offline courses">
          {coursesQuery.isLoading ? <div className={`${panel} grid min-h-48 place-items-center text-sm text-gray-500`}><span className="inline-flex items-center gap-2"><RefreshCw size={16} className="animate-spin" />Loading offline courses…</span></div> : coursesQuery.error ? <div className={`${panel} p-6`} role="alert"><p className="font-bold text-gray-900">Courses could not be loaded</p><p className="mt-2 text-sm text-gray-600">{getErrorMessage(coursesQuery.error, 'Check your connection and try again.')}</p><button className={`${primaryButton} mt-4`} onClick={() => void coursesQuery.refetch()}>Try again</button></div> : courses.length === 0 ? <div className={`${panel} px-6 py-12 text-center`}><CalendarDays className="mx-auto text-gray-300" size={30} /><h2 className="mt-3 font-bold text-gray-900">No offline courses available yet</h2><p className="mt-2 text-sm text-gray-500">Published in-person courses will appear here when they have upcoming sessions.</p></div> : courses.map((course) => {
            const expanded = expandedCourse === course.id;
            const sessions = expanded ? sessionsQuery.data ?? [] : [];
            return <article key={course.id} className={`${panel} overflow-hidden`}>
              <div className="flex flex-col gap-4 p-5 sm:flex-row">
                {course.thumbnail && <img src={course.thumbnail} alt="" loading="lazy" className="aspect-video w-full rounded-xl object-cover sm:h-32 sm:w-48" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#2D6A4F]"><span className="rounded-md bg-emerald-50 px-2 py-1">{course.category}</span><span className="text-gray-500">{course.level}</span></div>
                  <h2 className="mt-2 text-lg font-bold text-gray-900">{course.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-600">{course.description}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500"><span>Instructor: {course.instructor.name}</span>{course.location && <span className="inline-flex items-center gap-1"><MapPin size={13} />{course.location}</span>}{course.scheduleText && <span>{course.scheduleText}</span>}</div>
                </div>
                <div className="flex shrink-0 flex-row items-center justify-between gap-3 border-t border-gray-100 pt-3 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                  <span className="text-sm font-extrabold text-gray-900">{course.price > 0 ? `${course.price.toLocaleString()} EGP` : 'Free'}</span>
                  <button aria-expanded={expanded} onClick={() => { setError(''); setNotice(''); setExpandedCourse(expanded ? null : course.id); }} className="rounded-xl border border-[#2D6A4F] px-4 py-2 text-sm font-bold text-[#2D6A4F] hover:bg-emerald-50">{expanded ? 'Hide sessions' : 'View sessions'}</button>
                </div>
              </div>
              {expanded && <div className="border-t border-gray-100 bg-[#F8FAF9] p-5">
                {course.price > 0 && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This paid course is listed, but online payment for offline bookings isn’t enabled yet. You can’t reserve a paid session here.</p>}
                {sessionsQuery.isLoading ? <p className="inline-flex items-center gap-2 text-sm text-gray-500"><RefreshCw size={15} className="animate-spin" />Loading upcoming sessions…</p> : sessionsQuery.error ? <div className="text-sm text-red-700">{getErrorMessage(sessionsQuery.error, 'Sessions could not be loaded.')}</div> : sessions.length === 0 ? <p className="text-sm text-gray-500">No upcoming sessions are scheduled for this course.</p> : <div className="space-y-3">{sessions.map((session) => {
                  const seats = Number(session.seatsAvailable);
                  const alreadyBooked = bookedSessionIds.has(session.id);
                  const bookingBusy = bookingMutation.isPending && bookingMutation.variables === session.id;
                  return <div key={session.id} className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="flex items-center gap-2 text-sm font-bold text-gray-900"><CalendarDays size={16} className="text-[#2D6A4F]" />{formatDate(session.startsAt)}</p><p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500"><span className="inline-flex items-center gap-1"><Clock3 size={13} />Ends {formatDate(session.endsAt)}</span><span className="inline-flex items-center gap-1"><MapPin size={13} />{session.location}</span><span className="inline-flex items-center gap-1"><Users size={13} />{seats > 0 ? `${seats} ${seats === 1 ? 'seat' : 'seats'} available` : 'Full · waitlist open'}</span></p></div>
                    {alreadyBooked ? <span className="inline-flex items-center gap-1 self-start rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><CheckCircle2 size={14} />Already booked</span> : <button disabled={course.price > 0 || bookingBusy} className={primaryButton} onClick={() => { setError(''); setNotice(''); bookingMutation.mutate(session.id); }}><Ticket size={15} />{bookingBusy ? 'Booking…' : seats > 0 ? 'Reserve a seat' : 'Join waitlist'}</button>}
                  </div>;
                })}</div>}
              </div>}
            </article>;
          })}
        </section>
      ) : (
        <section className="space-y-3" aria-label="My bookings">
          {bookingsQuery.isLoading ? <div className={`${panel} grid min-h-40 place-items-center text-sm text-gray-500`}>Loading your bookings…</div> : bookingsQuery.error ? <div className={`${panel} p-6 text-sm text-red-700`} role="alert">{getErrorMessage(bookingsQuery.error, 'Your bookings could not be loaded.')}</div> : bookings.length === 0 ? <div className={`${panel} px-6 py-12 text-center`}><Ticket className="mx-auto text-gray-300" size={30} /><h2 className="mt-3 font-bold text-gray-900">No active bookings</h2><p className="mt-2 text-sm text-gray-500">When you book a session or join a waitlist, it will show here.</p><button onClick={() => setActiveTab('sessions')} className="mt-4 text-sm font-bold text-[#2D6A4F]">Find an offline session</button></div> : bookings.map((booking) => {
            const cancelling = cancelMutation.isPending && cancelMutation.variables === booking.sessionId;
            const waitlisted = booking.status === 'waitlisted';
            return <article key={booking.id} className={`${panel} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-gray-900">{booking.courseTitle}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${waitlisted ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{waitlisted ? `Waitlist${booking.waitlistPosition ? ` · #${booking.waitlistPosition}` : ''}` : 'Seat confirmed'}</span></div><p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500"><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{formatDate(booking.startsAt)}</span><span className="inline-flex items-center gap-1"><MapPin size={13} />{booking.location}</span></p></div>
              <button disabled={cancelling} onClick={() => { if (!window.confirm(`Cancel your ${waitlisted ? 'waitlist spot' : 'booking'} for “${booking.courseTitle}”?`)) return; setError(''); setNotice(''); cancelMutation.mutate(booking.sessionId); }} className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 sm:self-auto"><XCircle size={16} />{cancelling ? 'Cancelling…' : waitlisted ? 'Leave waitlist' : 'Cancel booking'}</button>
            </article>;
          })}
        </section>
      )}
    </div>
  );
};
