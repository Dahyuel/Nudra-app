import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { BookOpen, Building2, CalendarDays, PanelsTopLeft } from 'lucide-react';
import { ProfileMenu } from '../components/ProfileMenu';
import { useAuth } from '../context/AuthContext';

export const OrganizationLayout: React.FC = () => {
  const { user } = useAuth();
  const organization = user?.organizationContext;
  return <div className="min-h-screen bg-[#F8FAF9] lg:flex" style={{ '--org-primary': organization?.primaryColor || '#2D6A4F' } as React.CSSProperties}>
    <aside className="flex w-full flex-col justify-between border-b border-gray-100 bg-white p-4 lg:fixed lg:inset-y-0 lg:w-64 lg:border-b-0 lg:border-r lg:p-6">
      <div>
        <Link to={`/organization?org=${encodeURIComponent(organization?.slug || '')}`} className="flex items-center gap-3 px-2 py-3">
          {organization?.logoUrl ? <img src={organization.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <img src="/favicon.png" alt="Nudra" className="h-10 w-10 object-contain" />}
          <span className="min-w-0"><span className="block truncate text-sm font-bold">{organization?.name || 'Organization'}</span><span className="text-xs text-gray-500">Learning space</span></span>
        </Link>
        <nav className="mt-6 flex gap-2 lg:flex-col">
          <NavLink end to={`/organization?org=${encodeURIComponent(organization?.slug || '')}`} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? 'bg-[var(--org-primary)] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            <BookOpen size={18} />Courses
          </NavLink>
          {user?.role === 'student' && organization?.membership?.status === 'active' && <NavLink to={`/bookings?org=${encodeURIComponent(organization.slug)}`} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? 'bg-[var(--org-primary)] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            <CalendarDays size={18} />Bookings
          </NavLink>}
          {organization?.membership?.role === 'organization_manager' && <NavLink to={`/organization/manage?org=${encodeURIComponent(organization.slug)}`} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? 'bg-[var(--org-primary)] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Building2 size={18} />Manage organization
          </NavLink>}
          {organization?.membership?.role === 'organization_manager' && organization.membership.status === 'active' && <NavLink to={`/organization/landing-page?org=${encodeURIComponent(organization.slug)}`} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? 'bg-[var(--org-primary)] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            <PanelsTopLeft size={18} />Landing Page
          </NavLink>}
        </nav>
      </div>
      <div className="hidden border-t border-gray-100 pt-4 lg:block"><ProfileMenu showName align="left" openUp /></div>
      <div className="lg:hidden"><ProfileMenu showName align="left" /></div>
    </aside>
    <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:ml-64 lg:px-8"><Outlet /></main>
  </div>;
};
