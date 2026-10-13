import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Navbar } from '../components/Navbar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAuth, homePathFor } from '../context/AuthContext';

export const DashboardLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  if (user?.role === 'organization_manager' &&
      !location.pathname.startsWith('/organization') &&
      !['/settings', '/help'].includes(location.pathname)) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  return (
    <div className="min-h-screen bg-[#faf9f3] dark:bg-[#0b141a] flex selection:bg-[#e0f36b] selection:text-[#063e33] dark:selection:bg-[#e0f36b]/30 dark:selection:text-[#e0f36b] transition-colors duration-200">
      {/* Left Editorial Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Navbar */}
        <Navbar onToggleSidebar={() => setSidebarOpen(true)} />

        {/* Dynamic Page Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
