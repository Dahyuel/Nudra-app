import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, Search } from 'lucide-react';
import api from '../lib/api';

type PublicOrganization = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  customDomain: string | null;
};

const panelClass = 'rounded-2xl border border-gray-100 bg-white shadow-sm';

function organizationLandingUrl(organization: PublicOrganization) {
  if (organization.customDomain) return `https://${organization.customDomain}`;
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `/?org=${encodeURIComponent(organization.slug)}`;
  }
  const rootDomain = hostname.replace(/^www\./, '');
  return `https://${organization.slug}.${rootDomain}`;
}

export const OrganizationsDirectoryPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['public-organization-directory'],
    queryFn: async () => (await api.get<{ organizations: PublicOrganization[] }>('/api/organizations/directory')).data.organizations,
    staleTime: 60_000,
  });
  const organizations = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return (query.data ?? []).filter((organization) => !normalizedSearch || organization.name.toLocaleLowerCase().includes(normalizedSearch));
  }, [query.data, search]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#2D6A4F]">Nudra organizations</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1B1B1B] sm:text-4xl">Find your learning community</h1>
        <p className="mt-3 leading-6 text-gray-600">Explore organizations on Nudra and open their learning spaces. Each organization manages its own courses and membership requests.</p>
      </header>

      <label className={`${panelClass} mb-6 flex max-w-xl items-center gap-3 px-4 py-3`}>
        <Search size={18} className="shrink-0 text-gray-400" />
        <span className="sr-only">Search organizations</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search organizations…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
      </label>

      {query.isLoading ? (
        <div className={`${panelClass} grid min-h-48 place-items-center text-sm text-gray-500`}>Loading organizations…</div>
      ) : query.error ? (
        <div className={`${panelClass} p-6`} role="alert">
          <h2 className="font-bold text-gray-900">Organizations could not be loaded</h2>
          <p className="mt-2 text-sm text-gray-600">Check your connection and try again.</p>
          <button onClick={() => void query.refetch()} className="mt-4 rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white">Try again</button>
        </div>
      ) : organizations.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((organization) => (
            <a key={organization.id} href={organizationLandingUrl(organization)} className={`${panelClass} group flex min-h-48 flex-col p-5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md`}>
              <div className="flex items-center gap-4">
                {organization.logoUrl
                  ? <img src={organization.logoUrl} alt="" loading="lazy" className="h-14 w-14 rounded-2xl border border-gray-100 object-cover" />
                  : <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-[#2D6A4F]" style={{ color: organization.primaryColor || undefined }}><Building2 size={25} /></span>}
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-gray-900 group-hover:text-[#2D6A4F]">{organization.name}</h2>
                  <p className="mt-1 truncate text-xs text-gray-500">{organization.customDomain || `${organization.slug}.nudra.org`}</p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-gray-600">View this organization’s landing page, courses, and learning options.</p>
              <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-[#2D6A4F]">Visit organization <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
            </a>
          ))}
        </div>
      ) : (
        <section className={`${panelClass} px-6 py-12 text-center`}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gray-50 text-gray-400"><Building2 size={26} /></span>
          <h2 className="mt-4 text-lg font-bold text-gray-900">{search ? 'No organizations match your search' : 'Organizations are joining Nudra'}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-500">{search ? 'Try another name.' : 'Public organization learning spaces will appear here when they are available.'}</p>
          {search && <button onClick={() => setSearch('')} className="mt-4 text-sm font-bold text-[#2D6A4F]">Clear search</button>}
          <Link to="/browse" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#2D6A4F]">Explore Nudra courses <ArrowRight size={15} /></Link>
        </section>
      )}
    </main>
  );
};
