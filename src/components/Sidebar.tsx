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
          className="fixed inset-0 z-40 bg-[#063e33]/25 dark:bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white dark:bg-[#101c22] border-r border-[#063e33]/10 dark:border-white/10 flex flex-col justify-between py-6 px-4 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Logo Header */}
          <div className="flex items-center justify-between px-3 mb-7">
            <Link to="/dashboard" className="flex items-center gap-2.5 group">
              <img src="/favicon.png" alt="Nudra" className="w-8 h-8 object-contain" />
              <div className="py-2">
                <img
                  src="/nudra-text-logo.png"
                  alt="Nudra"
                  className="w-28 h-auto dark:brightness-0 dark:invert transition-all"
                />
              </div>
            </Link>

            {/* Mobile close button */}
            <button
              id="sidebar-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#66736b] dark:text-slate-400 hover:text-[#063e33] dark:hover:text-white hover:bg-[#faf9f3] dark:hover:bg-white/5 lg:hidden cursor-pointer"
              aria-label="Close Sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Section: Menu */}
          <div className="mb-6">
            <p className="px-3 text-[9px] font-bold text-[#63815c] dark:text-emerald-400 uppercase tracking-[2px] mb-2.5 flex items-center gap-1">
              <span>✦</span>
              <span>Menu · القائمة</span>
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
                      `flex items-center justify-between px-4 py-2.5 rounded-full text-[13px] font-semibold transition-all duration-200 ${
                        isActive
                          ? 'bg-[#063e33] text-white shadow-xs dark:ring-1 dark:ring-[#e0f36b]/30'
                          : 'text-[#66736b] dark:text-slate-400 hover:text-[#063e33] dark:hover:text-white hover:bg-[#e8edda]/60 dark:hover:bg-white/5'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3">
                          <Icon
                            className={`w-[17px] h-[17px] transition-colors ${
                              isActive ? 'text-white dark:text-[#e0f36b]' : 'text-[#66736b] dark:text-slate-400'
                            }`}
                            strokeWidth={1.8}
                          />
                          <span>{item.name}</span>
                          {item.path === '/academic' && gradeBadge && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 ${
                              isActive
                                ? 'bg-[#e0f36b] text-[#063e33]'
                                : 'bg-[#e8edda] dark:bg-emerald-950 dark:text-emerald-300 text-[#063e33]'
                            }`}>
                              {gradeBadge}
                            </span>
                          )}
                        </div>
                        {item.badge && (
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                              isActive
                                ? 'bg-[#e0f36b] text-[#063e33]'
                                : 'bg-[#e0f36b]/60 dark:bg-[#e0f36b]/20 dark:text-[#e0f36b] text-[#063e33]'
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

        {/* Bottom Section: User Profile Menu & Status */}
        <div className="space-y-2 pt-4 border-t border-[#063e33]/8 dark:border-white/10">
          <ProfileMenu showName align="left" openUp onNavigate={onClose} />

          {user?.role === 'instructor' && (
            <Link
              to="/instructor/dashboard"
              className="flex items-center justify-between p-3 rounded-full bg-[#e8edda] dark:bg-white/5 hover:bg-[#e0f36b]/40 dark:hover:bg-white/10 text-xs font-bold text-[#063e33] dark:text-white transition-colors group px-4"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#063e33] dark:bg-[#e0f36b]" />
                <span>Instructor Studio</span>
              </div>
              <span className="text-[9px] bg-[#063e33] text-white px-2 py-0.5 rounded-full font-bold">
                PRO
              </span>
            </Link>
          )}

          <div className="px-3 pt-1 text-[10px] text-[#66736b] dark:text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#63815c] dark:bg-[#e0f36b]" />
              <span>Nudra v2.4</span>
            </span>
            <span className="text-[#a6ba49] dark:text-[#e0f36b] text-xs">✦</span>
          </div>
        </div>
      </aside>
    </>
  );
};
