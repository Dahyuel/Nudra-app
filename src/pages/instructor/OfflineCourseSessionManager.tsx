import React, { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock3, CreditCard, Download, MapPin, Phone, Plus, Users, Wallet } from 'lucide-react';
import api from '../../lib/api';

interface OfflineCourseSessionManagerProps {
  course: { id: string; title: string; location: string | null };
}

interface CourseSession {
  id: string;
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: number;
  confirmedCount?: number;
  waitlistCount?: number;
  status: string;
}

type PaymentMethod = 'online' | 'offline';
type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'waived';

interface RosterRow {
  id: string;
  status: string;
  waitlistPosition: number | null;
  bookedAt: string;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  studyYear: string | null;
}

interface EnrollmentRow {
  id: string;
  enrolledAt: string;
  status: 'active' | 'cancelled';
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  studyYear: string | null;
  confirmedBookings: number;
  attendedCount: number;
  noShowCount: number;
  paidBookings: number;
  pendingBookings: number;
}

const inputClass = 'min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm';
const localDate = (value: string) => new Date(value).toLocaleString(undefined, {
  dateStyle: 'medium', timeStyle: 'short',
});

const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  paid: 'bg-emerald-50 text-emerald-800',
  refunded: 'bg-gray-100 text-gray-700',
  waived: 'bg-gray-100 text-gray-700',
};
const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded',
  waived: 'Waived',
};
const STUDY_YEAR_LABEL: Record<string, string> = {
  year1: '1st Secondary',
  year2: '2nd Secondary',
  year3: '3rd Secondary',
};

// Download a CSV by hitting the API with cookies and triggering a save.
// We don't use a plain <a href> because the axios instance adds the
// X-Organization-* headers the backend relies on for tenant resolution.
async function downloadCsv(url: string, filename: string) {
  const response = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export const OfflineCourseSessionManager: React.FC<OfflineCourseSessionManagerProps> = ({ course }) => {
  const queryClient = useQueryClient();
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [capacity, setCapacity] = useState('20');
  const [location, setLocation] = useState(course.location || '');
  const [formError, setFormError] = useState<string | null>(null);
  const [rosterSession, setRosterSession] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const queryKey = ['instructor-course-sessions', course.id];

  const sessionsQuery = useQuery({
    queryKey,
    queryFn: async () => (await api.get<{ sessions: CourseSession[] }>(`/api/bookings/manage/courses/${course.id}/sessions`)).data.sessions,
  });

  const enrollmentsQueryKey = ['instructor-course-enrollments', course.id];
  const enrollmentsQuery = useQuery({
    queryKey: enrollmentsQueryKey,
    queryFn: async () => (await api.get<{ enrollments: EnrollmentRow[] }>(`/api/bookings/manage/courses/${course.id}/enrollments`)).data.enrollments,
  });

  const rosterQuery = useQuery({
    queryKey: ['booking-roster', rosterSession],
    queryFn: async () => (await api.get<{ roster: RosterRow[] }>(`/api/bookings/sessions/${rosterSession}/roster`)).data.roster,
    enabled: Boolean(rosterSession),
  });

  const invalidateRoster = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['booking-roster', rosterSession] }),
    queryClient.invalidateQueries({ queryKey }),
  ]);

  const attendance = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: 'attended' | 'no_show' }) =>
      api.patch(`/api/bookings/sessions/${rosterSession}/roster/${bookingId}/attendance`, { status }),
    onSuccess: invalidateRoster,
  });

  const payment = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: PaymentStatus }) =>
      api.patch(`/api/bookings/sessions/${rosterSession}/roster/${bookingId}/payment`, { status }),
    onSuccess: invalidateRoster,
  });

  const createSession = useMutation({
    mutationFn: async () => {
      if (!startsAt || !endsAt || !Number.isInteger(Number(capacity)) || Number(capacity) < 1 || !location.trim()) {
        throw new Error('Enter a start and end time, a positive seat limit, and a location.');
      }
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || start <= new Date()) {
        throw new Error('Choose a future start time and an end time after it.');
      }
      return api.post(`/api/bookings/courses/${course.id}/sessions`, {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        capacity: Number(capacity),
        location: location.trim(),
      });
    },
    onSuccess: async () => {
      setStartsAt('');
      setEndsAt('');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: any) => {
      setFormError(error?.response?.data?.message || error?.message || 'Could not create this session.');
    },
  });

  const exportCourseCsv = async () => {
    setExportError(null);
    try {
      await downloadCsv(`/api/bookings/manage/courses/${course.id}/bookings.csv`, `course-bookings-${course.id}.csv`);
    } catch (error: any) {
      setExportError(error?.response?.data?.message || 'Could not export the course CSV.');
    }
  };

  const exportSessionCsv = async (sessionId: string) => {
    setExportError(null);
    try {
      await downloadCsv(`/api/bookings/sessions/${sessionId}/roster.csv`, `session-${sessionId}.csv`);
    } catch (error: any) {
      setExportError(error?.response?.data?.message || 'Could not export the session CSV.');
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    createSession.mutate();
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm" aria-label={`${course.title} sessions`}>
      <div className="flex items-start gap-3">
        <CalendarDays className="mt-0.5 shrink-0 text-emerald-800" size={19} />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-gray-900">{course.title} · offline sessions</h3>
          <p className="mt-1 text-sm text-gray-500">Create bookable dates and set each session’s capacity and location.</p>
        </div>
        <button type="button" onClick={() => void exportCourseCsv()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          <Download size={14} />Export all CSV
        </button>
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="grid gap-1 text-xs font-semibold text-gray-600">Starts
          <input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-gray-600">Ends
          <input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-gray-600">Seats
          <input required type="number" min="1" max="10000" step="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-gray-600">Location
          <input required maxLength={1000} value={location} onChange={(event) => setLocation(event.target.value)} className={inputClass} placeholder="Course location" />
        </label>
        <button type="submit" disabled={createSession.isPending} className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-60">
          <Plus size={16} />{createSession.isPending ? 'Adding…' : 'Add session'}
        </button>
      </form>

      {formError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
      {exportError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{exportError}</p>}

      {/* Semester enrollment roster: students who signed up for the whole course,
          not single sessions. Drop-ins live on each session's roster below. */}
      <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 shrink-0 text-emerald-800" size={17} />
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-gray-900 text-sm">Enrolled students (semester)</h4>
            <p className="mt-0.5 text-xs text-gray-600">Students who enrolled are auto-rostered on every future session. Drop-ins book single sessions and show up on each session's roster below.</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
            {enrollmentsQuery.data?.filter((e) => e.status === 'active').length ?? 0} active
          </span>
        </div>
        {enrollmentsQuery.isLoading ? (
          <p className="mt-3 text-sm text-gray-500">Loading enrollees…</p>
        ) : enrollmentsQuery.error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">Could not load enrollees. <button type="button" className="underline" onClick={() => void enrollmentsQuery.refetch()}>Retry</button></p>
        ) : enrollmentsQuery.data?.length ? (
          <div className="mt-3 divide-y divide-emerald-100 rounded-lg bg-white border border-emerald-100">
            {enrollmentsQuery.data.map((enrollment) => {
              const yearLabel = enrollment.studyYear ? (STUDY_YEAR_LABEL[enrollment.studyYear] ?? enrollment.studyYear) : null;
              return (
                <div key={enrollment.id} className={`flex flex-wrap items-center justify-between gap-3 p-3 text-sm ${enrollment.status === 'cancelled' ? 'opacity-60' : ''}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">{enrollment.studentName}</p>
                    <p className="text-xs text-gray-500">{enrollment.studentEmail}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Phone size={11} />{enrollment.studentPhone || <span className="italic text-gray-400">No phone on file</span>}
                      </span>
                      <span>Year: {yearLabel ?? <span className="italic text-gray-400">—</span>}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-gray-50 px-2 py-1 font-semibold text-gray-700">
                      {enrollment.status === 'cancelled' ? 'Left' : `${enrollment.confirmedBookings} upcoming`}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">{enrollment.attendedCount} attended</span>
                    {enrollment.noShowCount > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-800">{enrollment.noShowCount} no-show</span>}
                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">{enrollment.paidBookings} paid</span>
                    {enrollment.pendingBookings > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-800">{enrollment.pendingBookings} pending</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-white p-3 text-sm text-gray-500 border border-emerald-100">No students have enrolled this semester yet.</p>
        )}
      </div>

      {sessionsQuery.isLoading ? (
        <p className="mt-4 text-sm text-gray-500">Loading sessions…</p>
      ) : sessionsQuery.error ? (
        <div role="alert" className="mt-4 text-sm text-red-700">
          Could not load sessions. <button type="button" className="font-semibold underline" onClick={() => void sessionsQuery.refetch()}>Try again</button>
        </div>
      ) : sessionsQuery.data?.length ? (
        <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100">
          {sessionsQuery.data.map((session) => (
            <div key={session.id} className="border-b border-gray-100 p-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-gray-700">
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={15} className="text-gray-400" />{localDate(session.startsAt)} – {new Date(session.endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="inline-flex items-center gap-1.5"><MapPin size={15} className="text-gray-400" />{session.location}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    {session.confirmedCount ?? 0}/{session.capacity} seats booked · {session.waitlistCount ?? 0} waitlisted · {session.status}
                  </span>
                  <button type="button" onClick={() => void exportSessionCsv(session.id)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    <Download size={13} />CSV
                  </button>
                  <button type="button" aria-expanded={rosterSession === session.id} onClick={() => setRosterSession((current) => current === session.id ? null : session.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    {rosterSession === session.id ? 'Hide roster' : 'View roster'}
                  </button>
                </div>
              </div>

              {rosterSession === session.id && (
                <div className="mt-3 rounded-xl bg-gray-50 p-3">
                  {rosterQuery.isLoading ? (
                    <p className="text-sm text-gray-500">Loading roster…</p>
                  ) : rosterQuery.error ? (
                    <p role="alert" className="text-sm text-red-700">Could not load this roster. <button type="button" className="underline" onClick={() => void rosterQuery.refetch()}>Retry</button></p>
                  ) : !rosterQuery.data?.length ? (
                    <p className="text-sm text-gray-500">No learners have booked this session.</p>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {rosterQuery.data.map((booking) => {
                        const sessionEnded = new Date(session.endsAt) <= new Date();
                        const canMarkAttendance = booking.status === 'confirmed' && sessionEnded;
                        const paymentStatus = booking.paymentStatus ?? 'pending';
                        const yearLabel = booking.studyYear ? (STUDY_YEAR_LABEL[booking.studyYear] ?? booking.studyYear) : null;
                        return (
                          <div key={booking.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800">{booking.studentName}</p>
                              <p className="text-xs text-gray-500">{booking.studentEmail}</p>
                              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                                <span className="inline-flex items-center gap-1">
                                  <Phone size={11} />{booking.studentPhone || <span className="italic text-gray-400">No phone on file</span>}
                                </span>
                                <span>Year: {yearLabel ?? <span className="italic text-gray-400">—</span>}</span>
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white px-2 py-1 text-xs capitalize text-gray-600">
                                {booking.status.replace('_', ' ')}
                                {booking.status === 'waitlisted' && booking.waitlistPosition ? ` · #${booking.waitlistPosition}` : ''}
                              </span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${PAYMENT_STATUS_STYLE[paymentStatus]}`} title={booking.paymentMethod ? `Payment method: ${booking.paymentMethod}` : undefined}>
                                {booking.paymentMethod === 'online' ? <CreditCard size={11} /> : <Wallet size={11} />}
                                {PAYMENT_STATUS_LABEL[paymentStatus]}
                              </span>
                              {paymentStatus !== 'paid' && (
                                <button type="button" disabled={payment.isPending} onClick={() => payment.mutate({ bookingId: booking.id, status: 'paid' })} className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                                  Mark paid
                                </button>
                              )}
                              {canMarkAttendance && (
                                <>
                                  <button type="button" disabled={attendance.isPending} onClick={() => attendance.mutate({ bookingId: booking.id, status: 'attended' })} className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">Attended</button>
                                  <button type="button" disabled={attendance.isPending} onClick={() => attendance.mutate({ bookingId: booking.id, status: 'no_show' })} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50">No show</button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {attendance.error && <p role="alert" className="mt-2 text-xs text-red-700">Could not save attendance. Try again.</p>}
                  {payment.error && <p role="alert" className="mt-2 text-xs text-red-700">Could not update payment status. Try again.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-500">No upcoming scheduled sessions. Add one above when the course is approved.</p>
      )}
    </section>
  );
};
