import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Render } from '@puckeditor/core/rsc';
import { Check, LoaderCircle, Plus, X, BookOpen } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LandingPage } from './LandingPage';
import { ManagerTabs } from '../components/organization-landing/ManagerTabs';
import { createLandingConfig, type LandingData, type LandingCourse } from '../components/organization-landing/LandingTemplate';

type Membership = { id: string; role: string; status: string };
type OrgCourse = { id: string; title: string; description: string; category: string; level: string; thumbnailUrl: string | null; deliveryMode: 'online' | 'offline'; location: string | null; scheduleText: string | null; bookingUrl: string | null };
type DomainDnsRecord = { type: string; name: string; value: string; purpose: string };
type Organization = { id: string; name: string; slug: string; logoUrl: string | null; primaryColor: string | null; customDomain?: string | null; customDomainStatus?: string; customDomainDnsRecords?: DomainDnsRecord[] };
type CurrentResponse = { organization: Organization; membership: Membership | null; courses: OrgCourse[] };
type OrgPerson = { membership: Membership & { createdAt: string }; name: string; email: string; userId: string };
type ManagerCourse = { id: string; title: string; deliveryMode: 'online' | 'offline'; approvalStatus: string; isPublished: boolean; instructorId: string; instructorName: string; instructorEmail: string; location: string | null; scheduleText: string | null; bookingUrl: string | null; };

const panel = 'rounded-2xl border border-gray-100 bg-white p-6 shadow-sm';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#24583f] disabled:opacity-50';

export const TenantLandingPage: React.FC = () => {
  const location = useLocation();
  const [page, setPage] = useState<{ organization: Organization; landingPage: LandingData; courses: LandingCourse[] } | null>(null);
  const [checked, setChecked] = useState(false);
  const [globalPage, setGlobalPage] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const host = window.location.hostname;
    const tenant = new URLSearchParams(location.search).has('org') || !['localhost', '127.0.0.1', 'nudra.org', 'www.nudra.org', 'nudra.com', 'www.nudra.com'].includes(host);
    setChecked(false); setError(''); setPage(null); setGlobalPage(!tenant);
    if (!tenant) { setChecked(true); return; }
    api.get('/api/organizations/public-current')
      .then(({ data }) => { if (!cancelled) setPage(data); })
      .catch((err) => { if (!cancelled) setError(err?.response?.status === 404 ? 'This organization page is not available.' : 'This page could not be loaded. Please try again.'); })
      .finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [location.search]);
  useEffect(() => {
    if (!page) return;
    const previous = document.title;
    document.title = page.organization.name + ' | Learning with Nudra';
    return () => { document.title = previous; };
  }, [page]);
  if (!checked) return <div className="grid min-h-screen place-items-center bg-[#F8FAF9] text-sm text-gray-500">Loading…</div>;
  if (globalPage) return <LandingPage />;
  if (!page || error) return <div className="grid min-h-screen place-items-center bg-[#F8FAF9] p-6 text-gray-600" role="alert"><div><p>{error || 'This organization page is not available.'}</p><button onClick={() => window.location.reload()} className="mt-4 font-semibold text-[#2D6A4F]">Try again</button></div></div>;
  return <Render config={createLandingConfig(page.organization, page.courses)} data={page.landingPage} />;
};

export const OrganizationPortalPage: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<CurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/organizations/current');
      setData(response.data);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load this organization.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    try { await api.post(path, body); await load(); }
    catch (err: any) { setError(err?.response?.data?.message || 'That action could not be completed.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="p-12 text-center text-gray-500">Loading organization…</div>;
  if (error && !data) return <div className={panel}><p className="text-red-700">{error}</p></div>;
  if (!data) return null;
  const { organization, membership } = data;
  const manager = membership?.role === 'organization_manager' && membership.status === 'active';
  const invited = membership?.status === 'invited';

  return <div className="mx-auto max-w-5xl space-y-6">
    <header className={panel}>
      <div className="flex items-center gap-4">
        {organization.logoUrl && <img src={organization.logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />}
        <div><p className="text-sm text-gray-500">Organization learning space</p><h1 className="text-2xl font-bold">{organization.name}</h1></div>
      </div>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
    </header>
    {manager ? <section className={panel}>
      <h2 className="text-lg font-semibold">Organization manager</h2>
      <p className="mt-2 text-gray-600">Manage membership requests, instructors, and this organization’s learning space.</p>
      <Link className={`${button} mt-4`} to={`/organization/manage?org=${encodeURIComponent(organization.slug)}`}>Open manager dashboard</Link>
    </section> : invited ? <section className={panel}>
      <h2 className="text-lg font-semibold">Instructor invitation</h2>
      <p className="mt-2 text-gray-600">You were invited to teach in {organization.name}.</p>
      <button disabled={busy} className={`${button} mt-4`} onClick={() => void act(`/api/organizations/${organization.id}/invitations/${membership.id}/accept`)}>Accept invitation</button>
    </section> : membership?.status === 'active' ? <section className="space-y-4">
      <h2 className="text-xl font-bold">Courses for {organization.name}</h2>
      {data.courses.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.courses.map((course) => <Link key={course.id} to={`/course/${course.id}?org=${encodeURIComponent(organization.slug)}`} className={`${panel} transition hover:-translate-y-0.5`}>
          {course.thumbnailUrl && <img src={course.thumbnailUrl} alt="" className="mb-4 aspect-video w-full rounded-xl object-cover" />}
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2D6A4F]">{course.category} · {course.deliveryMode === 'offline' ? 'Offline booking' : 'Online'}</p>
          <h3 className="mt-2 font-bold">{course.title}</h3><p className="mt-2 line-clamp-2 text-sm text-gray-600">{course.description}</p>
          {course.deliveryMode === 'offline' && <p className="mt-2 text-xs text-gray-500">{course.location || 'Location provided after booking'}{course.scheduleText ? ` · ${course.scheduleText}` : ''}</p>}
          {course.deliveryMode === 'offline' && course.bookingUrl && <a href={course.bookingUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="mt-3 inline-flex rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-semibold text-white">Book this course</a>}
        </Link>)}
      </div> : <div className={panel}><p className="text-gray-600">There are no published organization courses yet.</p></div>}
    </section> : membership?.status === 'pending' ? <section className={panel}>
      <h2 className="text-lg font-semibold">Request submitted</h2><p className="mt-2 text-gray-600">The organization manager needs to approve your request before you can view courses.</p>
    </section> : user?.role === 'student' ? <section className={panel}>
      <h2 className="text-lg font-semibold">Join {organization.name}</h2>
      <p className="mt-2 text-gray-600">Send a request to the organization manager. You’ll see its courses after approval.</p>
      <button disabled={busy} className={`${button} mt-4`} onClick={() => void act('/api/organizations/join')}>Request to join</button>
    </section> : <section className={panel}>
      <h2 className="text-lg font-semibold">Membership is by invitation</h2>
      <p className="mt-2 text-gray-600">Ask the organization manager to invite your instructor account.</p>
    </section>}
  </div>;
};

export const OrganizationManagerPage: React.FC = () => {
  const [current, setCurrent] = useState<CurrentResponse | null>(null);
  const [requests, setRequests] = useState<OrgPerson[]>([]);
  const [members, setMembers] = useState<OrgPerson[]>([]);
  const [email, setEmail] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [managerCourses, setManagerCourses] = useState<ManagerCourse[]>([]);
  const [courseDraft, setCourseDraft] = useState({ instructorId: '', title: '', description: '', category: 'General', level: 'All Levels', deliveryMode: 'online' as 'online' | 'offline', location: '', scheduleText: '', bookingUrl: '', price: '0' });
  const [brand, setBrand] = useState({ name: '', logoUrl: '', primaryColor: '#2D6A4F', customDomain: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await api.get('/api/organizations/current');
    setCurrent(data);
    setBrand({ name: data.organization.name, logoUrl: data.organization.logoUrl || '', primaryColor: data.organization.primaryColor || '#2D6A4F', customDomain: data.organization.customDomain || '' });
    if (data.membership?.role === 'organization_manager') {
      const [r, m, c] = await Promise.all([
        api.get(`/api/organizations/${data.organization.id}/requests`),
        api.get(`/api/organizations/${data.organization.id}/members`),
        api.get(`/api/organizations/${data.organization.id}/courses`),
      ]);
      setRequests(r.data.requests);
      setMembers(m.data.members);
      setManagerCourses(c.data.courses);
    }
  }, []);
  useEffect(() => { void load().catch((err) => setError(err?.response?.data?.message || 'Manager access is required.')); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!current) return;
    setBusy(true); setError('');
    try { await api.post(`/api/organizations/${current.organization.id}/instructors/invite`, { email, name: instructorName }); setEmail(''); setInstructorName(''); await load(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Could not invite instructor.'); }
    finally { setBusy(false); }
  };
  const decideCourse = async (courseId: string, decisionValue: 'approve' | 'reject') => {
    if (!current) return;
    setBusy(true); setError('');
    try {
      await api.post(`/api/organizations/${current.organization.id}/courses/${courseId}/decision`, { decision: decisionValue });
      await load();
    } catch (err: any) { setError(err?.response?.data?.message || 'Could not update course submission.'); }
    finally { setBusy(false); }
  };
  const createOrgCourse = async (event: FormEvent) => {
    event.preventDefault(); if (!current) return;
    setBusy(true); setError('');
    try { await api.post(`/api/organizations/${current.organization.id}/courses`, { ...courseDraft, price: Number(courseDraft.price), bookingUrl: courseDraft.bookingUrl || undefined, location: courseDraft.location || undefined, scheduleText: courseDraft.scheduleText || undefined }); setCourseDraft({ ...courseDraft, instructorId: '', title: '', description: '', bookingUrl: '', location: '', scheduleText: '' }); await load(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Could not create organization course.'); }
    finally { setBusy(false); }
  };
  const toggleOrgCourse = async (course: ManagerCourse) => {
    if (!current) return; setBusy(true); setError('');
    try { await api.post(`/api/organizations/${current.organization.id}/courses/${course.id}/visibility`, { published: !course.isPublished }); await load(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Could not update course visibility.'); }
    finally { setBusy(false); }
  };
  const decision = async (memberId: string, decisionValue: 'approve' | 'reject') => {
    if (!current) return;
    setBusy(true); setError('');
    try { await api.post(`/api/organizations/${current.organization.id}/members/${memberId}/decision`, { decision: decisionValue }); await load(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Could not update request.'); }
    finally { setBusy(false); }
  };
  const saveBrand = async (event: FormEvent) => {
    event.preventDefault();
    if (!current) return;
    setBusy(true); setError('');
    try {
      await api.put(`/api/organizations/${current.organization.id}/branding`, {
        name: brand.name,
        logoUrl: brand.logoUrl || null,
        primaryColor: brand.primaryColor,
      });
      const nextDomain = brand.customDomain.trim().toLowerCase();
      if (nextDomain !== (current.organization.customDomain || '')) {
        await api.post(`/api/organizations/${current.organization.id}/domain`, { domain: nextDomain || null });
      }
      await load();
    } catch (err: any) { setError(err?.response?.data?.message || 'Could not save organization settings.'); await load(); }
    finally { setBusy(false); }
  };
  const checkDomain = async () => {
    if (!current) return;
    setBusy(true); setError('');
    try { await api.post(`/api/organizations/${current.organization.id}/domain/verify`); await load(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Could not check the domain yet.'); }
    finally { setBusy(false); }
  };

  if (error && !current) return <div className={panel}><p className="text-red-700">{error}</p></div>;
  if (!current) return <div className="p-12 text-center text-gray-500">Loading manager dashboard…</div>;
  const pendingCourseCount = managerCourses.filter((course) => course.approvalStatus === 'pending').length;
  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-sm text-gray-500">Organization</p><h1 className="text-3xl font-bold">{current.organization.name} manager</h1></header>
    <ManagerTabs slug={current.organization.slug} />
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Organization manager overview">
      <a href="#student-requests" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:border-amber-300">
        <p className="text-sm font-medium text-amber-900">Student requests to review</p>
        <p className="mt-2 text-3xl font-extrabold text-amber-950">{requests.length}</p>
      </a>
      <a href="#course-approvals" className="rounded-2xl border border-blue-200 bg-blue-50 p-5 transition hover:border-blue-300">
        <p className="text-sm font-medium text-blue-900">Course submissions awaiting review</p>
        <p className="mt-2 text-3xl font-extrabold text-blue-950">{pendingCourseCount}</p>
      </a>
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-medium text-gray-600">Active organization members</p>
        <p className="mt-2 text-3xl font-extrabold text-gray-900">{members.filter((member) => member.membership.status === 'active').length}</p>
      </div>
    </section>
    <section className={panel}><h2 className="text-lg font-semibold">Invite an instructor</h2>
      <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={submit}>
        <input className="min-w-0 rounded-xl border border-gray-200 px-4 py-3" value={instructorName} onChange={(e) => setInstructorName(e.target.value)} placeholder="Instructor full name (new account only)" />
        <input className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-3" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Instructor account email" />
        <button className={button} disabled={busy}><Plus size={16} /> Invite</button>
      </form><p className="mt-2 text-xs text-gray-500">New instructors receive a one-time password setup link from no-reply@nudra.org. Existing approved accounts receive an organization invitation.</p>
    </section>
    <section className={panel}><h2 className="text-lg font-semibold">Create course for your organization</h2>
      <form onSubmit={createOrgCourse} className="mt-4 grid gap-3 sm:grid-cols-2">
        <select required value={courseDraft.instructorId} onChange={(e) => setCourseDraft({ ...courseDraft, instructorId: e.target.value })} className="rounded-xl border border-gray-200 px-4 py-3"><option value="">Assign active instructor</option>{members.filter((m) => m.membership.role === 'instructor' && m.membership.status === 'active').map((m) => <option key={m.membership.id} value={m.userId}>{m.name} · {m.email}</option>)}</select>
        <input required value={courseDraft.title} onChange={(e) => setCourseDraft({ ...courseDraft, title: e.target.value })} placeholder="Course title" className="rounded-xl border border-gray-200 px-4 py-3" />
        <select value={courseDraft.deliveryMode} onChange={(e) => setCourseDraft({ ...courseDraft, deliveryMode: e.target.value as 'online' | 'offline' })} className="rounded-xl border border-gray-200 px-4 py-3"><option value="online">Online course</option><option value="offline">Offline course · booking only</option></select>
        <input required value={courseDraft.category} onChange={(e) => setCourseDraft({ ...courseDraft, category: e.target.value })} placeholder="Subject/category" className="rounded-xl border border-gray-200 px-4 py-3" />
        <textarea required value={courseDraft.description} onChange={(e) => setCourseDraft({ ...courseDraft, description: e.target.value })} placeholder="Course description" className="rounded-xl border border-gray-200 px-4 py-3 sm:col-span-2" />
        {courseDraft.deliveryMode === 'offline' && <><input required value={courseDraft.location} onChange={(e) => setCourseDraft({ ...courseDraft, location: e.target.value })} placeholder="Location" className="rounded-xl border border-gray-200 px-4 py-3" /><input required value={courseDraft.scheduleText} onChange={(e) => setCourseDraft({ ...courseDraft, scheduleText: e.target.value })} placeholder="Schedule" className="rounded-xl border border-gray-200 px-4 py-3" /><input required type="url" value={courseDraft.bookingUrl} onChange={(e) => setCourseDraft({ ...courseDraft, bookingUrl: e.target.value })} placeholder="Booking page URL" className="rounded-xl border border-gray-200 px-4 py-3" /></>}
        {courseDraft.deliveryMode === 'online' && <input type="number" min="0" value={courseDraft.price} onChange={(e) => setCourseDraft({ ...courseDraft, price: e.target.value })} placeholder="Price (EGP)" className="rounded-xl border border-gray-200 px-4 py-3" />}
        <button disabled={busy} className={`${button} sm:col-span-2`}><BookOpen size={16} /> Create course</button>
      </form>
    </section>
    <section id="course-approvals" className={panel}><h2 className="text-lg font-semibold">Organization courses ({managerCourses.length})</h2><div className="mt-4 divide-y divide-gray-100">{managerCourses.map((course) => <div key={course.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"><div><p className="font-semibold">{course.title} <span className="ml-2 rounded-full bg-gray-100 px-2 py-1 text-xs capitalize">{course.deliveryMode}</span></p><p className="text-sm text-gray-500">By {course.instructorName} · {course.approvalStatus}{course.location ? ` · ${course.location}` : ''}</p></div>{course.approvalStatus === 'pending' && <div className="flex gap-2"><button disabled={busy} onClick={() => void decideCourse(course.id, 'approve')} className="rounded-lg bg-emerald-50 p-2 text-emerald-800" aria-label="Approve course"><Check size={18} /></button><button disabled={busy} onClick={() => void decideCourse(course.id, 'reject')} className="rounded-lg bg-red-50 p-2 text-red-700" aria-label="Reject course"><X size={18} /></button></div>}{course.approvalStatus === 'approved' && <button disabled={busy} onClick={() => void toggleOrgCourse(course)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold">{course.isPublished ? 'Take offline' : 'Publish'}</button>}</div>)}{!managerCourses.length && <p className="py-4 text-sm text-gray-500">No organization courses yet.</p>}</div></section>
    <section className={panel}><h2 className="text-lg font-semibold">Brand and domain</h2>
      <form onSubmit={saveBrand} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Organization name<input required value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} className="mt-1 block w-full rounded-xl border border-gray-200 px-4 py-3" /></label>
        <label className="text-sm font-medium">Logo URL<input type="url" value={brand.logoUrl} onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value })} className="mt-1 block w-full rounded-xl border border-gray-200 px-4 py-3" placeholder="https://…" /></label>
        <label className="text-sm font-medium">Brand color<input type="color" value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} className="mt-1 block h-12 w-full rounded-xl border border-gray-200 px-2" /></label>
        <label className="text-sm font-medium">Custom domain<input value={brand.customDomain} onChange={(e) => setBrand({ ...brand, customDomain: e.target.value })} className="mt-1 block w-full rounded-xl border border-gray-200 px-4 py-3" placeholder="learn.example.com" /></label>
        <div className="sm:col-span-2"><button className={button} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : null}Save settings and connect domain</button><p className="mt-2 text-xs text-gray-500">Point your domain to the Nudra server and prove ownership with the DNS records shown here. Your organization’s subdomain already works at <strong>{current.organization.slug}.nudra.org</strong>.</p></div>
      </form>
      {current.organization.customDomain && <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{current.organization.customDomain}</p><p className={`text-sm ${current.organization.customDomainStatus === 'active' ? 'text-emerald-700' : 'text-amber-700'}`}>Connection status: {current.organization.customDomainStatus || 'pending'}</p></div><button type="button" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy} onClick={() => void checkDomain()}>Check connection</button></div>
        {current.organization.customDomainStatus !== 'active' && <><p className="mt-3 text-sm text-gray-600">Add these records at your domain provider, then check the connection again. DNS changes can take time to appear.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-gray-500"><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Value</th><th className="py-2">Purpose</th></tr></thead><tbody>{(current.organization.customDomainDnsRecords || []).map((record, index) => <tr key={`${record.type}-${record.name}-${index}`} className="border-b last:border-0"><td className="py-2 pr-3 font-mono">{record.type}</td><td className="py-2 pr-3 font-mono">{record.name}</td><td className="py-2 pr-3 font-mono">{record.value}</td><td className="py-2 text-gray-600">{record.purpose}</td></tr>)}</tbody></table></div></>}
      </div>}
    </section>
    <section id="student-requests" className={panel}><h2 className="text-lg font-semibold">Student requests ({requests.length})</h2>
      <div className="mt-4 divide-y divide-gray-100">{requests.filter((r) => r.membership.role === 'student').map((person) => <div key={person.membership.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
        <div><p className="font-semibold">{person.name}</p><p className="text-sm text-gray-500">{person.email}</p></div>
        <div className="flex gap-2"><button disabled={busy} onClick={() => void decision(person.membership.id, 'approve')} className="rounded-lg bg-emerald-50 p-2 text-emerald-800" aria-label="Approve"><Check size={18} /></button><button disabled={busy} onClick={() => void decision(person.membership.id, 'reject')} className="rounded-lg bg-red-50 p-2 text-red-700" aria-label="Reject"><X size={18} /></button></div>
      </div>)}{!requests.some((r) => r.membership.role === 'student') && <p className="py-4 text-sm text-gray-500">No student requests waiting.</p>}</div>
    </section>
    <section className={panel}><h2 className="text-lg font-semibold">Organization members ({members.filter((m) => m.membership.status === 'active').length})</h2>
      <div className="mt-4 divide-y divide-gray-100">{members.map((person) => <div key={person.membership.id} className="flex justify-between gap-3 py-3"><div><p className="font-medium">{person.name}</p><p className="text-sm text-gray-500">{person.email}</p></div><span className="text-sm capitalize text-gray-600">{person.membership.role.replace('_', ' ')} · {person.membership.status}</span></div>)}</div>
    </section>
  </div>;
};

export const AdminOrganizationsPage: React.FC = () => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setResult(''); setError('');
    try {
      const { data } = await api.post('/api/organizations', { name, slug, ...(managerEmail ? { managerEmail } : {}) });
      setResult(`${data.organization.name} created. Open ${data.organization.slug}.nudra.org to manage it.`);
      setName(''); setSlug(''); setManagerEmail('');
    } catch (err: any) { setError(err?.response?.data?.message || 'Could not create organization.'); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-3xl space-y-6"><div><p className="text-sm text-gray-500">Platform administration</p><h1 className="text-3xl font-bold">Organizations</h1></div>
    <form className={`${panel} space-y-4`} onSubmit={submit}>
      <label className="block text-sm font-medium">Organization name<input required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 px-4 py-3" /></label>
      <label className="block text-sm font-medium">Subdomain slug<input required pattern="[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="mt-1 block w-full rounded-xl border border-gray-200 px-4 py-3" placeholder="academy-name" /><span className="mt-1 block text-xs text-gray-500">This becomes {slug || 'your-org'}.nudra.org.</span></label>
      <label className="block text-sm font-medium">Manager email (optional)<input type="email" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 px-4 py-3" placeholder="Use your admin account if blank" /></label>
      {error && <p className="text-sm text-red-700">{error}</p>}{result && <p className="text-sm text-emerald-800">{result}</p>}
      <button className={button} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} Create organization</button>
    </form>
  </div>;
};
