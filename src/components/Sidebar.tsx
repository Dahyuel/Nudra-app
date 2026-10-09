import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutGrid,
  BookOpen,
  Compass,
  Users,
  Sparkles,
  BarChart3,
  ClipboardList,
  X,
  ExternalLink,
  GraduationCap,
  Building2,
  Route,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ProfileMenu } from './ProfileMenu';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutGrid },
    { name: 'Academic', path: '/academic', icon: GraduationCap },
    ...(user?.role === 'student' && !user.organizationContext ? [{ name: 'Learning Path', path: '/learning-path', icon: Route }] : []),
    ...(user?.role === 'student' && !user.organizationContext ? [{ name: 'Organizations', path: '/organizations', icon: Building2 }] : []),
    { name: 'My Courses', path: '/my-courses', icon: BookOpen },
    { name: 'Browse', path: '/browse', icon: Compass },
    { name: 'Community', path: '/community', icon: Users },
    { name: 'AI Tutor', path: '/ai-tutor', icon: Sparkles, badge: 'New' },
    { name: 'Progress', path: '/progress', icon: BarChart3 },
    { name: 'Exam Simulator', path: '/exam-simulator', icon: ClipboardList },
  ];

  const { data: sanaweyaProfile } = useQuery({
    queryKey: ['sanaweya-profile'],
    queryFn: async () => {
      const { data } = await api.get('/api/sanaweya/profile');
      return data.profile as { grade?: string } | null;
    },
    enabled: !!user && user.role === 'student',
    staleTime: 5 * 60 * 1000,
  });

  const gradeBadge =
    sanaweyaProfile?.grade === 'year1'
      ? 'س١'
      : sanaweyaProfile?.grade === 'year2'
      ? 'س٢'
      : sanaweyaProfile?.grade === 'year3'
      ? 'س٣'
      : null;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          id="sidebar-backdrop"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-gray-100 flex flex-col justify-between py-6 px-4 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Logo Header */}
          <div className="flex items-center justify-between px-3 mb-8">
            <Link to="/dashboard" className="flex items-center gap-2.5 group">
              <img src="/favicon.png" alt="Nudra" className="w-9 h-9 object-contain" />
              <div className="py-4">
                <img src="/nudra-text-logo.png" alt="Nudra" className="w-32 h-auto" />
              </div>
            </Link>

            {/* Mobile close button */}
            <button
              id="sidebar-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 lg:hidden"
              aria-label="Close Sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Section: Menu */}
          <div className="mb-6">
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Menu
            </p>
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => {
                      if (window.innerWidth < 1024) onClose();
                    }}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-[#2D6A4F] text-white shadow-sm'
                          : 'text-gray-600 hover:text-[#1B1B1B] hover:bg-gray-50'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3">
                          <Icon
                            className={`w-5 h-5 transition-colors ${
                              isActive ? 'text-white' : 'text-gray-500'
                            }`}
                          />
                          <span>{item.name}</span>
                          {item.path === '/academic' && gradeBadge && (
                            <span className="bg-[#2D6A4F] text-white text-xs px-1.5 py-0.5 rounded-full ml-1">
                              {gradeBadge}
                            </span>
                          )}
                        </div>
                        {item.badge && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              isActive
                                ? 'bg-white/25 text-white'
                                : 'bg-emerald-100 text-[#2D6A4F]'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

        </div>

        {/* Bottom Section: User Profile Menu (dropdown) & Instructor Studio */}
        <div className="space-y-2 pt-4 border-t border-gray-100">
          <ProfileMenu showName align="left" openUp onNavigate={onClose} />

          {user?.role === 'instructor' && (
            <Link
              to="/instructor/dashboard"
              className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 text-xs font-bold text-[#2D6A4F] transition-colors group"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#2D6A4F]" />
                <span>Instructor Studio</span>
              </div>
              <span className="text-[10px] bg-[#2D6A4F] text-white px-1.5 py-0.5 rounded font-black">
                PRO
              </span>
            </Link>
          )}

          <div className="px-3 pt-1 text-[11px] text-gray-400 flex items-center justify-between">
            <span>Nudra v2.4</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
        </div>
      </aside>
    </>
  );
};
