import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homePathFor, isApprovedInstructor } from '../context/AuthContext';

interface ProtectedRouteProps {
  requiredRole?: 'student' | 'instructor' | 'admin';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAF9]">
        <div className="w-10 h-10 rounded-full border-4 border-[#B7E4C7] border-t-[#2D6A4F] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/login${location.search}`} replace />;
  }

  if (user.organizationContext && user.role === 'student' &&
      !location.pathname.startsWith('/organization') && !location.pathname.startsWith('/course/') &&
      location.pathname !== '/settings') {
    return <Navigate to={homePathFor(user)} replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  // Applicants can't use the Instructor Studio until approved.
  if (requiredRole === 'instructor' && !isApprovedInstructor(user)) {
    return <Navigate to="/instructor/pending" replace />;
  }

  return <Outlet />;
};
