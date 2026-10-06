import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Puck } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { ExternalLink, History, LoaderCircle, Maximize2, Minimize2, RotateCcw, Save, Globe } from 'lucide-react';
import api from '../lib/api';
import { ManagerTabs } from '../components/organization-landing/ManagerTabs';
import { createLandingConfig, type LandingData, type LandingCourse, type LandingOrganization } from '../components/organization-landing/LandingTemplate';

type LandingVersion = { revision: number; actorId: string | null; createdAt: string; published: boolean };
type EditorResponse = { draft: LandingData; defaultData: LandingData; revision: number; publishedAt: string | null; courses: LandingCourse[]; history: LandingVersion[] };
// Puck may add editor-only zones/read-only metadata. Persist only our page model.
function pageData(data: LandingData): LandingData {
  return { root: { props: data.root.props }, content: data.content.map(({ type, props }) => ({ type, props })) } as LandingData;
}

export default function OrganizationLandingEditor() {
  const [org, setOrg] = useState<LandingOrganization | null>(null);
  const [draft, setDraft] = useState<LandingData | null>(null);
  const [courses, setCourses] = useState<LandingCourse[]>([]);
  const [revision, setRevision] = useState(0);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<LandingVersion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [session, setSession] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const savedSnapshot = useRef('');
  const defaultData = useRef<LandingData | null>(null);
  const latestData = useRef<LandingData | null>(null);
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const { data: current } = await api.get('/api/organizations/current');
      const { data } = await api.get<EditorResponse>('/api/organizations/' + current.organization.id + '/landing-page');
      setOrg(current.organization); setDraft(data.draft); latestData.current = data.draft;
      defaultData.current = data.defaultData; savedSnapshot.current = JSON.stringify(pageData(data.draft));
      setCourses(data.courses); setRevision(data.revision); setPublishedAt(data.publishedAt);
      setHistory(data.history ?? []);
      setDirty(false); setSession((value) => value + 1);
    } catch (err: any) { setError(err?.response?.data?.message || 'The landing page editor could not be loaded.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  const config = useMemo(() => org ? createLandingConfig(org, courses, true) : null, [org, courses]);
  const save = async (publish: boolean) => {
    if (!org || !latestData.current || busy) return;
    const data = pageData(latestData.current);
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.put('/api/organizations/' + org.id + '/landing-page', { data, expectedRevision: revision, publish });
      setRevision(response.data.revision); setPublishedAt(response.data.publishedAt);
      setHistory((versions) => [{ revision: response.data.revision, actorId: null, createdAt: new Date().toISOString(), published: publish }, ...versions.filter((version) => version.revision !== response.data.revision)].slice(0, 30));
      savedSnapshot.current = JSON.stringify(data);
      setDirty(JSON.stringify(pageData(latestData.current)) !== savedSnapshot.current);
      setNotice(publish ? 'Published. Visitors now see this version on your organization domain.' : 'Draft saved. Your published page has not changed.');
    } catch (err: any) { setError(err?.response?.data?.message || 'Your page could not be saved.'); }
    finally { setBusy(false); }
  };
  const restoreVersion = async (sourceRevision: number) => {
    if (!org || busy) return;
    if (dirty && !window.confirm('Discard your unsaved editor changes and restore this saved version as a draft?')) return;
    if (!dirty && !window.confirm('Restore this saved version as a draft? The live page will stay unchanged until you publish.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.post('/api/organizations/' + org.id + '/landing-page/restore', { sourceRevision, expectedRevision: revision, publish: false });
      await load();
      setNotice('Version restored as a draft. Publish when you are ready to show it to visitors.');
    } catch (err: any) { setError(err?.response?.data?.message || 'This version could not be restored.'); }
    finally { setBusy(false); }
  };
  const reset = () => {
    if (!defaultData.current || busy) return;
    if (!window.confirm('Restore the default template in this editor? Your live page will only change when you publish.')) return;
    const next = structuredClone(defaultData.current);
    setDraft(next); latestData.current = next; setDirty(true); setSession((value) => value + 1); setNotice('Default template restored in the editor. Save or publish when ready.');
  };
  if (!draft || !org || !config) return <div className="rounded-2xl border border-gray-100 bg-white p-8"><p className={error ? 'text-red-700' : 'text-gray-500'}>{error || 'Loading landing page editor…'}</p>{error && <button onClick={() => void load()} className="mt-4 font-semibold text-[#2D6A4F]">Try again</button>}</div>;
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const liveUrl = local ? window.location.origin + '/?org=' + encodeURIComponent(org.slug) : 'https://' + (org.customDomainStatus === 'active' && org.customDomain ? org.customDomain : org.slug + '.nudra.org');
  return <div className={fullScreen ? 'fixed inset-0 z-[80] overflow-auto bg-[#F8FAF9] p-4' : 'space-y-5'}>
    {!fullScreen && <><header><p className="text-sm text-gray-500">Your organization website</p><h1 className="mt-1 text-3xl font-bold">Landing Page</h1><p className="mt-2 text-sm text-gray-600">Make the template your own. Drag sections to reorder them, click to edit, and use page settings to change colors.</p></header><ManagerTabs slug={org.slug} /></>}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4">
      <div><p className="text-sm font-semibold">{org.name}</p><p className="mt-1 text-xs text-gray-500">{dirty ? 'Unsaved changes' : revision === 0 ? 'Default template' : 'Draft is saved'} · {publishedAt ? 'Last published ' + new Date(publishedAt).toLocaleString('en') : 'Visitors currently see the default template'}</p></div>
      <div className="flex flex-wrap gap-2">
        {history.length > 0 && <details className="relative"><summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"><History size={15} />History</summary><div className="absolute right-0 z-30 mt-2 max-h-80 w-80 overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-xl">{history.map((version) => <div key={version.revision} className="flex items-center justify-between gap-3 border-b border-gray-100 p-3 last:border-0"><div><p className="text-sm font-semibold">Revision {version.revision}{version.published ? ' · published' : ''}</p><p className="mt-1 text-xs text-gray-500">{new Date(version.createdAt).toLocaleString('en')}</p></div><button type="button" disabled={busy || version.revision === revision} onClick={() => void restoreVersion(version.revision)} className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40">Restore draft</button></div>)}</div></details>}
        <button type="button" disabled={busy} onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:opacity-50"><RotateCcw size={15} />Reset template</button>
        <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"><ExternalLink size={15} />View live</a>
        <button type="button" onClick={() => setFullScreen(!fullScreen)} className="rounded-lg border border-gray-200 p-2" aria-label={fullScreen ? 'Exit full screen' : 'Open full screen'}>{fullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        <button disabled={busy} onClick={() => void save(false)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}Save draft</button>
        <button disabled={busy} onClick={() => void save(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Globe size={15} />Publish</button>
      </div>
    </div>
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<button disabled={busy} onClick={() => void load()} className="ml-3 underline">Reload saved draft</button></div>}
    {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <Puck key={session} config={config} data={draft} height={fullScreen ? 'calc(100vh - 180px)' : '740px'} headerTitle="Landing Page" headerPath={org.slug + '.nudra.org'}
        permissions={{ insert: false, delete: false, duplicate: false, drag: !busy, edit: !busy }}
        viewports={[{ width: 1280, label: 'Desktop' }, { width: 768, label: 'Tablet' }, { width: 375, label: 'Mobile' }]}
        overrides={{ headerActions: () => <span className="text-xs text-gray-500">Save and publish using the buttons above</span> }}
        onChange={(next) => { latestData.current = next; setDirty(JSON.stringify(pageData(next)) !== savedSnapshot.current); }} />
    </div>
    <p className="mt-4 text-xs leading-6 text-gray-500">The shared template contains seven sections. Hide sections using “Show this section”; edit their text and images in the right panel. Courses update automatically as you publish or unpublish approved organization courses. Edit the organization name and logo in Manage organization.</p>
  </div>;
}
