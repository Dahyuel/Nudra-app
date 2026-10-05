import React from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, PanelsTopLeft } from 'lucide-react';

export function ManagerTabs({ slug }: { slug: string }) {
  const query = '?org=' + encodeURIComponent(slug);
  const style = ({ isActive }: { isActive: boolean }) => 'inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ' + (isActive ? 'bg-[#2D6A4F] text-white' : 'text-gray-600 hover:bg-gray-100');
  return <nav className="flex flex-wrap gap-2 rounded-2xl border border-gray-100 bg-white p-2" aria-label="Organization manager tabs">
    <NavLink end to={'/organization/manage' + query} className={style}><Building2 size={16} />Manage organization</NavLink>
    <NavLink end to={'/organization/landing-page' + query} className={style}><PanelsTopLeft size={16} />Landing Page</NavLink>
  </nav>;
}
