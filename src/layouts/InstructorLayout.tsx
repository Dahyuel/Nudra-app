import React, { useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Upload,
  Users,
  DollarSign,
  TrendingUp,
  GraduationCap,
  Menu,
  X,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ProfileMenu } from '../components/ProfileMenu';

export const InstructorLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const organization = user?.organizationContext;
  const organizationInstructor = Boolean(organization && user?.organizationContext?.membership?.role === 'instructor');
  const scopedPath = (path: string) => organization
    ? `${path}?org=${encodeURIComponent(organization.slug)}`
    : path;

  const navItems = [
    { name: 'Dashboard', path: '/instructor/dashboard', icon: LayoutDashboard },
    { name: 'My Courses', path: '/instructor/courses', icon: BookOpen },
    { name: 'Upload Course', path: '/instructor/upload', icon: Upload },
    ...(!organizationInstructor ? [
      { name: 'Students', path: '/instructor/students', icon: Users },
      { name: 'Earnings', path: '/instructor/earnings', icon: DollarSign },
      { name: 'Analytics', path: '/instructor/analytics', icon: TrendingUp },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex font-sans antialiased text-[#1B1B1B]">
      {/* 1. Desktop Left Sidebar (Instructor Style) */}
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 z-30 bg-white border-r border-gray-100 shadow-sm p-6 justify-between" style={organization ? { '--org-primary': organization.primaryColor || '#2D6A4F' } as React.CSSProperties : undefined}>
        <div className="space-y-6">
          {/* Logo / Brand */}
          <Link to={organization ? scopedPath('/instructor/dashboard') : '/'} className="flex flex-col items-start gap-2 px-2 py-4">
            {organization?.logoUrl ? <img src={organization.logoUrl} alt={organization.name} className="h-10 max-w-36 rounded-lg object-contain" /> : <img src="/nudra-text-logo.png" alt="Nudra" className="w-36 h-auto" />}
            <span className="text-[10px] font-black uppercase bg-emerald-100 text-[#2D6A4F] px-1.5 py-0.5 rounded">
              {organization ? `${organization.name} instructor` : 'Instructor'}
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="space-y-1 pt-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <NavLink
                  key={item.name}
                  to={scopedPath(item.path)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 ${
                    isActive
                      ? 'bg-[#2D6A4F] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-[#F8FAF9]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Bottom Switcher: Return to Student Portal */}
        <div className="space-y-3 pt-6 border-t border-gray-100">
          <Link
            to={organization ? `/organization?org=${encodeURIComponent(organization.slug)}` : '/dashboard'}
            className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 text-[#2D6A4F] text-xs font-bold hover:bg-emerald-100/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              <span>{organization ? `${organization.name} portal` : 'Student Portal'}</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </Link>

          {/* Instructor Profile menu (opens upward: it sits at the bottom of the sidebar) */}
          <ProfileMenu showName align="left" openUp />
        </div>
      </aside>

      {/* 2. Main Content Area */}
    <div className="flex-1 flex flex-col lg:pl-64 min-w-0" style={organization ? { '--org-primary': organization.primaryColor || '#2D6A4F' } as React.CSSProperties : undefined}>
        {/* Top Navbar */}
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:inline-block">
              {organization ? `${organization.name} Instructor` : 'Instructor Studio'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={scopedPath('/instructor/upload')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] transition-colors shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Create New Course</span>
            </Link>

            <Link
              to={organization ? `/organization?org=${encodeURIComponent(organization.slug)}` : '/student-portal'}
              className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-[#F8FAF9] transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="Switch to Student View"
            >
              <GraduationCap className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 bg-white h-full p-6 flex flex-col justify-between shadow-2xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Link to={organization ? scopedPath('/instructor/dashboard') : '/'} className="flex items-center gap-2">
                  {organization?.logoUrl ? <img src={organization.logoUrl} alt={organization.name} className="h-10 max-w-36 rounded-lg object-contain" /> : <img src="/nudra-text-logo.png" alt="Nudra" className="w-36 h-auto" />}
                </Link>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.name}
                      to={scopedPath(item.path)}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-[#2D6A4F] text-white'
                          : 'text-gray-600 hover:bg-[#F8FAF9]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.name}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-3">
              <Link
                to={organization ? `/organization?org=${encodeURIComponent(organization.slug)}` : '/student-portal'}
                onClick={() => setMobileMenuOpen(false)}
                className="p-3 rounded-xl bg-emerald-50 text-[#2D6A4F] text-xs font-bold flex items-center justify-between"
              >
                <span>{organization ? `Back to ${organization.name}` : 'Back to Student Portal'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <ProfileMenu showName align="left" openUp onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
